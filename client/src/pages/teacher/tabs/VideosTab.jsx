import { useEffect, useState, useCallback, useRef } from 'react';
import { Video, Trash2, Eye, FileUp, File as FileIcon } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import ChunkedUploader from '../../../components/ChunkedUploader';
import { Card, Badge, Button, EmptyState, Spinner } from '../../../components/ui';

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

export default function VideosTab({ courseId }) {
  const toast = useToast();
  const [videos, setVideos] = useState(null);
  const [files, setFiles] = useState(null);
  const fileInput = useRef(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const load = useCallback(() => {
    api.get(`/videos/courses/${courseId}`).then(({ data }) => setVideos(data)).catch(() => setVideos([]));
    api.get(`/files/courses/${courseId}?limit=100`).then(({ data }) => setFiles(data.items)).catch(() => setFiles([]));
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  // Poll while any video is processing.
  useEffect(() => {
    if (!videos?.some((v) => ['processing', 'uploading'].includes(v.status))) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [videos, load]);

  const deleteVideo = async (id) => {
    if (!window.confirm('Delete this video? Lessons using it will stop playing.')) return;
    try { await api.delete(`/videos/${id}`); toast.success('Video deleted'); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const uploadDocument = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/files/courses/${courseId}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('File uploaded');
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setUploadingDoc(false); e.target.value = ''; }
  };

  const deleteFile = async (id) => {
    try { await api.delete(`/files/${id}`); load(); } catch (err) { toast.error(apiError(err)); }
  };

  const statusColor = { ready: 'green', processing: 'amber', uploading: 'blue', failed: 'red' };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-semibold text-surface-800 dark:text-surface-100">Videos</h3>
        <ChunkedUploader courseId={courseId} onUploaded={load} />
        {!videos ? <Spinner /> : videos.length === 0 ? (
          <Card><EmptyState icon={<Video size={24} />} title="No videos yet" /></Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {videos.map((v) => (
              <div key={v._id} className="flex items-center gap-3 px-4 py-3">
                <Video size={18} className="shrink-0 text-surface-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{v.title}</p>
                  <p className="text-xs text-surface-400">
                    {fmtDur(v.durationSeconds)} · {fmtSize(v.sizeBytes || 0)} · <Eye size={11} className="inline" /> {v.viewCount}
                    {v.status === 'uploading' && ` · ${v.receivedChunks?.length || 0}/${v.totalChunks} chunks`}
                  </p>
                </div>
                <Badge color={statusColor[v.status]}>{v.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => deleteVideo(v._id)}><Trash2 size={14} className="text-rose-400" /></Button>
              </div>
            ))}
          </Card>
        )}
        <p className="text-xs text-surface-400">
          Videos are encrypted at rest and streamed through signed, expiring URLs. Install ffmpeg on the server for automatic duration detection and thumbnails.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">Documents & resources</h3>
          <input ref={fileInput} type="file" className="hidden" onChange={uploadDocument}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.txt,.xls,.xlsx,.png,.jpg,.jpeg" />
          <Button size="sm" variant="outline" loading={uploadingDoc} onClick={() => fileInput.current?.click()}>
            <FileUp size={14} /> Upload file
          </Button>
        </div>
        {!files ? <Spinner /> : files.length === 0 ? (
          <Card><EmptyState icon={<FileIcon size={24} />} title="No files yet" subtitle="PDFs, slides, and resources for your lessons." /></Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {files.map((f) => (
              <div key={f._id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon size={17} className="shrink-0 text-surface-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{f.originalName}</p>
                  <p className="text-xs text-surface-400">{fmtSize(f.sizeBytes)} · {f.scope}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteFile(f._id)}><Trash2 size={14} className="text-rose-400" /></Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
