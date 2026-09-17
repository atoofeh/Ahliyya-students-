import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/axios';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Badge, Pagination, EmptyState } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

export default function AdminAntiCheat() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api.get('/anticheat/platform', { params: { page, limit: 30 } }).then(({ data }) => setData(data)).catch(() => {});
  }, [page]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <SkeletonCard />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('ac.title')}</h1>
        <p className="text-sm text-surface-500">{t('ac.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ac.eventTypes')}</p>
          {data.eventVolume?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.eventVolume.map((e) => ({ type: e._id.replace(/_/g, ' '), count: e.count }))} layout="vertical">
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis type="category" dataKey="type" width={120} fontSize={11} />
                <Tooltip /><Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState title={t('ac.noEvents')} />}
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ac.topOffenders')}</p>
          {data.topOffenders?.length ? data.topOffenders.map((o, i) => (
            <div key={o._id} className="flex items-center gap-3 border-b border-surface-100 dark:border-surface-700 py-2 text-sm last:border-0">
              <span className="w-5 font-bold text-surface-400">#{i + 1}</span>
              <div className="flex-1">
                <p className="font-medium text-surface-800 dark:text-surface-100">{o.name}</p>
                <p className="text-xs text-surface-400">@{o.username}</p>
              </div>
              <Badge color="amber">{t('ac.eventsCount', { n: o.events })}</Badge>
              <Badge color="red">{t('ac.weight', { n: Math.round(o.weight) })}</Badge>
            </div>
          )) : <EmptyState title={t('ac.noOffenders')} />}
        </Card>
      </div>

      <Card>
        <p className="border-b border-surface-200 dark:border-surface-700 px-4 py-3 text-sm font-semibold text-surface-800 dark:text-surface-100">
          {t('ac.recentEvents')}
        </p>
        {data.recentEvents?.items?.length === 0 ? <EmptyState icon={<ShieldAlert size={24} />} title={t('ac.noneYet')} /> : (
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {data.recentEvents.items.map((e) => (
              <div key={e._id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <Badge color="red"><span dir="ltr">{e.type.replace(/_/g, ' ')}</span></Badge>
                <span className="text-surface-700 dark:text-surface-200">{e.student?.name}</span>
                {e.course && <span className="text-xs text-surface-400">· {e.course.title}</span>}
                {e.detail && <span className="text-xs text-surface-400">— {e.detail}</span>}
                <span className="ms-auto text-xs text-surface-400">{new Date(e.occurredAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Pagination meta={data.recentEvents?.meta} onPage={setPage} />
    </div>
  );
}
