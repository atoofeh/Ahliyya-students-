import { useEffect, useState } from 'react';
import { Megaphone, Pin } from 'lucide-react';
import api from '../api/axios';
import { useLanguage } from '../hooks/useLanguage';
import { Card, EmptyState, Badge, PageIntro, Avatar } from '../components/ui';
import { SkeletonCard } from '../components/Skeletons';

export default function AnnouncementsPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/announcements/feed').then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);

  if (!items) return <SkeletonCard />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageIntro title={t('announcements.title')} subtitle={t('announcements.subtitle')} />
      {items.length === 0 ? (
        <Card><EmptyState icon={<Megaphone size={26} />} title={t('announcements.empty')} /></Card>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a._id} className={`relative overflow-hidden p-5 ${a.pinned ? 'border-gold-300/70 dark:border-gold-700/50' : ''}`}>
              {a.pinned && <span className="absolute inset-x-0 top-0 h-0.5 bg-gold-gradient" />}
              <div className="flex items-start gap-3.5">
                <Avatar name={a.author?.name || 'System'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 dir="auto" className="font-display font-bold text-surface-900 dark:text-white">{a.title}</h3>
                    {a.pinned && <Badge color="gold" className="gap-1"><Pin size={10} /> {t('announcements.pinned')}</Badge>}
                    <Badge color={a.course ? 'blue' : 'primary'}>{a.course ? a.course.title : t('announcements.platform')}</Badge>
                  </div>
                  <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-surface-600 dark:text-surface-300">{a.body}</p>
                  <p className="mt-3 text-xs text-surface-400">
                    {a.author?.name} · <span className="capitalize">{a.author?.role}</span> · {new Date(a.publishedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
