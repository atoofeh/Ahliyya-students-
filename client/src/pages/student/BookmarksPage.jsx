import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Trash2, ArrowRight } from 'lucide-react';
import api from '../../api/axios';
import { Card, Spinner, EmptyState, Button, PageHeader } from '../../components/ui';

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState(null);

  const load = () => api.get('/bookmarks').then(({ data }) => setBookmarks(data)).catch(() => setBookmarks([]));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    await api.delete(`/bookmarks/${id}`).catch(() => {});
    load();
  };

  if (!bookmarks) return <Spinner full />;

  return (
    <div className="space-y-5">
      <PageHeader title="Bookmarks" subtitle="Lessons you saved for later." />
      {bookmarks.length === 0 ? (
        <Card><EmptyState icon={<Bookmark size={26} />} title="No bookmarks yet"
          subtitle="Use the bookmark button inside any lesson to save it here." /></Card>
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
                    {b.lesson.title}
                  </Link>
                  <p className="truncate text-xs text-surface-400">{b.course.title} · saved {new Date(b.createdAt).toLocaleDateString()}</p>
                  {b.note && (
                    <p className="mt-1.5 rounded-lg border-l-2 border-gold-400 bg-surface-50 px-3 py-1.5 text-sm italic text-surface-600 dark:bg-surface-800/60 dark:text-surface-300">
                      “{b.note}”
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link to={`/student/courses/${b.course._id}?lesson=${b.lesson._id}`}
                    className="rounded-lg p-2 text-surface-300 opacity-0 transition-all hover:bg-brand-50 hover:text-brand-600 group-hover:opacity-100 dark:hover:bg-surface-800">
                    <ArrowRight size={16} />
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => remove(b._id)} title="Remove bookmark">
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
