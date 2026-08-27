import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Trash2, Send } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, Input, Textarea, Toggle, Badge, Spinner, EmptyState } from '../../components/ui';

export default function AdminAnnouncements() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/announcements/feed').then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    setBusy(true);
    try {
      await api.post('/announcements/global', form);
      toast.success('Announcement published and all users notified');
      setForm({ title: '', body: '', pinned: false });
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try { await api.delete(`/announcements/${id}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Platform announcements</h1>
        <p className="text-sm text-surface-500">Broadcast to every user; each receives an in-app notification.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="h-fit space-y-4 p-5">
          <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100">
            <Megaphone size={17} /> New announcement
          </p>
          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Message" rows={6} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          <Toggle label="Pin to top" checked={form.pinned} onChange={(v) => setForm((f) => ({ ...f, pinned: v }))} />
          <Button className="w-full" loading={busy} onClick={publish} disabled={!form.title.trim() || !form.body.trim()}>
            <Send size={15} /> Publish to everyone
          </Button>
        </Card>

        <div className="space-y-3">
          {!items ? <Spinner /> : items.length === 0 ? (
            <Card><EmptyState title="No announcements yet" /></Card>
          ) : items.map((a) => (
            <Card key={a._id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {a.pinned && <Badge color="amber">Pinned</Badge>}
                  <Badge color={a.course ? 'blue' : 'primary'}>{a.course ? a.course.title : 'Platform'}</Badge>
                  <p className="font-medium text-surface-900 dark:text-white">{a.title}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(a._id)}>
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-surface-500">{a.body}</p>
              <p className="mt-2 text-xs text-surface-400">{a.author?.name} · {new Date(a.publishedAt).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
