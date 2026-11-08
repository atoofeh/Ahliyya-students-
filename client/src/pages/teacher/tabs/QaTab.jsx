import { useEffect, useState, useCallback } from 'react';
import { MessageSquareText, Send, Check, X, Flag, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { useLanguage } from '../../../hooks/useLanguage';
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
  { key: 'pending', label: 'qa.awaiting' },
  { key: 'approved', label: 'qa.published' },
  { key: 'rejected', label: 'qa.rejected' },
  { key: '', label: 'qa.all' },
  { key: 'reports', label: 'qa.reports' },
];

const STATUS_BADGE = {
  pending: { color: 'amber', label: 'qa.awaiting' },
  approved: { color: 'green', label: 'qa.published' },
  rejected: { color: 'red', label: 'qa.rejected' },
};

export default function QaTab({ courseId }) {
  const toast = useToast();
  const { t } = useLanguage();
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState({});
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const reports = filter === 'reports';
      const { data } = await api.get(
        `/qa/courses/${courseId}${reports ? '/reports' : ''}`,
        { params: reports ? {} : (filter ? { status: filter } : {}) }
      );
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
    t('qa.toastPublished')
  );

  const reject = () => run(async () => {
    await api.post(`/qa/${rejecting._id}/reject`, { reason: reason.trim() || undefined });
    setRejecting(null);
    setReason('');
  }, t('qa.toastRejected'));

  const sendReply = (threadId, wasPending) => {
    const body = reply[threadId]?.trim();
    if (!body) return;
    return run(async () => {
      await api.post(`/qa/${threadId}/replies`, { body });
      setReply((r) => ({ ...r, [threadId]: '' }));
    }, t(wasPending ? 'qa.toastAnswered' : 'qa.toastReplied'));
  };

  const moderateReply = (threadId, replyId, status) => run(
    () => api.post(`/qa/${threadId}/replies/${replyId}/moderate`, { status }),
    t(status === 'approved' ? 'qa.toastReplyPublished' : 'qa.toastReplyRejected')
  );

  const resolveReport = (report, action) => run(
    () => api.post(`/qa/reports/${report._id}/resolve`, { action }),
    t(action === 'remove' ? 'qa.reportResolved' : 'qa.reportDismissed')
  );

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!page) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;

  const threads = filter === 'reports' ? [] : page.items;
  const reports = filter === 'reports' ? page.items : [];

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
            {t(f.label)}
            {f.key === 'pending' && page.pendingCount > 0 && (
              <span className={`ms-1.5 rounded-full px-1.5 text-xs font-bold ${filter === 'pending' ? 'bg-white/20' : 'bg-amber-500 text-white'}`}>
                {page.pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {filter === 'reports' ? (
        reports.length === 0 ? (
          <Card>
            <EmptyState icon={<Flag size={24} />} title={t('qa.noReports')} subtitle={t('qa.reportsHint')} />
          </Card>
        ) : reports.map((report) => {
          const thread = report.thread;
          const reply = report.replyId && thread?.replies?.find((item) => String(item._id) === String(report.replyId));
          const reasonKey = `qa.report${report.reason[0].toUpperCase()}${report.reason.slice(1)}`;
          return (
            <Card key={report._id} className="space-y-3 p-4 ring-1 ring-rose-200 dark:ring-rose-500/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flag size={15} className="text-rose-500" />
                  <p className="font-medium text-surface-900 dark:text-white">{thread?.title || t('qa.contentUnavailable')}</p>
                </div>
                <Badge color="red">{t(reasonKey)}</Badge>
              </div>
              <p className="text-xs text-surface-500">
                {t('qa.reportedBy', { name: report.reporter?.name || t('qa.unknownStudent') })}
                {' · '}{t('qa.reportAbout', { name: report.reportedUser?.name || t('qa.unknownStudent') })}
              </p>
              <div className="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/70">
                {reply ? (
                  <>
                    <p dir="auto" className="text-sm text-surface-700 dark:text-surface-200">{reply.body}</p>
                    <p className="mt-1 text-xs text-surface-400">{reply.author?.name}</p>
                  </>
                ) : (
                  <p dir="auto" className="text-sm text-surface-700 dark:text-surface-200">{thread?.body || t('qa.contentUnavailable')}</p>
                )}
              </div>
              {report.details && <p dir="auto" className="text-sm text-surface-600 dark:text-surface-300">{t('qa.reportDetails', { details: report.details })}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => resolveReport(report, 'remove')}>
                  <X size={14} /> {t('qa.removeReported')}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveReport(report, 'dismiss')}>
                  <ShieldCheck size={14} /> {t('qa.dismissReport')}
                </Button>
              </div>
            </Card>
          );
        })
      ) : (
        threads.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquareText size={24} />}
            title={t(filter === 'pending' ? 'qa.nothingWaiting' : 'qa.noQuestions')}
            subtitle={t(filter === 'pending' ? 'qa.pendingHint' : 'qa.allHint')}
          />
        </Card>
      ) : threads.map((thread) => {
        const status = STATUS_BADGE[thread.status] || STATUS_BADGE.pending;
        const pending = thread.status === 'pending';
        return (
          <Card key={thread._id} className={`p-4 ${pending ? 'ring-1 ring-amber-300 dark:ring-amber-500/40' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p dir="auto" className="font-medium text-surface-900 dark:text-white">{thread.title}</p>
              <div className="flex shrink-0 gap-1.5">
                <Badge color={status.color}>{t(status.label)}</Badge>
                {thread.resolved && thread.status === 'approved' && <Badge color="green">{t('qa.answered')}</Badge>}
              </div>
            </div>
            <p dir="auto" className="mt-1 text-sm text-surface-600 dark:text-surface-300">{thread.body}</p>
            <p className="mt-1 text-xs text-surface-400">{thread.author?.name} · {new Date(thread.createdAt).toLocaleString()}</p>
            {thread.status === 'rejected' && thread.rejectionReason && (
              <p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {t('qa.reasonGiven', { reason: thread.rejectionReason })}
              </p>
            )}

            {thread.replies.map((r) => {
              const replyStatus = r.status || 'approved';
              return (
                <div key={r._id} className="mt-2 rounded-lg bg-surface-50 p-2.5 text-sm dark:bg-surface-700/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p dir="auto" className="text-surface-700 dark:text-surface-200">{r.body}</p>
                    {replyStatus !== 'approved' && <Badge color={replyStatus === 'rejected' ? 'red' : 'amber'}>{t(replyStatus === 'rejected' ? 'qa.replyRejected' : 'qa.replyPending')}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-surface-400">{r.author?.name}</p>
                  {replyStatus === 'pending' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy} onClick={() => moderateReply(thread._id, r._id, 'approved')}>
                        <Check size={13} /> {t('qa.approveReply')}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => moderateReply(thread._id, r._id, 'rejected')}>
                        <X size={13} /> {t('qa.rejectReply')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {pending && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => approve(thread._id)}>
                  <Check size={14} /> {t('qa.publishToClass')}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setRejecting(thread); setReason(''); }}>
                  <X size={14} /> {t('qa.reject')}
                </Button>
              </div>
            )}

            {thread.status !== 'rejected' && (
              <div className="mt-2 flex gap-2">
                {/* Input renders its own <label> wrapper, so the flex item is that
                    wrapper — it needs the growth, not the field inside it. */}
                <div className="min-w-0 flex-1">
                  <Input
                    dir="auto"
                    placeholder={t(pending ? 'qa.answerAndPublish' : 'qa.replyAsInstructor')}
                    value={reply[thread._id] || ''}
                    onChange={(e) => setReply((r) => ({ ...r, [thread._id]: e.target.value }))}
                  />
                </div>
                <Button size="sm" disabled={busy} onClick={() => sendReply(thread._id, pending)} aria-label={t('qa.sendReply')}>
                  <Send size={14} />
                </Button>
              </div>
            )}
          </Card>
        );
        })
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={t('qa.rejectTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            {t('qa.rejectExplain', { title: rejecting?.title || '', name: rejecting?.author?.name || '' })}
          </p>
          <Textarea
            label={t('qa.reasonLabel')}
            dir="auto"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t('qa.reasonPlaceholder')}
          />
          <Button className="w-full" variant="danger" loading={busy} onClick={reject}>{t('qa.rejectQuestion')}</Button>
        </div>
      </Modal>
    </div>
  );
}
