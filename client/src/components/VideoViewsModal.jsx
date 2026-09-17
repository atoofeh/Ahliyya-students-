import { useEffect, useState, useCallback } from 'react';
import { Eye, RotateCcw, Users } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { useToast } from '../hooks/useToast';
import { Modal, Card, Button, Badge, EmptyState, Spinner } from './ui';

const fmtWatched = (s) => {
  if (!s) return '—';
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/**
 * Who has watched a video, and how much of their allowance is left.
 *
 * A student who runs out asks their teacher to reopen it, so the teacher needs
 * to see the picture before deciding — a reset is a judgement call, not a
 * formality, and it is recorded in the audit log either way.
 *
 * A view is counted from watch time against the video's own length, so the
 * hours column is the evidence: four views of a 40-minute lecture is a little
 * over two and a half hours, and a student claiming a glitch will show far less.
 */
export default function VideoViewsModal({ courseId, video, onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!video) return;
    try {
      const res = await api.get(`/videos/courses/${courseId}/${video._id}/views`);
      setData(res.data);
    } catch (err) {
      toast.error(apiError(err));
      setData({ limit: 0, items: [] });
    }
  }, [courseId, video, toast]);

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const reset = async (studentId) => {
    setBusyId(studentId);
    try {
      await api.post(`/videos/courses/${courseId}/${video._id}/views/${studentId}/reset`);
      toast.success('Watch allowance reset');
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusyId(null); }
  };

  return (
    <Modal open={!!video} onClose={onClose} title={video ? `Who watched — ${video.title}` : ''} wide>
      {!data ? <Spinner /> : (
        <div className="space-y-3">
          <p className="text-xs text-surface-400">
            {data.limit > 0
              ? `Each student may finish this video ${data.limit} times. A view is counted from watch time against the video's length — skipping ahead does not earn one.`
              : 'The watch limit is switched off platform-wide, so nobody here can run out. These are the counts so far.'}
          </p>

          {data.items.length === 0 ? (
            <Card><EmptyState icon={<Users size={24} />} title="Nobody has watched this yet" /></Card>
          ) : (
            <Card className="divide-y divide-surface-100 dark:divide-surface-700">
              {data.items.map((row) => (
                <div key={row.student?._id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">
                      {row.student?.name}
                    </p>
                    <p className="text-xs text-surface-400">
                      @{row.student?.username} · {fmtWatched(row.watchedSeconds)} watched
                      {row.resetAt && ' · reset once'}
                    </p>
                  </div>
                  <Badge color={row.exhausted ? 'red' : 'gray'}>
                    <Eye size={11} className="me-1 inline" />
                    {data.limit > 0 ? `${row.completedViews}/${data.limit}` : row.completedViews}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === row.student?._id}
                    onClick={() => reset(row.student._id)}
                    disabled={row.completedViews === 0}
                  >
                    <RotateCcw size={13} /> Reset
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </Modal>
  );
}
