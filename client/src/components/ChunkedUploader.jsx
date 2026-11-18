import { useEffect, useRef, useState } from 'react';
import { UploadCloud, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { uploadChunks } from '../api/uploadChunks';
import { useLanguage } from '../hooks/useLanguage';
import { Button, ProgressBar } from './ui';

/**
 * Resumable chunked video uploader.
 * Flow: init → PUT chunks (parallelism 3, resume via server chunk inventory)
 * → complete (server assembles, probes, encrypts). Interrupted uploads
 * resume from the server's last confirmed chunk while this page stays open.
 */
export default function ChunkedUploader({ courseId, onUploaded }) {
  const inputRef = useRef(null);
  const activeRef = useRef(null);
  const { t } = useLanguage();
  const [state, setState] = useState({ phase: 'idle' }); // idle|uploading|processing|done|error|paused
  useEffect(() => () => {
    const run = activeRef.current;
    activeRef.current = null;
    run?.controller.abort();
  }, []);

  const upload = async (file, resume) => {
    activeRef.current?.controller.abort();
    const run = { controller: new AbortController(), paused: false };
    activeRef.current = run;
    const current = () => activeRef.current === run;
    try {
      let uploadId = resume?.uploadId;
      let chunkSize = resume?.chunkSize;
      let totalChunks = resume?.totalChunks;
      let receivedChunks = resume?.receivedChunks || [];
      setState({ phase: 'uploading', progress: 0, file, uploadId, chunkSize, totalChunks });

      if (resume?.checkStatus) {
        const { data } = await api.get(`/videos/uploads/${uploadId}/status`, { signal: run.controller.signal });
        run.controller.signal.throwIfAborted();
        if (!current()) return;
        if (data.status === 'processing' || data.status === 'ready') {
          setState({ phase: 'done', file });
          onUploaded?.({ videoId: data.videoId, status: data.status });
          return;
        }
        if (data.status === 'failed') throw new Error(t('uploader.processingFailed'));
        receivedChunks = data.receivedChunks;
      }

      if (!uploadId) {
        const { data } = await api.post(`/videos/courses/${courseId}/uploads`, {
          title: file.name.replace(/\.[^.]+$/, ''),
          originalName: file.name,
          sizeBytes: file.size,
          mimeType: file.type || 'video/mp4',
        }, { signal: run.controller.signal });
        uploadId = data.uploadId;
        chunkSize = data.chunkSize;
        totalChunks = data.totalChunks;
      }

      run.controller.signal.throwIfAborted();
      if (!current()) return;
      setState({ phase: 'uploading', progress: (new Set(receivedChunks).size / totalChunks) * 100, file, uploadId, chunkSize, totalChunks });
      await uploadChunks({
        file, chunkSize, totalChunks, receivedChunks, signal: run.controller.signal,
        onProgress: (progress) => { if (current()) setState((s) => ({ ...s, progress })); },
        postChunk: async (index, blob, signal) => {
          const form = new FormData();
          form.append('chunkIndex', String(index));
          form.append('chunk', blob, `chunk-${index}`);
          await api.post(`/videos/uploads/${uploadId}/chunks`, form, {
            headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000, signal,
          });
        },
      });
      run.controller.signal.throwIfAborted();
      if (!current()) return;
      setState((s) => ({ ...s, phase: 'processing' }));
      const { data: completed } = await api.post(`/videos/uploads/${uploadId}/complete`, {}, { signal: run.controller.signal });
      if (!current()) return;
      setState({ phase: 'done', file });
      onUploaded?.(completed);
    } catch (err) {
      if (!current()) return;
      if (run.paused) {
        setState((s) => ({ ...s, phase: 'paused' }));
      } else {
        setState((s) => ({ ...s, phase: 'error', error: apiError(err, t('uploader.failed')) }));
      }
    } finally {
      if (current()) activeRef.current = null;
    }
  };

  const resumeUpload = async () => {
    const { uploadId, file, chunkSize, totalChunks } = state;
    if (!uploadId) { await upload(file); return; }
    await upload(file, { uploadId, chunkSize, totalChunks, checkStatus: true });
  };

  const pick = (e) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-surface-300 dark:border-surface-600 p-5 text-center">
      <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" className="hidden" onChange={pick} />

      {state.phase === 'idle' && (
        <button onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2 py-4 text-surface-500 hover:text-primary-600">
          <UploadCloud size={32} />
          <span className="text-sm font-medium">{t('uploader.choose')}</span>
          <span className="text-xs text-surface-400">{t('uploader.formats')}</span>
        </button>
      )}

      {(state.phase === 'uploading' || state.phase === 'paused') && (
        <div className="space-y-3">
          <p className="truncate text-sm font-medium text-surface-700 dark:text-surface-200">{state.file?.name}</p>
          <ProgressBar value={state.progress} />
          <p className="text-xs text-surface-400">{t('uploader.progress', { n: Math.floor(state.progress || 0) })}</p>
          {state.phase === 'uploading'
            ? <Button size="sm" variant="outline" onClick={() => { const run = activeRef.current; if (run) { run.paused = true; run.controller.abort(); } }}>{t('uploader.pause')}</Button>
            : <Button size="sm" onClick={resumeUpload}><RotateCcw size={14} /> {t('uploader.resume')}</Button>}
        </div>
      )}

      {state.phase === 'processing' && (
        <div className="space-y-2 py-2">
          <ProgressBar value={100} />
          <p className="text-sm text-surface-500">{t('uploader.processing')}</p>
        </div>
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col items-center gap-2 py-2 text-emerald-600">
          <CheckCircle2 size={28} />
          <p className="text-sm font-medium">{t('uploader.complete')}</p>
          <Button size="sm" variant="outline" onClick={() => setState({ phase: 'idle' })}>{t('uploader.another')}</Button>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="flex flex-col items-center gap-2 py-2 text-rose-500">
          <AlertTriangle size={26} />
          <p className="text-sm">{state.error}</p>
          <div className="flex gap-2">
            {state.uploadId && <Button size="sm" onClick={resumeUpload}><RotateCcw size={14} /> {t('uploader.retry')}</Button>}
            <Button size="sm" variant="outline" onClick={() => setState({ phase: 'idle' })}>{t('uploader.restart')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
