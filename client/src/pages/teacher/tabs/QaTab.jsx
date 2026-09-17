import { useEffect, useState, useCallback } from 'react';
import { MessageSquareText, Send, Check, X } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Input, Badge, EmptyState, Modal, Textarea } from '../../../components/ui';
import { SkeletonCard } from '../../../components/Skeletons';
import ErrorState from '../../../components/ErrorState';

/**
 * Course Q&A for staff, with moderation.
 *
 * A student's question arrives pending: the class cannot see it until it is
 * approved. Answering a pending question approves it in the same step, so the
 * common case — read it, answer it — stays one action.
 */
const FILTERS = [
  { key: 'pending', label: 'Awaiting approval' },
  { key: 'approved', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];

const STATUS_BADGE = {
  pending: { color: 'amber', label: 'Awaiting approval' },
  approved: { color: 'green', label: 'Published' },
  rejected: { color: 'red', label: 'Rejected' },
};

export default function QaTab({ courseId }) {
  const toast = useToast();
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState({});
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/qa/courses/${courseId}`, { params: filter ? { status: filter } : {} });
      setError(null);
      setPage(data);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, [courseId, filter]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const run = async (fn, message) => {
    setBusy(true);
    try { await fn(); if (message) toast.success(message); await load(); }
    catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  const approve = (threadId) => run(
    () => api.post(`/qa/${threadId}/approve`),
    'Published — the class can see it now'
  );

  const reject = () => run(async () => {
    await api.post(`/qa/${rejecting._id}/reject`, { reason: reason.trim() || undefined });
    setRejecting(null);
    setReason('');
  }, 'Rejected — it stays hidden from the class');

  const sendReply = (threadId, wasPending) => {
    const body = reply[threadId]?.trim();
    if (!body) return;
    return run(async () => {
      await api.post(`/qa/${threadId}/replies`, { body });
      setReply((r) => ({ ...r, [threadId]: '' }));
    }, wasPending ? 'Answered and published' : 'Reply posted');
  };

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!page) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;

  const threads = page.items;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary-600 text-white'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700/50 dark:text-surface-300 dark:hover:bg-surface-700'
            }`}
          >
            {f.label}
            {f.key === 'pending' && page.pendingCount > 0 && (
              <span className={`ms-1.5 rounded-full px-1.5 text-xs font-bold ${filter === 'pending' ? 'bg-white/20' : 'bg-amber-500 text-white'}`}>
                {page.pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {threads.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquareText size={24} />}
            title={filter === 'pending' ? 'Nothing waiting for you' : 'No questions here'}
            subtitle={filter === 'pending'
              ? 'New questions land here first. Students only see them once you publish them.'
              : 'Questions asked in this course appear here, newest first.'}
          />
        </Card>
      ) : threads.map((t) => {
        const status = STATUS_BADGE[t.status] || STATUS_BADGE.pending;
        const pending = t.status === 'pending';
        return (
          <Card key={t._id} className={`p-4 ${pending ? 'ring-1 ring-amber-300 dark:ring-amber-500/40' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-surface-900 dark:text-white">{t.title}</p>
              <div className="flex shrink-0 gap-1.5">
                <Badge color={status.color}>{status.label}</Badge>
                {t.resolved && t.status === 'approved' && <Badge color="green">Answered</Badge>}
              </div>
            </div>
            <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">{t.body}</p>
            <p className="mt-1 text-xs text-surface-400">{t.author?.name} · {new Date(t.createdAt).toLocaleString()}</p>
            {t.status === 'rejected' && t.rejectionReason && (
              <p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Reason given: {t.rejectionReason}
              </p>
            )}

            {t.replies.map((r) => (
              <div key={r._id} className="mt-2 rounded-lg bg-surface-50 p-2.5 text-sm dark:bg-surface-700/40">
                <p className="text-surface-700 dark:text-surface-200">{r.body}</p>
                <p className="mt-0.5 text-xs text-surface-400">{r.author?.name}</p>
              </div>
            ))}

            {pending && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => approve(t._id)}>
                  <Check size={14} /> Publish to the class
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setRejecting(t); setReason(''); }}>
                  <X size={14} /> Reject
                </Button>
              </div>
            )}

            {t.status !== 'rejected' && (
              <div className="mt-2 flex gap-2">
                {/* Input renders its own <label> wrapper, so the flex item is that
                    wrapper — it needs the growth, not the field inside it. */}
                <div className="min-w-0 flex-1">
                  <Input
                    placeholder={pending ? 'Answer it — this publishes the question too…' : 'Reply as instructor…'}
                    value={reply[t._id] || ''}
                    onChange={(e) => setReply((r) => ({ ...r, [t._id]: e.target.value }))}
                  />
                </div>
                <Button size="sm" disabled={busy} onClick={() => sendReply(t._id, pending)} aria-label="Send reply">
                  <Send size={14} />
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject this question">
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            “{rejecting?.title}” stays hidden from the class. {rejecting?.author?.name} is told it was not published,
            along with your reason if you give one.
          </p>
          <Textarea
            label="Reason (optional, shown to the student)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. This is already covered in the syllabus."
          />
          <Button className="w-full" variant="danger" loading={busy} onClick={reject}>Reject question</Button>
        </div>
      </Modal>
    </div>
  );
}
