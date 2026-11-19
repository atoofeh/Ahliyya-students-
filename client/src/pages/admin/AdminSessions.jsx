import { useEffect, useState, useCallback } from 'react';
import { MonitorSmartphone, LogOut } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, Badge, Pagination, EmptyState } from '../../components/ui';
import { SkeletonRows } from '../../components/Skeletons';

export default function AdminSessions() {
  const toast = useToast();
  const { t } = useLanguage();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api.get('/admin/sessions', { params: { page, limit: 25 } }).then(({ data }) => setResult(data)).catch(() => {});
  }, [page]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const terminate = async (session) => {
    try {
      await api.post(`/admin/sessions/${session._id}/terminate`);
      toast.success(t('ses.terminated', { name: session.user?.name || '' }));
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!result) return <SkeletonRows />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('ses.title')}</h1>
        <p className="text-sm text-surface-500">{t('ses.subtitle')}</p>
      </div>

      <Card className="overflow-x-auto">
        {result.items.length === 0 ? <EmptyState icon={<MonitorSmartphone size={24} />} title={t('ses.empty')} /> : (
          <>
          <div className="divide-y divide-surface-100 dark:divide-surface-700 xl:hidden">
            {result.items.map((s) => (
              <article key={s._id} className="min-w-0 space-y-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p dir="auto" className="break-words font-semibold text-surface-800 dark:text-surface-100">{s.user?.name}</p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-surface-400">
                    <span dir="ltr" className="[overflow-wrap:anywhere]">@{s.user?.username}</span>
                    <Badge color="primary">{s.user?.role}</Badge>
                  </div>
                </div>
                <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-surface-400">{t('ses.device')}</dt>
                    <dd className="mt-0.5 break-words text-surface-700 dark:text-surface-200">
                      {s.browser || t('ses.unknownBrowser')}
                      <span className="mt-0.5 block text-xs text-surface-500">{s.os} · {s.deviceType}</span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-surface-400">{t('ses.ip')}</dt>
                    <dd dir="ltr" className="mt-0.5 font-mono text-xs text-surface-600 [overflow-wrap:anywhere] dark:text-surface-300">{s.ip}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-surface-400">{t('ses.signedIn')}</dt>
                    <dd className="mt-0.5 break-words text-xs text-surface-600 dark:text-surface-300">{new Date(s.createdAt).toLocaleString()}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-surface-400">{t('ses.lastActivity')}</dt>
                    <dd className="mt-0.5 break-words text-xs text-surface-600 dark:text-surface-300">{new Date(s.lastActivityAt).toLocaleString()}</dd>
                  </div>
                </dl>
                <Button size="sm" variant="danger" className="min-h-11 w-full sm:w-auto" onClick={() => terminate(s)}>
                  <LogOut size={14} /> {t('ses.forceLogout')}
                </Button>
              </article>
            ))}
          </div>
          <table className="hidden w-full text-sm xl:table">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700 text-start text-xs uppercase tracking-wide text-surface-400">
                <th className="px-4 py-3">{t('ses.user')}</th><th className="px-4 py-3">{t('ses.device')}</th><th className="px-4 py-3">{t('ses.ip')}</th>
                <th className="px-4 py-3">{t('ses.signedIn')}</th><th className="px-4 py-3">{t('ses.lastActivity')}</th><th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {result.items.map((s) => (
                <tr key={s._id} className="border-b border-surface-100 dark:border-surface-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-surface-800 dark:text-surface-100">{s.user?.name}</p>
                    <p className="text-xs text-surface-400">@{s.user?.username} · <Badge color="primary">{s.user?.role}</Badge></p>
                  </td>
                  <td className="px-4 py-3 text-surface-600 dark:text-surface-300">
                    {s.browser || t('ses.unknownBrowser')}<br />
                    <span className="text-xs text-surface-400">{s.os} · {s.deviceType}</span>
                  </td>
                  <td dir="ltr" className="px-4 py-3 font-mono text-xs text-surface-500">{s.ip}</td>
                  <td className="px-4 py-3 text-surface-400">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-surface-400">{new Date(s.lastActivityAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-end">
                    <Button size="sm" variant="danger" onClick={() => terminate(s)}><LogOut size={13} /> {t('ses.forceLogout')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Card>
      <Pagination meta={result.meta} onPage={setPage} />
    </div>
  );
}
