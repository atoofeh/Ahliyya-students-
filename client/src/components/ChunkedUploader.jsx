import { useRef, useState } from 'react';
import { UploadCloud, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { Button, ProgressBar } from './ui';

/**
 * Resumable chunked video uploader.
 * Flow: init → PUT chunks (parallelism 3, resume via server chunk inventory)
 * → complete (server assembles, probes, encrypts). Interrupted uploads
 * resume from the last confirmed chunk after re-selecting the same file.
 */
export default function ChunkedUploader({ courseId, onUploaded }) {
  const inputRef = useRef(null);
  const abortRef = useRef(false);
  const [state, setState] = useState({ phase: 'idle' }); // idle|uploading|processing|done|error|paused

  const upload = async (file, resume) => {
    abortRef.current = false;
    try {
      let uploadId = resume?.uploadId;
      let chunkSize = resume?.chunkSize;
      let totalChunks = resume?.totalChunks;
      let have = new Set(resume?.receivedChunks || []);

      if (!uploadId) {
        const { data } = await api.post(`/videos/courses/${courseId}/uploads`, {
          title: file.name.replace(/\.[^.]+$/, ''),
          originalName: file.name,
          sizeBytes: file.size,
          mimeType: file.type || 'video/mp4',
        });
        uploadId = data.uploadId;
        chunkSize = data.chunkSize;
        totalChunks = data.totalChunks;
      }

      setState({ phase: 'uploading', progress: (have.size / totalChunks) * 100, file, uploadId, chunkSize, totalChunks });

      const pending = [];
      for (let i = 0; i < totalChunks; i++) if (!have.has(i)) pending.push(i);

      const CONCURRENCY = 3;
      let done = have.size;
      let cursor = 0;

      const worker = async () => {
        while (cursor < pending.length) {
          if (abortRef.current) throw new Error('paused');
          const index = pending[cursor++];
          const blob = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
          const form = new FormData();
          form.append('chunkIndex', String(index));
          form.append('chunk', blob, `chunk-${index}`);
          // Rate-limited chunks are retried with backoff instead of failing the upload.
          for (let attempt = 0; ; attempt++) {
            try {
              await api.post(`/videos/uploads/${uploadId}/chunks`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 120000,
              });
              break;
            } catch (err) {
              if (err.response?.status !== 429 || attempt >= 5) throw err;
              const retryAfter = Number(err.response.headers['retry-after']) || 2 ** attempt;
              await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
              if (abortRef.current) throw new Error('paused', { cause: err });
            }
          }
          done++;
          setState((s) => ({ ...s, progress: (done / totalChunks) * 100 }));
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      setState((s) => ({ ...s, phase: 'processing' }));
      const { data: completed } = await api.post(`/videos/uploads/${uploadId}/complete`);
      setState({ phase: 'done', file });
      onUploaded?.(completed);
    } catch (err) {
      if (err.message === 'paused') {
        setState((s) => ({ ...s, phase: 'paused' }));
      } else {
        setState((s) => ({ ...s, phase: 'error', error: apiError(err, 'Upload failed') }));
      }
    }
  };

  const resumeUpload = async () => {
    const { uploadId, file, chunkSize, totalChunks } = state;
    try {
      const { data } = await api.get(`/videos/uploads/${uploadId}/status`);
      await upload(file, { uploadId, chunkSize, totalChunks, receivedChunks: data.receivedChunks });
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', error: apiError(err) }));
    }
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
          <span className="text-sm font-medium">Upload video (chunked & resumable)</span>
          <span className="text-xs text-surface-400">MP4, WebM, MOV, MKV — large files supported</span>
        </button>
      )}

      {(state.phase === 'uploading' || state.phase === 'paused') && (
        <div className="space-y-3">
          <p className="truncate text-sm font-medium text-surface-700 dark:text-surface-200">{state.file?.name}</p>
          <ProgressBar value={state.progress} />
          <p className="text-xs text-surface-400">{Math.floor(state.progress)}% uploaded</p>
          {state.phase === 'uploading'
            ? <Button size="sm" variant="outline" onClick={() => { abortRef.current = true; }}>Pause</Button>
            : <Button size="sm" onClick={resumeUpload}><RotateCcw size={14} /> Resume upload</Button>}
        </div>
      )}

      {state.phase === 'processing' && (
        <div className="space-y-2 py-2">
          <ProgressBar value={100} />
          <p className="text-sm text-surface-500">Processing & encrypting on server…</p>
        </div>
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col items-center gap-2 py-2 text-emerald-600">
          <CheckCircle2 size={28} />
          <p className="text-sm font-medium">Upload complete — video is processing</p>
          <Button size="sm" variant="outline" onClick={() => setState({ phase: 'idle' })}>Upload another</Button>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="flex flex-col items-center gap-2 py-2 text-rose-500">
          <AlertTriangle size={26} />
          <p className="text-sm">{state.error}</p>
          <div className="flex gap-2">
            {state.uploadId && <Button size="sm" onClick={resumeUpload}><RotateCcw size={14} /> Retry / resume</Button>}
            <Button size="sm" variant="outline" onClick={() => setState({ phase: 'idle' })}>Start over</Button>
          </div>
        </div>
      )}
    </div>
  );
}
