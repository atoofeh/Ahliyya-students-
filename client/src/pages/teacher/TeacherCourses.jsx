import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, EmptyState, Badge, Pagination, Modal, Input, Textarea, Select } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'].map((d) => ({ value: d, label: d }));
const VISIBILITIES = [
  { value: 'hidden', label: 'Hidden — enrolled students only' },
  { value: 'listed', label: 'Listed — shown in the catalog' },
];

export default function TeacherCourses() {
  const toast = useToast();
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
      toast.success('Course created');
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
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">My courses</h1>
          <p className="text-sm text-surface-500">Create and manage your teaching portfolio.</p>
        </div>
        <Button onClick={() => setModal(true)}><Plus size={16} /> New course</Button>
      </div>

      {result.items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen size={26} />} title="No courses yet" /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((c) => (
            <Link key={c._id} to={`/teacher/courses/${c._id}`}>
              <Card className="h-full p-4 transition-shadow hover:shadow-md">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge color="primary">{c.category}</Badge>
                  <Badge color={c.isPublished ? 'green' : 'gray'}>{c.isPublished ? 'Published' : 'Draft'}</Badge>
                </div>
                <h3 className="font-semibold text-surface-900 dark:text-white">{c.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-surface-500">{c.description || 'No description'}</p>
                <p className="mt-3 text-xs text-surface-400">
                  {c.lessonCount} lessons · {c.quizCount} quizzes · {c.enrollmentCount} students
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination meta={result.meta} onPage={setPage} />

      <Modal open={modal} onClose={() => setModal(false)} title="Create course">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={set('title')} required />
          <Textarea label="Description" value={form.description} onChange={set('description')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Category" value={form.category} onChange={set('category')} />
            <Select label="Difficulty" value={form.difficulty} onChange={set('difficulty')} options={DIFFICULTIES} />
          </div>
          <Select label="Visibility" value={form.visibility} onChange={set('visibility')} options={VISIBILITIES} />
          <Button className="w-full" loading={busy} onClick={create} disabled={!form.title.trim()}>Create course</Button>
        </div>
      </Modal>
    </div>
  );
}
