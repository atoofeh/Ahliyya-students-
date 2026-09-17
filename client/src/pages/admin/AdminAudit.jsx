import { useEffect, useState, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import api from '../../api/axios';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Badge, Pagination, EmptyState, Input, Tabs } from '../../components/ui';
import { SkeletonRows } from '../../components/Skeletons';

const ACTION_COLOR = (a) => {
  if (/FAILED|BANNED|LOCKED|MISMATCH|DELETED|INVALIDATED|CHEAT/.test(a)) return 'red';
  if (/SUSPENDED|FORCE|RESET|MAINTENANCE|TERMINATED/.test(a)) return 'amber';
  if (/CREATED|ENROLLED|UPLOADED|PUBLISHED|VERIFIED/.test(a)) return 'green';
  return 'gray';
};

export default function AdminAudit() {
  const { t } = useLanguage();
  const [tab, setTab] = useState('audit');
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const load = useCallback(() => {
    setResult(null);
    const url = tab === 'audit' ? '/admin/audit-logs' : '/admin/login-history';
    api.get(url, { params: { page, limit: 30, ...(tab === 'audit' && action ? { action } : {}) } })
      .then(({ data }) => setResult(data)).catch(() => {});
  }, [tab, page, action]);
  useEffect(() => { const t = setTimeout(load, action ? 300 : 0); return () => clearTimeout(t); }, [load, action]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('aud.title')}</h1>
        <p className="text-sm text-surface-500">{t('aud.subtitle')}</p>
      </div>

      <Tabs active={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[
        { key: 'audit', label: t('aud.trail') },
        { key: 'logins', label: t('aud.loginHistory') },
      ]} />

      {tab === 'audit' && (
        <div className="w-72">
          <Input placeholder={t('aud.filterPlaceholder')} dir="ltr" value={action}
            onChange={(e) => { setPage(1); setAction(e.target.value.toUpperCase().replace(/\s+/g, '_')); }} />
        </div>
      )}

      {!result ? <SkeletonRows /> : (
        <>
          <Card>
            {result.items.length === 0 ? <EmptyState icon={<ScrollText size={24} />} title={t('aud.empty')} /> : (
              <div className="divide-y divide-surface-100 dark:divide-surface-700">
                {result.items.map((log) => (
                  <div key={log._id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    {tab === 'audit' ? (
                      <>
                        <Badge color={ACTION_COLOR(log.action)}><span dir="ltr">{log.action}</span></Badge>
                        <span className="text-surface-700 dark:text-surface-200">{log.user?.name || t('aud.system')}</span>
                        {log.targetUser && <span className="text-surface-400">→ {log.targetUser.name}</span>}
                        {log.course && <span className="text-surface-400">· {log.course.title}</span>}
                        {log.resource && <span dir="ltr" className="font-mono text-xs text-surface-400">{log.resource}</span>}
                        {log.ip && <span dir="ltr" className="font-mono text-xs text-surface-300">{log.ip}</span>}
                      </>
                    ) : (
                      <>
                        <Badge color={log.success ? 'green' : 'red'}>{log.success ? 'SUCCESS' : (log.reason || 'FAILED').toUpperCase()}</Badge>
                        <span className="text-surface-700 dark:text-surface-200">{log.user?.name || log.username}</span>
                        <span className="text-xs text-surface-400">{log.browser} · {log.os}</span>
                        <span dir="ltr" className="font-mono text-xs text-surface-300">{log.ip}</span>
                      </>
                    )}
                    <span className="ms-auto text-xs text-surface-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Pagination meta={result.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
