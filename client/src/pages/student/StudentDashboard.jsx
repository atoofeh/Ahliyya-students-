import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Play, Star, KeyRound, ArrowRight, Library, ClipboardList, HelpCircle, Clock } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { useToast } from '../../hooks/useToast';
import { Card, EmptyState, Button, Input, Badge, Modal, SectionTitle, RingProgress, Skeleton } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import ErrorState from '../../components/ErrorState';
import CourseCover from '../../components/CourseCover';

/** Relative due label with the urgency baked in — students scan this column first. */
const dueLabel = (d, t) => {
  if (!d) return null;
  const ms = new Date(d) - Date.now();
  const days = Math.round(ms / 86400000);
  if (ms < 0) return { label: t('student.overdue'), tone: 'red' };
  if (days === 0) return { label: t('student.dueToday'), tone: 'amber' };
  if (days === 1) return { label: t('student.dueTomorrow'), tone: 'amber' };
  return { label: t('student.dueInDays', { days }), tone: 'gray' };
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [upNext, setUpNext] = useState([]);
  // The course preview links here with ?redeem=1 — "I have an access code".
  const [params, setParams] = useSearchParams();
  const [codeModal, setCodeModal] = useState(params.get('redeem') === '1');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // State is only touched after the first await, so the effect body stays synchronous-free.
      const { data: d } = await api.get('/analytics/student');
      setError(null);
      setData(d);
      const courseId = d.continueLearning?.course?._id;
      if (!courseId) { setUpNext([]); return; }
      const [quizzes, assignments] = await Promise.all([
        api.get(`/quizzes/courses/${courseId}`).then((r) => r.data).catch(() => []),
        api.get(`/assignments/courses/${courseId}`).then((r) => r.data).catch(() => []),
      ]);
      const items = [
        ...quizzes
          .filter((q) => !q.isLocked && !q.myAttempts?.some((a) => a.status !== 'in_progress'))
          .map((q) => ({ id: q._id, kind: 'quiz', title: q.title, at: q.availableUntil, to: `/student/courses/${courseId}` })),
        ...assignments
          .filter((a) => !a.mySubmission)
          .map((a) => ({ id: a._id, kind: 'assignment', title: a.title, at: a.dueAt, to: `/student/courses/${courseId}` })),
      ].sort((a, b) => (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity));
      setUpNext(items.slice(0, 5));
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, []);
  // Deferred by a task so the effect body itself never sets state (see AdminUsers for the same idiom).
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const redeem = async () => {
    setBusy(true);
    try {
      await api.post('/enrollments/redeem', { code });
      toast.success(t('student.enrolledToast'));
      setCodeModal(false); setCode('');
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  const { stats, enrollments, recentAttempts, continueLearning } = data;
  const resume = continueLearning?.lesson ? continueLearning : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-extrabold tracking-tight text-surface-900 dark:text-white md:text-[26px]">
            {t('student.welcomeBack', { name: user.name.split(' ')[0] })}
          </h1>
          {/* Flex items rather than one run of text: each stat keeps its own
              digits, and the separators stay between them in both directions. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-surface-500">
            <span className="bidi-isolate">
              {stats.enrolledCourses === 1 ? t('student.courseOne') : t('student.courses', { count: stats.enrolledCourses })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="bidi-isolate">{t('student.completed', { count: stats.completedCourses })}</span>
            {stats.avgScore != null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="bidi-isolate">{t('student.average', { percent: stats.avgScore })}</span>
              </>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setCodeModal(true)}><KeyRound size={15} /> {t('student.redeemCourseCode')}</Button>
      </div>

      {resume ? (
        <Link to={`/student/courses/${resume.course?._id}?lesson=${resume.lesson._id}`} className="group block">
          <div className="relative overflow-hidden rounded-2xl shadow-card transition-shadow duration-200 hover:shadow-card-hover">
            <CourseCover title={resume.course?.title || ''} category={resume.course?.category} className="min-h-[112px]" iconSize={0}>
              <div className="flex h-full items-center justify-between gap-4 px-5 py-4 sm:px-7">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-brand-950 shadow-gold-glow transition-transform duration-200 group-hover:scale-110">
                    <Play size={20} className="ms-0.5 fill-current rtl:rotate-180" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300">{t('student.continueLearning')}</p>
                    <p dir="auto" className="truncate font-display text-lg font-bold text-white">{resume.lesson.title}</p>
                    <p dir="auto" className="truncate text-xs text-white/70">{resume.course?.title}</p>
                  </div>
                </div>
                <span className="hidden items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors group-hover:bg-white/20 sm:inline-flex">
                  {t('student.resume')} <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180" />
                </span>
              </div>
            </CourseCover>
          </div>
        </Link>
      ) : (
        <Card>
          <EmptyState
            icon={<Library size={26} />}
            title={t('student.nothingInProgress')}
            subtitle={t('student.nothingInProgressHint')}
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCodeModal(true)}><KeyRound size={15} /> {t('student.redeemCode')}</Button>
                <Link to="/student/catalog"><Button variant="outline">{t('student.browseCatalog')}</Button></Link>
              </div>
            )}
          />
        </Card>
      )}

      {upNext.length > 0 && (
        <div>
          <SectionTitle title={t('student.upNext')} subtitle={t('student.inCourse', { title: resume?.course?.title || '' })} />
          <Card className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {upNext.map((item) => {
              const d = dueLabel(item.at, t);
              const Icon = item.kind === 'quiz' ? HelpCircle : ClipboardList;
              return (
                <Link key={item.id} to={item.to}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-50 dark:hover:bg-surface-700/40">
                  <Icon size={16} className="shrink-0 text-surface-400" />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium text-surface-800 dark:text-surface-100">{item.title}</span>
                  {d
                    ? <Badge color={d.tone}><Clock size={11} className="me-1" />{d.label}</Badge>
                    : <span className="shrink-0 text-xs text-surface-400">{t('student.noDueDate')}</span>}
                </Link>
              );
            })}
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle title={t('student.myCourses')} subtitle={t('student.enrolledCount', { count: enrollments.length })}
            action={<Link to="/student/catalog" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">{t('student.browseCatalog')} <span className="rtl:hidden">→</span><span className="hidden rtl:inline">←</span></Link>} />
          {enrollments.length === 0 ? (
            <Card><EmptyState icon={<Library size={26} />} title={t('student.noCoursesYet')}
              subtitle={t('student.noCoursesHint')}
              action={<Link to="/student/catalog"><Button variant="outline">{t('student.browseCatalog')}</Button></Link>} /></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {enrollments.map((e) => (
                <Link key={e._id} to={`/student/courses/${e.course._id}`}>
                  <Card hover className="h-full overflow-hidden">
                    <CourseCover title={e.course.title} category={e.course.category} className="h-24">
                      {e.isFavorite && (
                        <span className="absolute end-3 top-3 rounded-full bg-white/15 p-1.5 ring-1 ring-white/25 backdrop-blur-sm">
                          <Star size={13} className="fill-gold-400 text-gold-400" />
                        </span>
                      )}
                    </CourseCover>
                    <div className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <h3 dir="auto" className="font-display font-bold leading-snug text-surface-900 line-clamp-2 dark:text-white">{e.course.title}</h3>
                        <p className="mt-1 truncate text-xs text-surface-400">
                          <span className="bidi-isolate">{e.course.teacher?.name}</span> · <span className="bidi-isolate">{t('student.lessonsCount', { count: e.course.lessonCount })}</span>
                          {e.course.expiresAt && <> · <span className="bidi-isolate">{t('student.endsOn', { date: new Date(e.course.expiresAt).toLocaleDateString() })}</span></>}
                        </p>
                        {e.status === 'completed' && <Badge color="green" className="mt-1.5">{t('student.completedBadge')}</Badge>}
                      </div>
                      <RingProgress value={e.progressPercent} gold={e.status === 'completed'} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle title={t('student.recentResults')}
            action={<Link to="/student/grades" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">{t('student.allGrades')} <span className="rtl:hidden">→</span><span className="hidden rtl:inline">←</span></Link>} />
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {recentAttempts.length === 0
              ? <EmptyState title={t('student.noQuizzes')} subtitle={t('student.noQuizzesHint')} />
              : recentAttempts.slice(0, 6).map((a) => (
                <Link key={a._id} to={`/student/attempts/${a._id}`}
                  className="block px-4 py-3 transition-colors hover:bg-surface-50 dark:hover:bg-surface-700/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="auto" className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{a.quiz?.title}</p>
                      <p dir="auto" className="truncate text-xs text-surface-400">{a.course?.title}</p>
                    </div>
                    {a.pendingManualGrading
                      ? <Badge color="amber">{t('student.pending')}</Badge>
                      : <Badge color={a.passed ? 'green' : 'red'}>{a.percent}%</Badge>}
                  </div>
                </Link>
              ))}
          </Card>
        </div>
      </div>

      <Modal open={codeModal} onClose={() => { setCodeModal(false); if (params.get('redeem')) setParams({}, { replace: true }); }} title={t('student.redeemCourseCode')}>
        <div className="space-y-4">
          <Input label={t('student.accessCode')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('student.codePlaceholder')} />
          <Button className="w-full" loading={busy} onClick={redeem} disabled={code.length < 4}>{t('student.enrol')}</Button>
        </div>
      </Modal>
    </div>
  );
}
