import { useEffect, useState, useCallback, useRef } from 'react';
import { Newspaper, ImagePlus, X, Pin, Pencil, Trash2, Send } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { isAdminRole } from '../utils/roles';
import AuthedImage from '../components/AuthedImage';
import { Card, Button, Modal, Input, Textarea, Toggle, Badge, EmptyState, Pagination, PageIntro } from '../components/ui';
import { SkeletonCard } from '../components/Skeletons';
import ErrorState from '../components/ErrorState';

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString();
};

/**
 * The institution's feed.
 *
 * A wall, not a notification channel: posting here buzzes nobody, which is
 * what makes it safe to put a photo of a prize-giving on. Administrators
 * write; everyone signed in reads.
 */
export default function NewsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const canPost = isAdminRole(user?.role);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // null | {} | post
  const [form, setForm] = useState({ title: '', body: '', images: [], pinned: false });
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/news', { params: { page, limit: 12 } });
      setError(null);
      setResult(data);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, [page]);
  useEffect(() => { const t0 = setTimeout(load, 0); return () => clearTimeout(t0); }, [load]);

  const openNew = () => { setForm({ title: '', body: '', images: [], pinned: false }); setModal({}); };
  const openEdit = (p) => {
    setForm({ title: p.title || '', body: p.body || '', images: p.images || [], pinned: !!p.pinned });
    setModal(p);
  };

  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files.slice(0, 10 - form.images.length)) {
        const body = new FormData();
        body.append('file', file);
        const { data } = await api.post('/files/news-image', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setForm((f) => ({ ...f, images: [...f.images, data._id] }));
      }
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(), body: form.body.trim(),
        images: form.images, pinned: form.pinned,
      };
      if (modal?._id) await api.patch(`/news/${modal._id}`, payload);
      else await api.post('/news', payload);
      setModal(null);
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(t('news.deleteConfirm'))) return;
    try { await api.delete(`/news/${p._id}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!result) return <div className="space-y-4"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>;

  const empty = form.images.length === 0 && !form.title.trim() && !form.body.trim();

  return (
    // One column, capped at a readable width — a feed is read down, not across.
    <div className="mx-auto max-w-2xl space-y-5">
      <PageIntro
        title={t('news.title')}
        subtitle={t('news.subtitle')}
        actions={canPost ? (
          <Button onClick={openNew}><Send size={15} /> {t('news.newPost')}</Button>
        ) : undefined}
      />

      {result.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Newspaper size={26} />} title={t('news.empty')} subtitle={t('news.emptyHint')} />
        </Card>
      ) : (
        <div className="space-y-5">
          {result.items.map((p) => (
            <Card key={p._id} className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
                  {(p.author?.name || '?').charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-semibold text-surface-800 dark:text-surface-100">{p.author?.name}</p>
                  <p className="text-xs text-surface-400">{timeAgo(p.createdAt)}</p>
                </div>
                {p.pinned && <Badge color="gold"><Pin size={11} className="me-1 inline" />{t('news.pinned')}</Badge>}
                {canPost && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label={t('news.edit')}>
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label={t('news.delete')}>
                      <Trash2 size={14} className="text-rose-400" />
                    </Button>
                  </>
                )}
              </div>

              {p.images?.length > 0 && (
                <div className={p.images.length === 1
                  ? 'flex justify-center bg-surface-100 dark:bg-surface-800'
                  : 'grid grid-cols-2 gap-0.5'}>
                  {p.images.map((id) => (
                    <AuthedImage
                      key={id}
                      fileId={id}
                      alt=""
                      className={p.images.length === 1
                        ? 'max-h-[28rem] w-auto max-w-full object-contain'
                        : 'h-44 w-full object-cover'}
                    />
                  ))}
                </div>
              )}

              {(p.title || p.body) && (
                <div className="px-4 py-3">
                  {p.title && <p dir="auto" className="font-display font-bold text-surface-900 dark:text-white">{p.title}</p>}
                  {p.body && <p dir="auto" className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-surface-600 dark:text-surface-300">{p.body}</p>}
                </div>
              )}
            </Card>
          ))}
          <Pagination meta={result.meta} onPage={setPage} />
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?._id ? t('news.edit') : t('news.newPost')} wide>
        <div className="space-y-4">
          <Input label={t('news.postTitle')} value={form.title} dir="auto"
            placeholder={t('news.titlePlaceholder')}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label={t('news.postBody')} rows={4} value={form.body} dir="auto"
            placeholder={t('news.postBodyPlaceholder')}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />

          {form.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {form.images.map((id) => (
                <div key={id} className="relative">
                  <AuthedImage fileId={id} className="h-24 w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, images: f.images.filter((i) => i !== id) }))}
                    aria-label={t('news.delete')}
                    className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInput} type="file" multiple className="hidden"
            accept="image/png,image/jpeg,image/gif,image/webp" onChange={addPhotos} />
          <Button variant="outline" loading={busy} onClick={() => fileInput.current?.click()}
            disabled={form.images.length >= 10}>
            <ImagePlus size={15} /> {t('news.addPhotos')}
          </Button>

          <Toggle label={t('news.pin')} checked={form.pinned}
            onChange={(v) => setForm((f) => ({ ...f, pinned: v }))} />

          <Button className="w-full" loading={busy} onClick={publish} disabled={empty}>
            {modal?._id ? t('news.saveChanges') : t('news.publish')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
