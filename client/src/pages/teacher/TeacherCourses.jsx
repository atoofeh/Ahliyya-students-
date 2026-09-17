import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, EmptyState, Badge, Pagination, Modal, Input, Textarea, Select } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];
const difficulties = (t) => LEVELS.map((d) => ({ value: d, label: t(`diff.${d}`) }));
const visibilities = (t) => [
  { value: 'hidden', label: t('crs.hidden') },
  { value: 'listed', label: t('crs.listed') },
];

export default function TeacherCourses() {
  const toast = useToast();
  const { t } = useLanguage();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', category: 'General', difficulty: 'beginner',
    language: 'en', visibility: 'hidden',
  });

  const load = useCallback(() => {
    api.get('/courses/mine', { params: { page, limit: 12 } }).then(({ data }) => setResult(data)).catch(() => {});
  }, [page]);
  useEffect(() => { load(); }, [load]);

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

  if (!result) return <SkeletonCard />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('crs.myCourses')}</h1>
          <p className="text-sm text-surface-500">{t('crs.myCoursesSub')}</p>
        </div>
        <Button onClick={() => setModal(true)}><Plus size={16} /> {t('crs.newCourse')}</Button>
      </div>

      {result.items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={26} />} title={t('crs.noCourses')} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((c) => (
            <Link key={c._id} to={`/teacher/courses/${c._id}`}>
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
      <Pagination meta={result.meta} onPage={setPage} />

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
