import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ShieldAlert, BookOpen } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { Card, EmptyState, Badge, Button, ProgressBar, PageIntro, SectionTitle } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import ErrorState from '../../components/ErrorState';
import CourseCover from '../../components/CourseCover';

const CHIP = {
  amber: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/25 dark:text-amber-200',
  rose: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/25 dark:text-rose-200',
};

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get('/analytics/teacher');
      setError(null);
      setData(d);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={1} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  const { stats, courses } = data;
  const attention = [
    { key: 'grade', label: 'awaiting grading', value: stats.pendingGrading, icon: ClipboardCheck, tone: 'amber' },
    { key: 'cheat', label: 'cheat events this week', value: stats.cheatEventsThisWeek, icon: ShieldAlert, tone: 'rose' },
  ].filter((a) => a.value > 0);

  return (
    <div className="space-y-6">
      <PageIntro
        title="Instructor dashboard"
        subtitle="Your courses, your students, and what needs you today."
        actions={<Link to="/teacher/courses"><Button>Manage courses</Button></Link>}
      />

      {attention.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attention.map(({ key, label, value, icon: Icon, tone }) => (
            <Link key={key} to="/teacher/courses"
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-opacity hover:opacity-90 ${CHIP[tone]}`}>
              <Icon size={15} />
              <span className="font-bold tabular-nums">{value}</span> {label}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-500">Nothing needs your attention right now.</p>
      )}

      <div>
        <SectionTitle title="Course performance" subtitle="Students, attempts and progress per course" />
        {courses.length === 0 ? (
          <Card>
            <EmptyState icon={<BookOpen size={26} />} title="No courses yet"
              subtitle="Create your first course to start teaching."
              action={<Link to="/teacher/courses"><Button>Create course</Button></Link>} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <Link key={c._id} to={`/teacher/courses/${c._id}`}>
                <Card hover className="h-full overflow-hidden">
                  <CourseCover title={c.title} category={c.category} className="h-20">
                    <span className="absolute end-3 top-3">
                      <Badge color={c.isPublished ? 'green' : 'gray'}>{c.isPublished ? 'Live' : 'Draft'}</Badge>
                    </span>
                  </CourseCover>
                  <div className="p-4">
                    <h3 className="mb-3 font-display font-bold text-surface-900 line-clamp-1 dark:text-white">{c.title}</h3>
                    <div className="grid grid-cols-3 divide-x divide-surface-100 rounded-xl bg-surface-50 py-2.5 text-center text-[11px] text-surface-400 dark:divide-surface-700 dark:bg-surface-800/60">
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.students}</p>students</div>
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.quizAttempts}</p>attempts</div>
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.avgQuizScore || 0}%</p>avg score</div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-surface-400">
                        <span>Avg progress</span>
                        <span className="font-semibold text-surface-600 dark:text-surface-300">{c.avgProgress}%</span>
                      </div>
                      <ProgressBar value={c.avgProgress} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
