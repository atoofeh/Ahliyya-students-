import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Trash2, ArrowRight } from 'lucide-react';
import api from '../../api/axios';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, EmptyState, Button, PageIntro } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

export default function BookmarksPage() {
  const { t } = useLanguage();
  const [bookmarks, setBookmarks] = useState(null);

  const load = () => api.get('/bookmarks').then(({ data }) => setBookmarks(data)).catch(() => setBookmarks([]));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    await api.delete(`/bookmarks/${id}`).catch(() => {});
    load();
  };

  if (!bookmarks) return <SkeletonCard />;

  return (
    <div className="space-y-5">
      <PageIntro title={t('bookmarks.title')} subtitle={t('bookmarks.subtitle')} />
      {bookmarks.length === 0 ? (
        <Card><EmptyState icon={<Bookmark size={26} />} title={t('bookmarks.empty')}
          subtitle={t('bookmarks.emptyHint')} /></Card>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((b) => (
              <Card key={b._id} hover className="group flex items-center gap-4 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-card sheen">
                  <Bookmark size={17} className="fill-white/20" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/student/courses/${b.course._id}?lesson=${b.lesson._id}`}
                    className="font-semibold text-surface-900 transition-colors hover:text-brand-600 dark:text-white dark:hover:text-brand-300">
                    <span dir="auto">{b.lesson.title}</span>
                  </Link>
                  <p className="truncate text-xs text-surface-400">{b.course.title} · {t('bookmarks.savedOn', { date: new Date(b.createdAt).toLocaleDateString() })}</p>
                  {b.note && (
                    <p dir="auto" className="mt-1.5 rounded-lg border-s-2 border-gold-400 bg-surface-50 px-3 py-1.5 text-sm italic text-surface-600 dark:bg-surface-800/60 dark:text-surface-300">
                      “{b.note}”
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link to={`/student/courses/${b.course._id}?lesson=${b.lesson._id}`}
                    className="rounded-lg p-2 text-surface-300 opacity-0 transition-all hover:bg-brand-50 hover:text-brand-600 group-hover:opacity-100 dark:hover:bg-surface-800">
                    <ArrowRight size={16} className="rtl:rotate-180" />
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => remove(b._id)} title={t('bookmarks.remove')} aria-label={t('bookmarks.remove')}>
                    <Trash2 size={16} className="text-rose-400" />
                  </Button>
                </div>
              </Card>
          ))}
        </div>
      )}
    </div>
  );
}
