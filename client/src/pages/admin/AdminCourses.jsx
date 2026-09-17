import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Pencil, Trash2, Users } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, Badge, Pagination, EmptyState, Input } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

export default function AdminCourses() {
  const toast = useToast();
  const { t } = useLanguage();
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
    if (!window.confirm(t('ac2.confirmDelete', { title: course.title }))) return;
    try {
      await api.delete(`/courses/${course._id}`);
      toast.success(t('ac2.deleted'));
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!result) return <SkeletonCard />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('ac2.allCourses')}</h1>
          <p className="text-sm text-surface-500">{t('ac2.allCoursesSub')}</p>
        </div>
        <div className="w-64"><Input placeholder={t('ac2.searchCourses')} dir="auto" value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }} /></div>
      </div>

      <Card className="overflow-x-auto">
        {result.items.length === 0 ? <EmptyState icon={<BookOpen size={24} />} title={t('ac2.noCourses')} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700 text-start text-xs uppercase tracking-wide text-surface-400">
                <th className="px-4 py-3">{t('ac2.course')}</th><th className="px-4 py-3">{t('ac2.teacher')}</th><th className="px-4 py-3">{t('ac2.status')}</th>
                <th className="px-4 py-3">{t('ac2.students')}</th><th className="px-4 py-3">{t('ac2.content')}</th><th className="px-4 py-3 text-end">{t('ac2.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((c) => (
                <tr key={c._id} className="border-b border-surface-100 dark:border-surface-700/50 hover:bg-surface-50 dark:hover:bg-surface-700/30">
                  <td className="px-4 py-3">
                    <p dir="auto" className="font-medium text-surface-800 dark:text-surface-100">{c.title}</p>
                    <p className="text-xs text-surface-400">{c.category} · {c.difficulty}</p>
                  </td>
                  <td className="px-4 py-3 text-surface-500">{c.teacher?.name}</td>
                  <td className="px-4 py-3">
                    <Badge color={c.isPublished ? 'green' : 'gray'}>{t(c.isPublished ? 'ac2.publishedBadge' : 'ac2.draftBadge')}</Badge>{' '}
                    <Badge>{c.visibility}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => navigate(`/teacher/courses/${c._id}/students`)}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                      {c.enrollmentCount}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-surface-400">{t('ac2.contentCounts', { lessons: c.lessonCount, quizzes: c.quizCount })}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {/* Enrolling a student was reachable only through an unlabelled
                          pencil and then a tab, so nobody found it. Link straight to it. */}
                      <Button size="sm" variant="ghost" aria-label={t('ac2.studentsIn', { title: c.title })}
                        onClick={() => navigate(`/teacher/courses/${c._id}/students`)}>
                        <Users size={14} /> {t('ac2.students')}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={t('ac2.manageCourse', { title: c.title })}
                        onClick={() => navigate(`/teacher/courses/${c._id}`)}>
                        <Pencil size={14} /> {t('ac2.manage')}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={t('ac2.deleteCourse', { title: c.title })} onClick={() => remove(c)}>
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
