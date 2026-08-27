import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Play, Star, KeyRound, ArrowRight, Library, ClipboardList, HelpCircle, Clock } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Card, EmptyState, Button, Input, Badge, Modal, SectionTitle, RingProgress, Skeleton } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import ErrorState from '../../components/ErrorState';
import CourseCover from '../../components/CourseCover';

/** Relative due label with the urgency baked in — students scan this column first. */
const dueLabel = (d) => {
  if (!d) return null;
  const ms = new Date(d) - Date.now();
  const days = Math.round(ms / 86400000);
  if (ms < 0) return { label: 'Overdue', tone: 'red' };
  if (days === 0) return { label: 'Due today', tone: 'amber' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'amber' };
  return { label: `Due in ${days} days`, tone: 'gray' };
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [upNext, setUpNext] = useState([]);
  const [codeModal, setCodeModal] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: d } = await api.get('/analytics/student');
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
  useEffect(() => { load(); }, [load]);

  const redeem = async () => {
    setBusy(true);
    try {
      await api.post('/enrollments/redeem', { code });
      toast.success('Enrolled — the course is in your list');
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
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            {stats.enrolledCourses} course{stats.enrolledCourses !== 1 && 's'} · {stats.completedCourses} completed
            {stats.avgScore != null && <> · {stats.avgScore}% average</>}
          </p>
        </div>
        <Button variant="outline" onClick={() => setCodeModal(true)}><KeyRound size={15} /> Redeem course code</Button>
      </div>

      {resume ? (
        <Link to={`/student/courses/${resume.course?._id}?lesson=${resume.lesson._id}`} className="group block">
          <div className="relative overflow-hidden rounded-2xl shadow-card transition-shadow duration-200 hover:shadow-card-hover">
            <CourseCover title={resume.course?.title || ''} category={resume.course?.category} className="min-h-[112px]" iconSize={0}>
              <div className="flex h-full items-center justify-between gap-4 px-5 py-4 sm:px-7">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-brand-950 shadow-gold-glow transition-transform duration-200 group-hover:scale-110">
                    <Play size={20} className="ml-0.5 fill-current" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300">Continue learning</p>
                    <p className="truncate font-display text-lg font-bold text-white">{resume.lesson.title}</p>
                    <p className="truncate text-xs text-white/70">{resume.course?.title}</p>
                  </div>
                </div>
                <span className="hidden items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors group-hover:bg-white/20 sm:inline-flex">
                  Resume <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </CourseCover>
          </div>
        </Link>
      ) : (
        <Card>
          <EmptyState
            icon={<Library size={26} />}
            title="Nothing in progress yet"
            subtitle="Redeem an access code from your teacher, or browse the public catalog to enrol."
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCodeModal(true)}><KeyRound size={15} /> Redeem code</Button>
                <Link to="/student/catalog"><Button variant="outline">Browse catalog</Button></Link>
              </div>
            )}
          />
        </Card>
      )}

      {upNext.length > 0 && (
        <div>
          <SectionTitle title="Up next" subtitle={`In ${resume?.course?.title}`} />
          <Card className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {upNext.map((item) => {
              const d = dueLabel(item.at);
              const Icon = item.kind === 'quiz' ? HelpCircle : ClipboardList;
              return (
                <Link key={item.id} to={item.to}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-50 dark:hover:bg-surface-700/40">
                  <Icon size={16} className="shrink-0 text-surface-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-surface-800 dark:text-surface-100">{item.title}</span>
                  {d
                    ? <Badge color={d.tone}><Clock size={11} className="mr-1" />{d.label}</Badge>
                    : <span className="shrink-0 text-xs text-surface-400">No due date</span>}
                </Link>
              );
            })}
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle title="My courses" subtitle={`${enrollments.length} enrolled`}
            action={<Link to="/student/catalog" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">Browse catalog →</Link>} />
          {enrollments.length === 0 ? (
            <Card><EmptyState icon={<Library size={26} />} title="No courses yet"
              subtitle="Browse the catalog or redeem an access code from your teacher."
              action={<Link to="/student/catalog"><Button variant="outline">Browse catalog</Button></Link>} /></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {enrollments.map((e) => (
                <Link key={e._id} to={`/student/courses/${e.course._id}`}>
                  <Card hover className="h-full overflow-hidden">
                    <CourseCover title={e.course.title} category={e.course.category} className="h-24">
                      {e.isFavorite && (
                        <span className="absolute right-3 top-3 rounded-full bg-white/15 p-1.5 ring-1 ring-white/25 backdrop-blur-sm">
                          <Star size={13} className="fill-gold-400 text-gold-400" />
                        </span>
                      )}
                    </CourseCover>
                    <div className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display font-bold leading-snug text-surface-900 line-clamp-2 dark:text-white">{e.course.title}</h3>
                        <p className="mt-1 truncate text-xs text-surface-400">
                          {e.course.teacher?.name} · {e.course.lessonCount} lessons
                          {e.course.expiresAt && <> · ends {new Date(e.course.expiresAt).toLocaleDateString()}</>}
                        </p>
                        {e.status === 'completed' && <Badge color="green" className="mt-1.5">Completed</Badge>}
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
          <SectionTitle title="Recent results"
            action={<Link to="/student/grades" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">All grades →</Link>} />
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {recentAttempts.length === 0
              ? <EmptyState title="No quizzes taken yet" subtitle="Results appear here after your first quiz." />
              : recentAttempts.slice(0, 6).map((a) => (
                <Link key={a._id} to={`/student/attempts/${a._id}`}
                  className="block px-4 py-3 transition-colors hover:bg-surface-50 dark:hover:bg-surface-700/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{a.quiz?.title}</p>
                      <p className="truncate text-xs text-surface-400">{a.course?.title}</p>
                    </div>
                    {a.pendingManualGrading
                      ? <Badge color="amber">Pending</Badge>
                      : <Badge color={a.passed ? 'green' : 'red'}>{a.percent}%</Badge>}
                  </div>
                </Link>
              ))}
          </Card>
        </div>
      </div>

      <Modal open={codeModal} onClose={() => setCodeModal(false)} title="Redeem access code">
        <div className="space-y-4">
          <Input label="Access code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XX" />
          <Button className="w-full" loading={busy} onClick={redeem} disabled={code.length < 4}>Enrol</Button>
        </div>
      </Modal>
    </div>
  );
}
