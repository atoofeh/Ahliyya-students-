import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Trash2, Send } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { useConfirm } from '../../hooks/useConfirm';
import { Card, Button, Input, Textarea, Toggle, Badge, Spinner, EmptyState } from '../../components/ui';
import useAnnouncementSend from '../../hooks/useAnnouncementSend';
import AnnouncementPhoto from '../../components/AnnouncementPhoto';
import AuthedImage from '../../components/AuthedImage';

export default function AdminAnnouncements() {
  const toast = useToast();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const [photo, setPhoto] = useState(null);
  const { send, busy, phase } = useAnnouncementSend('/announcements/global', '/files/news-image');

  const load = useCallback(() => {
    api.get('/announcements/feed').then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    try {
      const published = await send(form, photo);
      if (!published) return;
      toast.success(t('ann.published'));
      setForm({ title: '', body: '', pinned: false });
      setPhoto(null);
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const remove = async (id) => {
    if (!(await confirm(t('ann.confirmDelete')))) return;
    try { await api.delete(`/announcements/${id}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('ann.title')}</h1>
        <p className="text-sm text-surface-500">{t('ann.subtitle')}</p>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0 h-fit space-y-4 p-5">
          <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100">
            <Megaphone size={17} /> {t('ann.new')}
          </p>
          <Input label={t('ann.titleField')} dir="auto" disabled={busy} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label={t('ann.message')} dir="auto" rows={6} disabled={busy} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <AnnouncementPhoto file={photo} onChange={setPhoto} disabled={busy} />
          <Toggle label={t('ann.pinToTop')} checked={form.pinned} onChange={(v) => { if (!busy) setForm((f) => ({ ...f, pinned: v })); }} />
          <Button className="w-full" loading={busy} onClick={publish} disabled={busy || !form.title.trim() || !form.body.trim()}>
            {!busy && <Send size={15} />} {busy ? t(phase === 'uploading' ? 'ann.uploadingPhoto' : 'ann.sending') : t('ann.publishToEveryone')}
          </Button>
          {busy && <p role="status" className="text-xs text-surface-500">{t('ann.sendingHint')}</p>}
        </Card>

        <div className="min-w-0 space-y-3">
          {!items ? <Spinner /> : items.length === 0 ? (
            <Card><EmptyState title={t('ann.empty')} /></Card>
          ) : items.map((a) => (
            <Card key={a._id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {a.pinned && <Badge color="amber">{t('announcements.pinned')}</Badge>}
                  <Badge color={a.course ? 'blue' : 'primary'}>{a.course ? a.course.title : t('announcements.platform')}</Badge>
                  <p dir="auto" className="break-words font-medium text-surface-900 dark:text-white">{a.title}</p>
                </div>
                <Button size="sm" variant="ghost" className="min-w-11 shrink-0 xl:min-w-0" aria-label={t('ann.confirmDelete')} onClick={() => remove(a._id)}>
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
              <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm text-surface-500 [overflow-wrap:anywhere] xl:[overflow-wrap:normal]">{a.body}</p>
              <AuthedImage fileId={a.image} alt={a.title} className="mt-3 max-h-96 w-full rounded-xl object-contain" />
              <p className="mt-2 text-xs text-surface-400">{a.author?.name} · {new Date(a.publishedAt).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
