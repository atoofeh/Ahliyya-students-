import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, EmptyState, Badge, Pagination, Modal, Input, Textarea, Select } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import { coursePage } from '../../utils/courseNavigation';
import ErrorState from '../../components/ErrorState';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];
const difficulties = (t) => LEVELS.map((d) => ({ value: d, label: t(`diff.${d}`) }));
const visibilities = (t) => [
  { value: 'hidden', label: t('crs.hidden') },
  { value: 'listed', label: t('crs.listed') },
];

export default function TeacherCourses() {
  const toast = useToast();
  const { t } = useLanguage();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);
  const page = coursePage(params);
  const search = params.get('search') || '';
  const setSearch = (value) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    updated.delete('page');
    if (value) updated.set('search', value);
    else updated.delete('search');
    return updated;
  }, { replace: true });
  const setPage = (next) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    updated.set('page', String(next));
    return updated;
  });
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', category: 'General', difficulty: 'beginner',
    language: 'en', visibility: 'hidden',
  });

  const load = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    api.get('/courses/mine', { params: { page, limit: 12, search: search.trim() || undefined }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResult(data); })
      .catch((err) => { if (!controller.signal.aborted) setError({ code: err.response?.data?.code, message: apiError(err) }); });
  }, [page, search]);
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => { clearTimeout(timer); requestRef.current?.abort(); };
  }, [load, search]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async () => {
    setBusy(true);
    try {
      await api.post('/courses', form);
      toast.success(t('crs.created'));
      setModal(false);
      setForm({ title: '', description: '', category: 'General', difficulty: 'beginner', language: 'en', visibility: 'hidden' });
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('crs.myCourses')}</h1>
          <p className="text-sm text-surface-500">{t('crs.myCoursesSub')}</p>
        </div>
        <Button onClick={() => setModal(true)}><Plus size={16} /> {t('crs.newCourse')}</Button>
      </div>

      <div className="w-full sm:max-w-sm">
        <Input placeholder={t('ac2.searchCourses')} aria-label={t('ac2.searchCourses')} dir="auto" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {error ? <ErrorState compact code={error.code} message={error.message} onRetry={load} /> : !result ? <SkeletonCard /> : result.items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={26} />} title={t('crs.noCourses')} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((c) => (
            <Link key={c._id} to={`/teacher/courses/${c._id}`} state={{ returnTo: `${location.pathname}${location.search}` }}>
              <Card className="h-full p-4 transition-shadow hover:shadow-md">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge color="primary">{c.category}</Badge>
                  <Badge color={c.isPublished ? 'green' : 'gray'}>{t(c.isPublished ? 'ac2.publishedBadge' : 'ac2.draftBadge')}</Badge>
                </div>
                <h3 dir="auto" className="font-semibold text-surface-900 dark:text-white">{c.title}</h3>
                <p dir="auto" className="mt-1 line-clamp-2 text-sm text-surface-500">{c.description || t('crs.noDescription')}</p>
                <p className="mt-3 text-xs text-surface-400">
                  {t('crs.counts', { lessons: c.lessonCount, quizzes: c.quizCount, students: c.enrollmentCount })}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination meta={result?.meta} onPage={setPage} />

      <Modal open={modal} onClose={() => setModal(false)} title={t('crs.createCourse')}>
        <div className="space-y-4">
          <Input label={t('crs.title')} dir="auto" value={form.title} onChange={set('title')} required />
          <Textarea label={t('crs.description')} dir="auto" value={form.description} onChange={set('description')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('crs.category')} dir="auto" value={form.category} onChange={set('category')} />
            <Select label={t('crs.difficulty')} value={form.difficulty} onChange={set('difficulty')} options={difficulties(t)} />
          </div>
          <Select label={t('crs.visibility')} value={form.visibility} onChange={set('visibility')} options={visibilities(t)} />
          <Button className="w-full" loading={busy} onClick={create} disabled={!form.title.trim()}>{t('crs.createCourse')}</Button>
        </div>
      </Modal>
    </div>
  );
}
