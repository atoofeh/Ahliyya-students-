import { useEffect, useState, useCallback, useRef } from 'react';
import { Video, Trash2, Eye, FileUp, File as FileIcon, Play, Users } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { useLanguage } from '../../../hooks/useLanguage';
import { useConfirm } from '../../../hooks/useConfirm';
import { useDragSensors, dragStyle } from '../../../hooks/useDragSensors';
import DragHandle from '../../../components/DragHandle';
import ChunkedUploader from '../../../components/ChunkedUploader';
import { Card, Badge, Button, EmptyState, Spinner, Modal } from '../../../components/ui';
import VideoPlayer from '../../../components/VideoPlayer';
import VideoViewsModal from '../../../components/VideoViewsModal';

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

/** One video row, dragged by the handle at its end. */
function VideoRow({ video, t, reordering, statusColor, onPreview, onViews, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: video._id });
  return (
    <div
      ref={setNodeRef}
      style={dragStyle(transform, transition)}
      className={`flex items-center gap-3 px-4 py-3 ${isDragging ? 'relative z-10 bg-white opacity-90 shadow-float dark:bg-surface-800' : ''}`}
    >
      <Video size={18} className="shrink-0 text-surface-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{video.title}</p>
        <p className="text-xs text-surface-400">
          {fmtDur(video.durationSeconds)} · {fmtSize(video.sizeBytes || 0)} · <Eye size={11} className="inline" /> {video.viewCount}
          {video.status === 'uploading' && ` · ${t('vid.chunks', { received: video.receivedChunks?.length || 0, total: video.totalChunks })}`}
        </p>
      </div>
      <Badge color={statusColor[video.status]}>{video.status}</Badge>
      {video.status === 'ready' && (
        <>
          <Button size="sm" variant="ghost" aria-label={t('vid.previewOf', { title: video.title })} onClick={onPreview}>
            <Play size={14} /> <span className="hidden sm:inline">{t('vid.preview')}</span>
          </Button>
          <Button size="sm" variant="ghost" aria-label={t('vid.whoWatchedOf', { title: video.title })} onClick={onViews}>
            <Users size={14} /> <span className="hidden sm:inline">{t('vid.views')}</span>
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" aria-label={t('vid.deleteOf', { title: video.title })} onClick={onDelete}>
        <Trash2 size={14} className="text-rose-400" />
      </Button>
      <DragHandle attributes={attributes} listeners={listeners} disabled={reordering}
        label={t('vid.dragVideo', { title: video.title })} />
    </div>
  );
}

export default function VideosTab({ courseId }) {
  const toast = useToast();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const sensors = useDragSensors();
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
    if (!(await confirm(t('vid.confirmDelete')))) return;
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

  const onDragEnd = async ({ active, over }) => {
    if (!videos || !over || active.id === over.id) return;
    const ids = videos.map((item) => item._id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(ids, from, to);
    // Show the new order at once; load() below replaces it with the saved one.
    setVideos((current) => arrayMove(current, from, to));
    setReordering(true);
    try {
      await api.post(`/courses/${courseId}/reorder`, { videos: next });
      toast.success(t('vid.orderSaved'));
      load();
    } catch (err) { toast.error(apiError(err)); load(); }
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={videos.map((v) => v._id)} strategy={verticalListSortingStrategy}>
              <Card className="divide-y divide-surface-100 dark:divide-surface-700">
                {videos.map((v) => (
                  <VideoRow
                    key={v._id}
                    video={v}
                    t={t}
                    reordering={reordering}
                    statusColor={statusColor}
                    onPreview={() => setPreview(v)}
                    onViews={() => setViewsOf(v)}
                    onDelete={() => deleteVideo(v._id)}
                  />
                ))}
              </Card>
            </SortableContext>
          </DndContext>
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
