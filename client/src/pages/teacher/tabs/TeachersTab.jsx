import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Crown, X, Users } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
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
  }, 'Invitation sent');

  const cancelInvite = (inviteId) => run(
    () => api.post(`/co-teaching/courses/${courseId}/invites/${inviteId}/cancel`),
    'Invitation withdrawn'
  );

  const removeTeacher = (teacher) => {
    if (!window.confirm(`Remove ${teacher.name} from this course? They lose access to it immediately.`)) return;
    return run(() => api.delete(`/co-teaching/courses/${courseId}/teachers/${teacher._id}`), 'Co-teacher removed');
  };

  if (!data) return <SkeletonCard lines={4} />;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">Teaching this course</h3>
          <p className="text-sm text-surface-500">
            A co-teacher shares full control of the course with you — lessons, students, grading and Q&amp;A.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}><UserPlus size={15} /> Invite a teacher</Button>
      </div>

      <Card className="divide-y divide-surface-100 dark:divide-surface-700">
        <div className="flex items-center gap-3 px-4 py-3">
          <Crown size={16} className="shrink-0 text-gold-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
              {data.owner?.name} <span className="text-xs text-surface-400">@{data.owner?.username}</span>
            </p>
            <p className="text-xs text-surface-400">Created the course</p>
          </div>
        </div>
        {data.coTeachers.map((t) => (
          <div key={t._id} className="flex items-center gap-3 px-4 py-3">
            <Users size={16} className="shrink-0 text-surface-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                {t.name} <span className="text-xs text-surface-400">@{t.username}</span>
              </p>
              <p className="text-xs text-surface-400">Co-teacher · same authority as the creator</p>
            </div>
            {data.canManage && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeTeacher(t)} aria-label={`Remove ${t.name}`}>
                <X size={14} className="text-rose-400" />
              </Button>
            )}
          </div>
        ))}
      </Card>

      {!data.canManage && data.coTeachers.length > 0 && (
        <p className="text-xs text-surface-400">
          Only {data.owner?.name}, who created this course, can remove a co-teacher.
        </p>
      )}

      <div className="space-y-2">
        <h3 className="font-semibold text-surface-800 dark:text-surface-100">Waiting for an answer</h3>
        {data.pendingInvites.length === 0 ? (
          <Card><EmptyState title="No open invitations" subtitle="Invited teachers appear here until they accept or decline." /></Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {data.pendingInvites.map((inv) => (
              <div key={inv._id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                    {inv.invitee?.name} <span className="text-xs text-surface-400">@{inv.invitee?.username}</span>
                  </p>
                  <p className="text-xs text-surface-400">
                    Invited by {inv.invitedBy?.name} · {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge color="amber">Pending</Badge>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancelInvite(inv._id)}>Withdraw</Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a teacher to co-teach">
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            They get an invitation in their notifications. If they accept, they can edit the course, manage its
            students, grade work and moderate questions — exactly as you can.
          </p>
          <Input
            label="Their username or email"
            value={form.teacher}
            onChange={(e) => setForm((f) => ({ ...f, teacher: e.target.value }))}
            placeholder="e.g. abdullah.dabbas"
          />
          <Textarea
            label="Message (optional)"
            rows={3}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Why you are inviting them."
          />
          <Button className="w-full" loading={busy} onClick={invite} disabled={!form.teacher.trim()}>
            Send invitation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
