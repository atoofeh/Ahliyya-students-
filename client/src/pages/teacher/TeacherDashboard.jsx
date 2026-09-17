import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ShieldAlert, BookOpen } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useLanguage } from '../../hooks/useLanguage';
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
  const { t } = useLanguage();

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
    { key: 'grade', label: t('tea.awaitingGrading'), value: stats.pendingGrading, icon: ClipboardCheck, tone: 'amber' },
    { key: 'cheat', label: t('tea.cheatThisWeek'), value: stats.cheatEventsThisWeek, icon: ShieldAlert, tone: 'rose' },
  ].filter((a) => a.value > 0);

  return (
    <div className="space-y-6">
      <PageIntro
        title={t('tea.title')}
        subtitle={t('tea.subtitle')}
        actions={<Link to="/teacher/courses"><Button>{t('tea.manageCourses')}</Button></Link>}
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
        <p className="text-sm text-surface-500">{t('tea.allClear')}</p>
      )}

      <div>
        <SectionTitle title={t('tea.performance')} subtitle={t('tea.performanceSub')} />
        {courses.length === 0 ? (
          <Card>
            <EmptyState icon={<BookOpen size={26} />} title={t('tea.noCourses')}
              subtitle={t('tea.noCoursesHint')}
              action={<Link to="/teacher/courses"><Button>{t('tea.createCourse')}</Button></Link>} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <Link key={c._id} to={`/teacher/courses/${c._id}`}>
                <Card hover className="h-full overflow-hidden">
                  <CourseCover title={c.title} category={c.category} className="h-20">
                    <span className="absolute end-3 top-3">
                      <Badge color={c.isPublished ? 'green' : 'gray'}>{t(c.isPublished ? 'tea.live' : 'tea.draft')}</Badge>
                    </span>
                  </CourseCover>
                  <div className="p-4">
                    <h3 dir="auto" className="mb-3 font-display font-bold text-surface-900 line-clamp-1 dark:text-white">{c.title}</h3>
                    <div className="grid grid-cols-3 divide-x divide-surface-100 rounded-xl bg-surface-50 py-2.5 text-center text-[11px] text-surface-400 dark:divide-surface-700 dark:bg-surface-800/60">
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.students}</p>{t('tea.students')}</div>
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.quizAttempts}</p>{t('tea.attempts')}</div>
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.avgQuizScore || 0}%</p>{t('tea.avgScore')}</div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-surface-400">
                        <span>{t('tea.avgProgress')}</span>
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
