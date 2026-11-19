import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { BookOpen, Pencil, Trash2, Users } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { useConfirm } from '../../hooks/useConfirm';
import { Card, Button, Badge, Pagination, EmptyState, Input } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import ErrorState from '../../components/ErrorState';
import { coursePage } from '../../utils/courseNavigation';

export default function AdminCourses() {
  const toast = useToast();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const activeRequest = useRef(null);
  const page = coursePage(params);
  const search = params.get('search') || '';
  const setPage = (next) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    updated.set('page', String(next));
    return updated;
  });
  const setSearch = (value) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    updated.delete('page');
    if (value) updated.set('search', value);
    else updated.delete('search');
    return updated;
  }, { replace: true });
  const openCourse = (courseId, tab = '') => navigate(`/teacher/courses/${courseId}${tab ? `/${tab}` : ''}`, {
    state: { returnTo: `${location.pathname}${location.search}` },
  });

  const load = useCallback(() => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadError(null);
    api.get('/courses/mine', { params: { page, limit: 20, search: search || undefined }, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted && activeRequest.current === controller) setResult(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted && activeRequest.current === controller) {
          setLoadError({ code: err.response?.data?.code, message: apiError(err) });
        }
      });
  }, [page, search]);
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => { clearTimeout(timer); activeRequest.current?.abort(); };
  }, [load, search]);

  const remove = async (course) => {
    if (!(await confirm(t('ac2.confirmDelete', { title: course.title })))) return;
    try {
      await api.delete(`/courses/${course._id}`);
      toast.success(t('ac2.deleted'));
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('ac2.allCourses')}</h1>
          <p className="text-sm text-surface-500">{t('ac2.allCoursesSub')}</p>
        </div>
        <div className="w-full min-w-0 sm:w-64"><Input placeholder={t('ac2.searchCourses')} aria-label={t('ac2.searchCourses')} dir="auto" value={search}
          onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      {loadError ? <ErrorState code={loadError.code} message={loadError.message} onRetry={load} /> : !result ? <SkeletonCard /> : <>
      {result.items.length > 0 && (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:hidden">
          {result.items.map((c) => (
            <Card key={c._id} className="flex min-w-0 flex-col p-4">
              <button type="button" onClick={() => openCourse(c._id)}
                className="min-h-11 min-w-0 rounded-lg text-start font-semibold text-surface-900 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-white dark:hover:text-brand-300">
                <span dir="auto" className="block break-words">{c.title}</span>
              </button>
              <p dir="auto" className="mt-1 break-words text-xs text-surface-500">{c.category} · {c.difficulty}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge color={c.isPublished ? 'green' : 'gray'}>{t(c.isPublished ? 'ac2.publishedBadge' : 'ac2.draftBadge')}</Badge>
                <Badge>{c.visibility}</Badge>
              </div>
              <dl className="my-3 min-w-0 space-y-2 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-surface-400">{t('ac2.teacher')}</dt>
                  <dd dir="auto" className="break-words text-surface-700 dark:text-surface-200">{c.teacher?.name || '—'}</dd>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                  <div>
                    <dt className="text-xs text-surface-400">{t('ac2.students')}</dt>
                    <dd className="font-semibold text-surface-700 dark:text-surface-200">{c.enrollmentCount}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-surface-400">{t('ac2.content')}</dt>
                    <dd className="break-words text-surface-600 dark:text-surface-300">{t('ac2.contentCounts', { lessons: c.lessonCount, quizzes: c.quizCount })}</dd>
                  </div>
                </div>
              </dl>
              <div className="mt-auto grid min-w-0 grid-cols-[1fr_1fr_auto] gap-2 border-t border-surface-100 pt-3 dark:border-surface-700">
                <Button variant="outline" className="min-h-11 min-w-0 px-2 text-sm" aria-label={t('ac2.studentsIn', { title: c.title })}
                  onClick={() => openCourse(c._id, 'students')}>
                  <Users size={16} className="shrink-0" /><span className="min-w-0 break-words">{t('ac2.students')}</span>
                </Button>
                <Button variant="outline" className="min-h-11 min-w-0 px-2 text-sm" aria-label={t('ac2.manageCourse', { title: c.title })}
                  onClick={() => openCourse(c._id)}>
                  <Pencil size={16} className="shrink-0" /><span className="min-w-0 break-words">{t('ac2.manage')}</span>
                </Button>
                <Button variant="ghost" className="min-h-11 min-w-11 px-3" aria-label={t('ac2.deleteCourse', { title: c.title })} onClick={() => remove(c)}>
                  <Trash2 size={17} className="text-rose-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className={result.items.length > 0 ? 'hidden overflow-x-auto xl:block' : ''}>
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
                    <button type="button" onClick={() => openCourse(c._id, 'students')}
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
                        onClick={() => openCourse(c._id, 'students')}>
                        <Users size={14} /> {t('ac2.students')}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={t('ac2.manageCourse', { title: c.title })}
                        onClick={() => openCourse(c._id)}>
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
      </>}
    </div>
  );
}
