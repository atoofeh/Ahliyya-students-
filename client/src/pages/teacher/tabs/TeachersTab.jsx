import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Crown, X, Users } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { useLanguage } from '../../../hooks/useLanguage';
import { Card, Button, Input, Textarea, Badge, EmptyState, Modal } from '../../../components/ui';
import { SkeletonCard } from '../../../components/Skeletons';

/**
 * Who teaches this course.
 *
 * An invited colleague who accepts gets the same authority as the creator over
 * everything: content, students, quizzes, grading and Q&A moderation. Only the
 * creator (or an administrator) can remove one again.
 */
export default function TeachersTab({ courseId }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ teacher: '', message: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get(`/co-teaching/courses/${courseId}`);
    setData(res.data);
  }, [courseId]);
  useEffect(() => {
    const t = setTimeout(() => load().catch((err) => toast.error(apiError(err))), 0);
    return () => clearTimeout(t);
  }, [load, toast]);

  const run = async (fn, message) => {
    setBusy(true);
    try { await fn(); if (message) toast.success(message); await load(); }
    catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  const invite = () => run(async () => {
    await api.post(`/co-teaching/courses/${courseId}/invite`, {
      teacher: form.teacher.trim(),
      ...(form.message.trim() && { message: form.message.trim() }),
    });
    setInviteOpen(false);
    setForm({ teacher: '', message: '' });
  }, t('cot.toastSent'));

  const cancelInvite = (inviteId) => run(
    () => api.post(`/co-teaching/courses/${courseId}/invites/${inviteId}/cancel`),
    t('cot.toastWithdrawn')
  );

  const removeTeacher = (teacher) => {
    if (!window.confirm(t('cot.confirmRemove', { name: teacher.name }))) return;
    return run(() => api.delete(`/co-teaching/courses/${courseId}/teachers/${teacher._id}`), t('cot.toastRemoved'));
  };

  if (!data) return <SkeletonCard lines={4} />;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">{t('cot.teaching')}</h3>
          <p className="text-sm text-surface-500">{t('cot.sharesControl')}</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}><UserPlus size={15} /> {t('cot.inviteTeacher')}</Button>
      </div>

      <Card className="divide-y divide-surface-100 dark:divide-surface-700">
        <div className="flex items-center gap-3 px-4 py-3">
          <Crown size={16} className="shrink-0 text-gold-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
              {data.owner?.name} <span className="text-xs text-surface-400">@{data.owner?.username}</span>
            </p>
            <p className="text-xs text-surface-400">{t('cot.createdCourse')}</p>
          </div>
        </div>
        {data.coTeachers.map((co) => (
          <div key={co._id} className="flex items-center gap-3 px-4 py-3">
            <Users size={16} className="shrink-0 text-surface-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                {co.name} <span className="text-xs text-surface-400">@{co.username}</span>
              </p>
              <p className="text-xs text-surface-400">{t('cot.coTeacherRole')}</p>
            </div>
            {data.canManage && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeTeacher(co)} aria-label={t('cot.removeName', { name: co.name })}>
                <X size={14} className="text-rose-400" />
              </Button>
            )}
          </div>
        ))}
      </Card>

      {!data.canManage && data.coTeachers.length > 0 && (
        <p className="text-xs text-surface-400">
          {t('cot.onlyCreator', { name: data.owner?.name || '' })}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="font-semibold text-surface-800 dark:text-surface-100">{t('cot.waiting')}</h3>
        {data.pendingInvites.length === 0 ? (
          <Card><EmptyState title={t('cot.noInvites')} subtitle={t('cot.noInvitesHint')} /></Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {data.pendingInvites.map((inv) => (
              <div key={inv._id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                    {inv.invitee?.name} <span className="text-xs text-surface-400">@{inv.invitee?.username}</span>
                  </p>
                  <p className="text-xs text-surface-400">
                    {t('cot.invitedBy', { name: inv.invitedBy?.name || '', date: new Date(inv.createdAt).toLocaleDateString() })}
                  </p>
                </div>
                <Badge color="amber">{t('cot.pending')}</Badge>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancelInvite(inv._id)}>{t('cot.withdraw')}</Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('cot.inviteTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-surface-500">{t('cot.inviteExplain')}</p>
          <Input
            label={t('cot.identifier')}
            dir="ltr"
            value={form.teacher}
            onChange={(e) => setForm((f) => ({ ...f, teacher: e.target.value }))}
            placeholder={t('cot.identifierPlaceholder')}
          />
          <Textarea
            label={t('cot.messageLabel')}
            dir="auto"
            rows={3}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder={t('cot.messagePlaceholder')}
          />
          <Button className="w-full" loading={busy} onClick={invite} disabled={!form.teacher.trim()}>
            {t('cot.sendInvitation')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
