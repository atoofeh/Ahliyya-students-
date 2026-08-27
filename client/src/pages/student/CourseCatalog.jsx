import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, BarChart3, Search, CheckCircle2 } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { Card, Button, Spinner, EmptyState, Badge, Pagination, PageHeader } from '../../components/ui';
import CourseCover from '../../components/CourseCover';

const DIFFICULTY_COLOR = { beginner: 'green', intermediate: 'amber', advanced: 'red' };

export default function CourseCatalog() {
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [cat, mine] = await Promise.all([
      api.get('/courses/catalog', { params: { page, limit: 12, search: search || undefined } }),
      api.get('/enrollments/mine'),
    ]);
    setResult(cat.data);
    setEnrolledIds(new Set(mine.data.map((e) => String(e.course._id))));
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const enroll = async (course) => {
    try {
      await api.post(`/enrollments/courses/${course._id}/enroll`);
      toast.success(`Enrolled in ${course.title}`);
      navigate(`/student/courses/${course._id}`);
    } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Course catalog"
        subtitle="Public courses open for enrollment — private courses need an access code."
        actions={
          <div className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Search courses…"
              className="w-full rounded-xl border border-white/15 bg-white/10 py-2 pl-9 pr-3.5 text-sm text-white placeholder:text-white/50 backdrop-blur-sm transition-colors focus:border-gold-400/60 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-gold-400/30"
            />
          </div>
        }
      />

      {!result ? <Spinner full /> : result.items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={28} />} title="No public courses found"
          subtitle="Ask your teacher for an access code, or check back later." /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((c) => {
              const enrolled = enrolledIds.has(String(c._id));
              return (
                <Card key={c._id} hover className="flex flex-col overflow-hidden">
                  <CourseCover title={c.title} category={c.category} className="h-28">
                    <div className="absolute left-3 top-3 flex gap-1.5">
                      <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white ring-1 ring-white/25 backdrop-blur-sm">
                        {c.category}
                      </span>
                    </div>
                    {enrolled && (
                      <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[10.5px] font-bold text-white shadow-card backdrop-blur-sm">
                        <CheckCircle2 size={11} /> Enrolled
                      </span>
                    )}
                  </CourseCover>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-surface-900 line-clamp-1 dark:text-white">{c.title}</h3>
                      <Badge color={DIFFICULTY_COLOR[c.difficulty] || 'gray'}>{c.difficulty}</Badge>
                    </div>
                    <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-surface-500">{c.description || 'No description.'}</p>

                    <div className="mt-3 flex items-center gap-4 border-t border-surface-100 pt-3 text-xs text-surface-400 dark:border-surface-700/60">
                      <span className="flex items-center gap-1"><BookOpen size={13} /> {c.lessonCount} lessons</span>
                      <span className="flex items-center gap-1"><Clock size={13} /> {Math.round((c.durationMinutes || 0) / 60 * 10) / 10}h</span>
                      <span className="flex items-center gap-1"><BarChart3 size={13} /> {c.quizCount} quizzes</span>
                    </div>
                    <p className="mt-1.5 text-xs text-surface-400">By {c.teacher?.name}</p>

                    <div className="mt-3">
                      {enrolled
                        ? <Button variant="secondary" className="w-full" onClick={() => navigate(`/student/courses/${c._id}`)}>Open course</Button>
                        : (
                          <Button className="w-full" onClick={() => enroll(c)}>
                            Enroll
                            {c.price > 0
                              ? <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-xs font-bold">{c.price} {c.currency}</span>
                              : <span className="rounded-md bg-gold-400/25 px-1.5 py-0.5 text-xs font-bold text-gold-200">Free</span>}
                          </Button>
                        )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination meta={result.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
