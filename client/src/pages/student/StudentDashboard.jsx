import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Trophy, Award, Target, Play, Star, KeyRound, ArrowRight, Library } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, StatCard, Spinner, EmptyState, Button, Input, Badge, Modal, PageHeader, SectionTitle, RingProgress } from '../../components/ui';
import CourseCover from '../../components/CourseCover';

export default function StudentDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [codeModal, setCodeModal] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/analytics/student').then(({ data }) => setData(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const redeem = async () => {
    setBusy(true);
    try {
      await api.post('/enrollments/redeem', { code });
      toast.success('Enrolled successfully!');
      setCodeModal(false); setCode('');
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  if (!data) return <Spinner full />;
  const { stats, enrollments, recentAttempts, continueLearning } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]} 👋`}
        subtitle="Pick up where you left off — rise to excellence."
        gold
        actions={<Button variant="gold" onClick={() => setCodeModal(true)}><KeyRound size={16} /> Redeem course code</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={<BookOpen size={20} />} label="Enrolled" value={stats.enrolledCourses} />
        <StatCard icon={<Trophy size={20} />} label="Completed" value={stats.completedCourses} color="green" />
        <StatCard icon={<Award size={20} />} label="Certificates" value={stats.certificates} color="gold" />
        <StatCard icon={<Target size={20} />} label="Avg score" value={stats.avgScore != null ? `${stats.avgScore}%` : '—'} color="sky" />
        <StatCard icon={<Star size={20} />} label="Pass rate" value={stats.passRate != null ? `${stats.passRate}%` : '—'} color="rose" />
      </div>

      {continueLearning?.lesson && (
        <Link to={`/student/courses/${continueLearning.course?._id}?lesson=${continueLearning.lesson._id}`} className="group block">
          <div className="relative overflow-hidden rounded-2xl shadow-card transition-shadow duration-200 hover:shadow-card-hover">
            <CourseCover title={continueLearning.course?.title || ''} category={continueLearning.course?.category} className="min-h-[112px]" iconSize={0}>
              <div className="flex h-full items-center justify-between gap-4 px-5 py-4 sm:px-7">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-brand-950 shadow-gold-glow transition-transform duration-200 group-hover:scale-110">
                    <Play size={20} className="ml-0.5 fill-current" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300">Continue learning</p>
                    <p className="truncate font-display text-lg font-bold text-white">{continueLearning.lesson.title}</p>
                    <p className="truncate text-xs text-white/60">{continueLearning.course?.title}</p>
                  </div>
                </div>
                <span className="hidden items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors group-hover:bg-white/20 sm:inline-flex">
                  Resume <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </CourseCover>
          </div>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle title="My courses" subtitle={`${enrollments.length} enrolled`}
            action={<Link to="/student/catalog" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">Browse catalog →</Link>} />
          {enrollments.length === 0 ? (
            <Card><EmptyState icon={<Library size={26} />} title="No courses yet" subtitle="Browse the catalog or redeem an access code from your teacher."
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
          <SectionTitle title="Recent quiz results"
            action={<Link to="/student/grades" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">All grades →</Link>} />
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {recentAttempts.length === 0 ? <EmptyState title="No quizzes taken yet" /> :
              recentAttempts.slice(0, 6).map((a) => (
                <Link key={a._id} to={`/student/attempts/${a._id}`} className="block px-4 py-3 transition-colors hover:bg-surface-50 dark:hover:bg-surface-700/40">
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
          <Input label="Access code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XX" />
          <Button className="w-full" loading={busy} onClick={redeem} disabled={code.length < 4}>Enroll</Button>
        </div>
      </Modal>
    </div>
  );
}
