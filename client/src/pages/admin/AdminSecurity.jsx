import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MonitorSmartphone, LogIn, Lock, Smartphone, Inbox, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, Modal, Input, Select, Badge, Pagination, EmptyState, StatCard, Tabs, Toggle, PageIntro } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

const TAB_KEYS = ['overview', 'devices', 'requests', 'policies'];

const ACTION_COLOR = (a) => (/REJECTED|MISMATCH|REUSE|BLOCKED|LOCKED/.test(a) ? 'red' : 'amber');
const when = (d) => (d ? new Date(d).toLocaleString() : '—');

/** Owner-only Security Center: what is happening, who is bound to what, and the policies that govern it. */
export default function AdminSecurity() {
  const { tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      <PageIntro title={t('sec.title')} subtitle={t('sec.subtitle')} />
      <Tabs tabs={TAB_KEYS.map((k) => ({ key: k, label: t(`sec.${k}`) }))} active={tab} onChange={(k) => navigate(`/admin/security/${k}`)} />
      {tab === 'overview' && <Overview />}
      {tab === 'devices' && <Devices />}
      {tab === 'requests' && <Requests />}
      {tab === 'policies' && <Policies />}
    </div>
  );
}

function Overview() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/security/overview').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <SkeletonCard />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<MonitorSmartphone size={18} />} label={t('sec.activeSessions')} value={data.activeSessions} />
        <StatCard icon={<LogIn size={18} />} label={t('sec.failed24h')} value={data.failedLogins24h} color={data.failedLogins24h > 0 ? 'rose' : 'primary'} />
        <StatCard icon={<Lock size={18} />} label={t('sec.lockedAccounts')} value={data.lockedAccounts} color={data.lockedAccounts > 0 ? 'amber' : 'primary'} />
        <StatCard icon={<Smartphone size={18} />} label={t('sec.resets7d')} value={data.deviceResets7d} />
        <StatCard icon={<Inbox size={18} />} label={t('sec.openRequests')} value={data.openResetRequests} color={data.openResetRequests > 0 ? 'gold' : 'primary'} />
      </div>

      <Card className="p-5">
        <p className="mb-3 font-semibold text-surface-800 dark:text-surface-100">{t('sec.suspicious7d')}</p>
        {data.suspiciousEvents7d.length === 0
          ? <p className="text-sm text-surface-400">{t('sec.nothingSuspicious')}</p>
          : (
            <div className="flex flex-wrap gap-2">
              {data.suspiciousEvents7d.map((e) => (
                <span key={e.action} className="inline-flex items-center gap-2 rounded-full border border-surface-200 px-3 py-1 text-xs dark:border-surface-700">
                  <Badge color={ACTION_COLOR(e.action)}><span dir="ltr">{e.action}</span></Badge>
                  <span className="font-bold tabular-nums text-surface-800 dark:text-surface-100">{e.count}</span>
                </span>
              ))}
            </div>
          )}
      </Card>

      <Card className="p-5">
        <p className="mb-3 font-semibold text-surface-800 dark:text-surface-100">{t('sec.recentAudit')}</p>
        {data.recentSecurityAudit.length === 0 ? <EmptyState icon={<ShieldCheck size={22} />} title={t('sec.noSecurityEvents')} /> : (
          <div className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {data.recentSecurityAudit.map((row) => (
              <div key={row._id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                <Badge color={ACTION_COLOR(row.action)}><span dir="ltr">{row.action}</span></Badge>
                <span className="text-surface-700 dark:text-surface-200">{row.user?.name || t('sec.system')}{row.user?.username && <span dir="ltr" className="text-surface-400"> @{row.user.username}</span>}</span>
                {row.targetUser && <span className="text-surface-400">→ {row.targetUser.name}</span>}
                {row.ip && <span dir="ltr" className="text-surface-400">{row.ip}</span>}
                <span className="ms-auto text-surface-400">{when(row.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RevokeModal({ target, onClose, onDone }) {
  const toast = useToast();
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const revoke = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${target.userId}/device/revoke`, { reason });
      toast.success(t('usr.toastDeviceRevoked'));
      onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!target} onClose={onClose} title={t('usr.revokeTitle', { name: target?.name || '' })}>
      <div className="space-y-4">
        <Input label={t('usr.reason')} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('usr.reasonPlaceholder')} />
        <Button className="w-full" variant="danger" loading={busy} onClick={revoke} disabled={reason.trim().length < 3}>{t('usr.revokeDevice')}</Button>
      </div>
    </Modal>
  );
}

function Devices() {
  const { t } = useLanguage();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(() => {
    api.get('/admin/devices', { params: { page, limit: 25, search: search || undefined, status: status || undefined } })
      .then((r) => setResult(r.data)).catch(() => {});
  }, [page, search, status]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-72"><Input placeholder={t('sec.searchDevices')} dir="auto" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} /></div>
        <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          options={[{ value: '', label: t('sec.activeAndRevoked') }, { value: 'active', label: t('sec.statusActive') }, { value: 'revoked', label: t('sec.statusRevoked') }]} />
      </div>
      {!result ? <SkeletonCard /> : (
        <>
          <Card className="overflow-x-auto">
            {result.items.length === 0 ? <EmptyState icon={<Smartphone size={22} />} title={t('sec.noDevicesMatch')} /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-start text-xs uppercase tracking-wide text-surface-400 dark:border-surface-700">
                    <th className="px-4 py-3">{t('ses.user')}</th><th className="px-4 py-3">{t('sec.colDevice')}</th><th className="px-4 py-3">{t('sec.colPlatform')}</th>
                    <th className="px-4 py-3">{t('sec.colFirstAuthorised')}</th><th className="px-4 py-3">{t('sec.colLastSeen')}</th><th className="px-4 py-3">{t('usr.colStatus')}</th><th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((d) => (
                    <tr key={d.id} className="border-b border-surface-100 dark:border-surface-700/50">
                      <td className="px-4 py-3">
                        <p dir="auto" className="font-medium text-surface-800 dark:text-surface-100">{d.user?.name || '—'}</p>
                        <p dir="ltr" className="text-xs text-surface-400">@{d.user?.username} · {d.user?.role}</p>
                      </td>
                      <td dir="ltr" className="px-4 py-3 font-mono text-xs text-surface-700 dark:text-surface-200">{d.publicId}</td>
                      <td className="px-4 py-3 text-xs text-surface-600 dark:text-surface-300">{d.platform} · {d.browser || '—'} · {d.os || '—'}</td>
                      <td className="px-4 py-3 text-xs text-surface-400">{when(d.firstAuthorizedAt)}</td>
                      <td className="px-4 py-3 text-xs text-surface-400">{when(d.lastSeenAt)}<br /><span dir="ltr">{d.lastIp}</span></td>
                      <td className="px-4 py-3"><Badge color={d.status === 'active' ? 'green' : 'gray'}>{t(d.status === 'active' ? 'sec.statusActive' : 'sec.statusRevoked')}</Badge></td>
                      <td className="px-4 py-3 text-end">
                        {d.status === 'active' && d.user && d.user.role !== 'super_admin' && (
                          <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => setRevoking({ userId: d.user.id, name: d.user.name })}>{t('sec.revoke')}</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Pagination meta={result.meta} onPage={setPage} />
        </>
      )}
      <RevokeModal target={revoking} onClose={() => setRevoking(null)} onDone={() => { setRevoking(null); load(); }} />
    </div>
  );
}

function Requests() {
  const toast = useToast();
  const { t } = useLanguage();
  const [status, setStatus] = useState('open');
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get('/admin/device-requests', { params: { status, page, limit: 25 } }).then((r) => setResult(r.data)).catch(() => {});
  }, [status, page]);
  useEffect(() => { load(); }, [load]);

  const resolve = async (req, action) => {
    const resolution = action === 'revoke'
      ? window.prompt(t('sec.promptRevoke'), t('sec.promptRevokeDefault'))
      : window.prompt(t('sec.promptDismiss'), '');
    if (resolution === null) return;
    setBusyId(req._id);
    try {
      await api.post(`/admin/device-requests/${req._id}/resolve`, { action, resolution });
      toast.success(t(action === 'revoke' ? 'sec.toastRevoked' : 'sec.toastDismissed'));
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={[{ key: 'open', label: t('sec.reqOpen') }, { key: 'resolved', label: t('sec.reqResolved') }, { key: 'dismissed', label: t('sec.reqDismissed') }]}
        active={status} onChange={(k) => { setPage(1); setStatus(k); }} />
      {!result ? <SkeletonCard /> : result.items.length === 0
        ? <EmptyState icon={<Inbox size={22} />} title={t('sec.noRequests', { status: t(`sec.req${status.charAt(0).toUpperCase()}${status.slice(1)}`) })} /> : (
        <>
          <Card className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {result.items.map((req) => (
              <div key={req._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="font-medium text-surface-800 dark:text-surface-100">{req.user?.name || req.username} <span dir="ltr" className="text-xs text-surface-400">@{req.username} · {req.user?.role}</span></p>
                  {req.note && <p dir="auto" className="text-xs text-surface-600 dark:text-surface-300">“{req.note}”</p>}
                  <p className="text-[11px] text-surface-400">{when(req.createdAt)} · <span dir="ltr">{req.ip}</span>{req.resolvedBy && t('sec.resolvedBy', { status: t(`sec.req${status.charAt(0).toUpperCase()}${status.slice(1)}`), name: req.resolvedBy.name, date: when(req.resolvedAt) })}{req.resolution && ` — ${req.resolution}`}</p>
                </div>
                {status === 'open' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" loading={busyId === req._id} onClick={() => resolve(req, 'revoke')}>{t('sec.approveRevoke')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve(req, 'dismiss')}>{t('sec.dismiss')}</Button>
                  </div>
                )}
              </div>
            ))}
          </Card>
          <Pagination meta={result.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}

const POLICY_KEYS = ['sessionTimeoutMinutes', 'maxLoginAttempts', 'lockoutMinutes', 'requireEmailVerification', 'deviceBindingEnabled'];

function Policies() {
  const toast = useToast();
  const { t } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/admin/settings').then((r) => setSettings(r.data.settings)).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = Object.fromEntries(POLICY_KEYS.map((k) => [k, settings[k]]));
      payload.sessionTimeoutMinutes = Number(payload.sessionTimeoutMinutes);
      payload.maxLoginAttempts = Number(payload.maxLoginAttempts);
      payload.lockoutMinutes = Number(payload.lockoutMinutes);
      const { data } = await api.put('/admin/settings', payload);
      setSettings(data.settings);
      toast.success(t('sec.policySaved'));
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  if (!settings) return <SkeletonCard />;
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }));
  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <p className="text-sm text-surface-500">
        {t('sec.policyNoteBefore')}{' '}
        <code dir="ltr" className="font-mono text-xs">SECURITY_SETTING_CHANGED</code>
        {t('sec.policyNoteAfter')}
      </p>
      <Select label={t('set.inactivityTimeout')} value={String(settings.sessionTimeoutMinutes)} onChange={set('sessionTimeoutMinutes')}
        options={[15, 30, 60, 120].map((m) => ({ value: String(m), label: t('set.minutesValue', { n: m }) }))} />
      <div className="grid grid-cols-2 gap-3">
        <Input label={t('set.maxFailedLogins')} type="number" min="3" max="20" value={settings.maxLoginAttempts} onChange={set('maxLoginAttempts')} />
        <Input label={t('set.lockoutDuration')} type="number" min="1" max="1440" value={settings.lockoutMinutes} onChange={set('lockoutMinutes')} />
      </div>
      <Toggle label={t('set.requireEmail')} checked={!!settings.requireEmailVerification} onChange={setBool('requireEmailVerification')} />
      <Toggle label={t('set.oneDevice')} hint={t('sec.oneDeviceHint')}
        checked={!!settings.deviceBindingEnabled} onChange={setBool('deviceBindingEnabled')} />
      <Button loading={busy} onClick={save}>{t('sec.savePolicy')}</Button>
    </Card>
  );
}
