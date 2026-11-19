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

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ac.eventTypes')}</p>
          {data.eventVolume?.length ? (
            <>
            <dl className="space-y-3 xl:hidden">
              {data.eventVolume.map((e) => (
                <div key={e._id} className="flex min-w-0 items-start justify-between gap-3 border-b border-surface-100 pb-2 text-sm last:border-0 dark:border-surface-700">
                  <dt dir="ltr" className="min-w-0 break-words text-surface-600 [overflow-wrap:anywhere] dark:text-surface-300">{e._id.replace(/_/g, ' ')}</dt>
                  <dd className="shrink-0 font-semibold tabular-nums text-surface-800 dark:text-surface-100">{e.count}</dd>
                </div>
              ))}
            </dl>
            <div className="hidden xl:block">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.eventVolume.map((e) => ({ type: e._id.replace(/_/g, ' '), count: e.count }))} layout="vertical">
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis type="category" dataKey="type" width={120} fontSize={11} />
                <Tooltip /><Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
            </>
          ) : <EmptyState title={t('ac.noEvents')} />}
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ac.topOffenders')}</p>
          {data.topOffenders?.length ? data.topOffenders.map((o, i) => (
            <div key={o._id} className="flex min-w-0 flex-wrap items-center gap-3 border-b border-surface-100 dark:border-surface-700 py-3 text-sm last:border-0 xl:flex-nowrap xl:py-2">
              <span className="w-5 shrink-0 font-bold text-surface-400">#{i + 1}</span>
              <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] xl:basis-auto">
                <p dir="auto" className="break-words font-medium text-surface-800 dark:text-surface-100 xl:break-normal">{o.name}</p>
                <p dir="ltr" className="text-xs text-surface-400 [overflow-wrap:anywhere] xl:[overflow-wrap:normal]">@{o.username}</p>
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
              <div key={e._id}>
              <article className="min-w-0 space-y-2 p-4 text-sm xl:hidden">
                <Badge color="red" className="max-w-full whitespace-normal"><span dir="ltr" className="[overflow-wrap:anywhere]">{e.type.replace(/_/g, ' ')}</span></Badge>
                <p dir="auto" className="break-words font-medium text-surface-700 dark:text-surface-200">{e.student?.name}</p>
                {e.course && <p dir="auto" className="break-words text-xs text-surface-500">{e.course.title}</p>}
                {e.detail && <p dir="auto" className="text-xs text-surface-500 [overflow-wrap:anywhere]">{e.detail}</p>}
                <time className="block break-words text-xs text-surface-400">{new Date(e.occurredAt).toLocaleString()}</time>
              </article>
              <div className="hidden flex-wrap items-center gap-2 px-4 py-2.5 text-sm xl:flex">
                <Badge color="red"><span dir="ltr">{e.type.replace(/_/g, ' ')}</span></Badge>
                <span className="text-surface-700 dark:text-surface-200">{e.student?.name}</span>
                {e.course && <span className="text-xs text-surface-400">· {e.course.title}</span>}
                {e.detail && <span className="text-xs text-surface-400">— {e.detail}</span>}
                <span className="ms-auto text-xs text-surface-400">{new Date(e.occurredAt).toLocaleString()}</span>
              </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Pagination meta={data.recentEvents?.meta} onPage={setPage} />
    </div>
  );
}
