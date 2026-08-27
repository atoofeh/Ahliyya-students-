import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Pencil, Trash2 } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, Badge, Spinner, Pagination, EmptyState, Input } from '../../components/ui';

export default function AdminCourses() {
  const toast = useToast();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    api.get('/courses/mine', { params: { page, limit: 20, search: search || undefined } })
      .then(({ data }) => setResult(data)).catch(() => {});
  }, [page, search]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  const remove = async (course) => {
    if (!window.confirm(`Delete "${course.title}"? All enrollments will be removed.`)) return;
    try {
      await api.delete(`/courses/${course._id}`);
      toast.success('Course deleted');
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!result) return <Spinner full />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">All courses</h1>
          <p className="text-sm text-surface-500">Every course on the platform. Admins can edit or remove any course.</p>
        </div>
        <div className="w-64"><Input placeholder="Search courses..." value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }} /></div>
      </div>

      <Card className="overflow-x-auto">
        {result.items.length === 0 ? <EmptyState icon={<BookOpen size={24} />} title="No courses" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700 text-left text-xs uppercase tracking-wide text-surface-400">
                <th className="px-4 py-3">Course</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Students</th><th className="px-4 py-3">Content</th><th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((c) => (
                <tr key={c._id} className="border-b border-surface-100 dark:border-surface-700/50 hover:bg-surface-50 dark:hover:bg-surface-700/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-surface-800 dark:text-surface-100">{c.title}</p>
                    <p className="text-xs text-surface-400">{c.category} · {c.difficulty}</p>
                  </td>
                  <td className="px-4 py-3 text-surface-500">{c.teacher?.name}</td>
                  <td className="px-4 py-3">
                    <Badge color={c.isPublished ? 'green' : 'gray'}>{c.isPublished ? 'Published' : 'Draft'}</Badge>{' '}
                    <Badge>{c.visibility}</Badge>
                  </td>
                  <td className="px-4 py-3">{c.enrollmentCount}</td>
                  <td className="px-4 py-3 text-surface-400">{c.lessonCount} lessons · {c.quizCount} quizzes</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Manage" onClick={() => navigate(`/teacher/courses/${c._id}`)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                        <Trash2 size={14} className="text-rose-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pagination meta={result.meta} onPage={setPage} />
    </div>
  );
}
