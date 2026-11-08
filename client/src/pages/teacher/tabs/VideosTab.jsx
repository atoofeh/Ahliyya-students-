import { useEffect, useState, useCallback, useRef } from 'react';
import { Video, Trash2, Eye, FileUp, File as FileIcon, Play, Users, ChevronUp, ChevronDown } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { useLanguage } from '../../../hooks/useLanguage';
import ChunkedUploader from '../../../components/ChunkedUploader';
import { Card, Badge, Button, EmptyState, Spinner, Modal } from '../../../components/ui';
import VideoPlayer from '../../../components/VideoPlayer';
import VideoViewsModal from '../../../components/VideoViewsModal';

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

export default function VideosTab({ courseId }) {
  const toast = useToast();
  const { t } = useLanguage();
  // Staff preview. No lessonId is passed, so the player skips its progress
  // heartbeat — watch counts and completion belong to students only.
  const [preview, setPreview] = useState(null);
  const [viewsOf, setViewsOf] = useState(null);
  const [videos, setVideos] = useState(null);
  const [files, setFiles] = useState(null);
  const fileInput = useRef(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [reordering, setReordering] = useState(false);

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
    if (!window.confirm(t('vid.confirmDelete'))) return;
    try { await api.delete(`/videos/${id}`); toast.success(t('vid.deleted')); load(); }
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
      toast.success(t('vid.fileUploaded'));
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setUploadingDoc(false); e.target.value = ''; }
  };

  const deleteFile = async (id) => {
    try { await api.delete(`/files/${id}`); load(); } catch (err) { toast.error(apiError(err)); }
  };

  const moveVideo = async (index, dir) => {
    if (!videos) return;
    const target = index + dir;
    if (target < 0 || target >= videos.length) return;
    const ids = videos.map((item) => item._id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setReordering(true);
    try {
      await api.post(`/courses/${courseId}/reorder`, { videos: ids });
      toast.success(t('vid.orderSaved'));
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setReordering(false); }
  };

  const statusColor = { ready: 'green', processing: 'amber', uploading: 'blue', failed: 'red' };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-semibold text-surface-800 dark:text-surface-100">{t('vid.videos')}</h3>
        <p className="text-xs text-surface-400">{t('vid.orderHint')}</p>
        <ChunkedUploader courseId={courseId} onUploaded={load} />
        {!videos ? <Spinner /> : videos.length === 0 ? (
          <Card><EmptyState icon={<Video size={24} />} title={t('vid.noVideos')} /></Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {videos.map((v, index) => (
              <div key={v._id} className="flex items-center gap-3 px-4 py-3">
                <Video size={18} className="shrink-0 text-surface-400" />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{v.title}</p>
                  <p className="text-xs text-surface-400">
                    {fmtDur(v.durationSeconds)} · {fmtSize(v.sizeBytes || 0)} · <Eye size={11} className="inline" /> {v.viewCount}
                    {v.status === 'uploading' && ` · ${t('vid.chunks', { received: v.receivedChunks?.length || 0, total: v.totalChunks })}`}
                  </p>
                </div>
                <Badge color={statusColor[v.status]}>{v.status}</Badge>
                <div className="flex shrink-0 items-center">
                  <Button size="sm" variant="ghost" aria-label={t('vid.moveVideoUp', { title: v.title })}
                    disabled={index === 0 || reordering} onClick={() => moveVideo(index, -1)}><ChevronUp size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label={t('vid.moveVideoDown', { title: v.title })}
                    disabled={index === videos.length - 1 || reordering} onClick={() => moveVideo(index, 1)}><ChevronDown size={14} /></Button>
                </div>
                {v.status === 'ready' && (
                  <>
                    <Button size="sm" variant="ghost" aria-label={t('vid.previewOf', { title: v.title })} onClick={() => setPreview(v)}>
                      <Play size={14} /> {t('vid.preview')}
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={t('vid.whoWatchedOf', { title: v.title })} onClick={() => setViewsOf(v)}>
                      <Users size={14} /> {t('vid.views')}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" aria-label={t('vid.deleteOf', { title: v.title })} onClick={() => deleteVideo(v._id)}><Trash2 size={14} className="text-rose-400" /></Button>
              </div>
            ))}
          </Card>
        )}
        <p className="text-xs text-surface-400">
          {t('vid.encryptedNote')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">{t('vid.documents')}</h3>
          <input ref={fileInput} type="file" className="hidden" onChange={uploadDocument}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.txt,.xls,.xlsx,.png,.jpg,.jpeg" />
          <Button size="sm" variant="outline" loading={uploadingDoc} onClick={() => fileInput.current?.click()}>
            <FileUp size={14} /> {t('vid.uploadFile')}
          </Button>
        </div>
        {!files ? <Spinner /> : files.length === 0 ? (
          <Card><EmptyState icon={<FileIcon size={24} />} title={t('vid.noFiles')} subtitle={t('vid.noFilesHint')} /></Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {files.map((f) => (
              <div key={f._id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon size={17} className="shrink-0 text-surface-400" />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{f.originalName}</p>
                  <p className="text-xs text-surface-400">{fmtSize(f.sizeBytes)} · {f.scope}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteFile(f._id)}><Trash2 size={14} className="text-rose-400" /></Button>
              </div>
            ))}
          </Card>
        )}
      </div>
      <VideoViewsModal courseId={courseId} video={viewsOf} onClose={() => setViewsOf(null)} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title || t('vid.previewTitle')} wide>
        {preview && (
          <div className="space-y-3">
            <VideoPlayer key={preview._id} videoId={preview._id} />
            <p className="text-xs text-surface-400">
              {t('vid.staffPreview')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
