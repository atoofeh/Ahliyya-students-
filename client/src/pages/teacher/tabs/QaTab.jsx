import { useEffect, useState, useCallback } from 'react';
import { MessageSquareText, Send } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Input, Badge, EmptyState } from '../../../components/ui';
import { SkeletonCard } from '../../../components/Skeletons';
import ErrorState from '../../../components/ErrorState';

/** Course Q&A for staff: answering a thread marks it resolved. */
export default function QaTab({ courseId }) {
  const toast = useToast();
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/qa/courses/${courseId}`);
      setError(null);
      setThreads(data.items);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, [courseId]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const sendReply = async (threadId) => {
    const body = reply[threadId]?.trim();
    if (!body) return;
    try {
      await api.post(`/qa/${threadId}/replies`, { body });
      setReply((r) => ({ ...r, [threadId]: '' }));
      toast.success('Reply posted — the thread is marked resolved');
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!threads) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  if (threads.length === 0) {
    return (
      <Card>
        <EmptyState icon={<MessageSquareText size={24} />} title="No student questions yet"
          subtitle="Questions asked in this course appear here, newest first." />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((t) => (
        <Card key={t._id} className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-surface-900 dark:text-white">{t.title}</p>
            <Badge color={t.resolved ? 'green' : 'amber'}>{t.resolved ? 'Resolved' : 'Open'}</Badge>
          </div>
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">{t.body}</p>
          <p className="mt-1 text-xs text-surface-400">{t.author?.name} · {new Date(t.createdAt).toLocaleString()}</p>
          {t.replies.map((r) => (
            <div key={r._id} className="mt-2 rounded-lg bg-surface-50 p-2.5 text-sm dark:bg-surface-700/40">
              <p className="text-surface-700 dark:text-surface-200">{r.body}</p>
              <p className="mt-0.5 text-xs text-surface-400">{r.author?.name}</p>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <Input placeholder="Reply as instructor (marks the thread resolved)…" value={reply[t._id] || ''}
              onChange={(e) => setReply((r) => ({ ...r, [t._id]: e.target.value }))} />
            <Button size="sm" onClick={() => sendReply(t._id)} aria-label="Send reply"><Send size={14} /></Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
