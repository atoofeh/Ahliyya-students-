import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { Card, Badge, EmptyState, Pagination, PageIntro } from '../../components/ui';
import { SkeletonRows } from '../../components/Skeletons';

const scoreTone = (p) =>
  p >= 85 ? 'bg-emerald-500' : p >= 60 ? 'bg-brand-500' : p >= 40 ? 'bg-amber-500' : 'bg-rose-500';

export default function GradesPage() {
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/quizzes/attempts/mine', { params: { page, limit: 20 } })
      .then(({ data }) => setResult(data)).catch(() => {});
  }, [page]);

  if (!result) return <SkeletonRows />;

  return (
    <div className="space-y-5">
      <PageIntro title="My grades" subtitle="All quiz attempts across your courses." />
      <Card className="overflow-hidden">
        {result.items.length === 0 ? <EmptyState title="No graded work yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50/80 text-left text-[11px] uppercase tracking-wider text-surface-400 dark:border-surface-700 dark:bg-surface-800/50">
                  <th className="px-4 py-3 font-bold">Quiz</th>
                  <th className="px-4 py-3 font-bold">Course</th>
                  <th className="px-4 py-3 font-bold">Attempt</th>
                  <th className="px-4 py-3 font-bold">Score</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((a) => (
                  <tr key={a._id} className="border-b border-surface-100 transition-colors last:border-0 hover:bg-brand-50/40 dark:border-surface-700/50 dark:hover:bg-surface-700/30">
                    <td className="px-4 py-3">
                      <Link to={`/student/attempts/${a._id}`} className="font-semibold text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-300">
                        {a.quiz?.title || 'Quiz'}
                      </Link>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-surface-500">{a.course?.title}</td>
                    <td className="px-4 py-3 text-surface-500">#{a.attemptNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-10 font-bold text-surface-800 dark:text-surface-100">{a.percent}%</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-200/80 dark:bg-surface-700">
                          <span className={`block h-full rounded-full ${scoreTone(a.percent)}`}
                            style={{ width: `${Math.min(100, Math.max(0, a.percent))}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.pendingManualGrading ? <Badge color="amber">Pending grading</Badge>
                        : a.status === 'invalidated' ? <Badge color="red">Invalidated</Badge>
                        : a.passed != null && <Badge color={a.passed ? 'green' : 'red'}>{a.passed ? 'Passed' : 'Failed'}</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-surface-400">{new Date(a.submittedAt || a.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination meta={result.meta} onPage={setPage} />
    </div>
  );
}
