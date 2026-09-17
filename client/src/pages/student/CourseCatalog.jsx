import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, BarChart3, Search, CheckCircle2, Unlock } from 'lucide-react';
import api from '../../api/axios';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, EmptyState, Badge, Pagination, PageIntro } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import CourseCover from '../../components/CourseCover';

const DIFFICULTY_COLOR = { beginner: 'green', intermediate: 'amber', advanced: 'red' };

export default function CourseCatalog() {
  const { t } = useLanguage();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [enrolledIds, setEnrolledIds] = useState(new Set());
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

  return (
    <div className="space-y-5">
      <PageIntro
        title={t('catalog.title')}
        subtitle={t('catalog.subtitle')}
        actions={
          <div className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder={t('catalog.search')}
              aria-label={t('catalog.search')}
              className="w-full rounded-xl border border-surface-300 bg-white py-2 ps-9 pe-3.5 text-sm text-surface-800 placeholder:text-surface-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
            />
          </div>
        }
      />

      {!result ? <SkeletonCard /> : result.items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={28} />} title={t('catalog.empty')}
          subtitle={t('catalog.emptyHint')} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((c) => {
              const enrolled = enrolledIds.has(String(c._id));
              return (
                <Card key={c._id} hover className="flex flex-col overflow-hidden">
                  <CourseCover title={c.title} category={c.category} className="h-28">
                    <div className="absolute start-3 top-3 flex gap-1.5">
                      <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white ring-1 ring-white/25 backdrop-blur-sm">
                        {c.category}
                      </span>
                    </div>
                    {enrolled ? (
                      <span className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[10.5px] font-bold text-white shadow-card backdrop-blur-sm">
                        <CheckCircle2 size={11} /> {t('catalog.enrolled')}
                      </span>
                    ) : c.freeLessonCount > 0 && (
                      <span className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-gold-400/90 px-2.5 py-0.5 text-[10.5px] font-bold text-brand-950 shadow-card backdrop-blur-sm">
                        <Unlock size={11} /> {t('catalog.freeCount', { count: c.freeLessonCount })}
                      </span>
                    )}
                  </CourseCover>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 dir="auto" className="font-display font-bold text-surface-900 line-clamp-1 dark:text-white">{c.title}</h3>
                      <Badge color={DIFFICULTY_COLOR[c.difficulty] || 'gray'}>{t(`difficulty.${c.difficulty}`)}</Badge>
                    </div>
                    <p dir="auto" className="line-clamp-2 flex-1 text-sm leading-relaxed text-surface-500">{c.description || t('catalog.noDescription')}</p>

                    <div className="mt-3 flex items-center gap-4 border-t border-surface-100 pt-3 text-xs text-surface-400 dark:border-surface-700/60">
                      <span className="flex items-center gap-1"><BookOpen size={13} /> <span className="bidi-isolate">{t('catalog.lessons', { count: c.lessonCount })}</span></span>
                      <span className="flex items-center gap-1"><Clock size={13} /> <span className="bidi-isolate">{t('catalog.hours', { n: Math.round((c.durationMinutes || 0) / 60 * 10) / 10 })}</span></span>
                      <span className="flex items-center gap-1"><BarChart3 size={13} /> <span className="bidi-isolate">{t('catalog.quizzes', { count: c.quizCount })}</span></span>
                    </div>
                    <p className="mt-1.5 text-xs text-surface-400">{t('catalog.by', { name: c.teacher?.name || '' })}</p>

                    <div className="mt-3">
                      {enrolled
                        ? <Button variant="secondary" className="w-full" onClick={() => navigate(`/student/courses/${c._id}`)}>{t('catalog.openCourse')}</Button>
                        : (
                          <Button className="w-full" onClick={() => navigate(`/student/catalog/${c._id}`)}>
                            {c.freeLessonCount > 0 ? t('catalog.watchFree') : t('catalog.viewCourse')}
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
