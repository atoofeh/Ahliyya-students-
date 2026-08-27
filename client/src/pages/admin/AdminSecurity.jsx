import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MonitorSmartphone, LogIn, Lock, Smartphone, Inbox, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, Modal, Input, Select, Badge, Spinner, Pagination, EmptyState, StatCard, Tabs, Toggle, PageHeader } from '../../components/ui';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'devices', label: 'Devices' },
  { key: 'requests', label: 'Reset requests' },
  { key: 'policies', label: 'Policies' },
];

const ACTION_COLOR = (a) => (/REJECTED|MISMATCH|REUSE|BLOCKED|LOCKED/.test(a) ? 'red' : 'amber');
const when = (d) => (d ? new Date(d).toLocaleString() : '—');

/** Owner-only Security Center: what is happening, who is bound to what, and the policies that govern it. */
export default function AdminSecurity() {
  const { tab = 'overview' } = useParams();
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <PageHeader title="Security Center" subtitle="Sessions, authorized devices, reset requests and the owner-only security policy." gold />
      <Tabs tabs={TABS} active={tab} onChange={(k) => navigate(`/admin/security/${k}`)} />
      {tab === 'overview' && <Overview />}
      {tab === 'devices' && <Devices />}
      {tab === 'requests' && <Requests />}
      {tab === 'policies' && <Policies />}
    </div>
  );
}

function Overview() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/security/overview').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Spinner full />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<MonitorSmartphone size={18} />} label="Active sessions" value={data.activeSessions} />
        <StatCard icon={<LogIn size={18} />} label="Failed logins · 24h" value={data.failedLogins24h} color={data.failedLogins24h > 0 ? 'rose' : 'primary'} />
        <StatCard icon={<Lock size={18} />} label="Locked accounts" value={data.lockedAccounts} color={data.lockedAccounts > 0 ? 'amber' : 'primary'} />
        <StatCard icon={<Smartphone size={18} />} label="Device resets · 7d" value={data.deviceResets7d} />
        <StatCard icon={<Inbox size={18} />} label="Open reset requests" value={data.openResetRequests} color={data.openResetRequests > 0 ? 'gold' : 'primary'} />
      </div>

      <Card className="p-5">
        <p className="mb-3 font-semibold text-surface-800 dark:text-surface-100">Suspicious events · last 7 days</p>
        {data.suspiciousEvents7d.length === 0
          ? <p className="text-sm text-surface-400">Nothing suspicious recorded.</p>
          : (
            <div className="flex flex-wrap gap-2">
              {data.suspiciousEvents7d.map((e) => (
                <span key={e.action} className="inline-flex items-center gap-2 rounded-full border border-surface-200 px-3 py-1 text-xs dark:border-surface-700">
                  <Badge color={ACTION_COLOR(e.action)}>{e.action}</Badge>
                  <span className="font-bold tabular-nums text-surface-800 dark:text-surface-100">{e.count}</span>
                </span>
              ))}
            </div>
          )}
      </Card>

      <Card className="p-5">
        <p className="mb-3 font-semibold text-surface-800 dark:text-surface-100">Recent security audit</p>
        {data.recentSecurityAudit.length === 0 ? <EmptyState icon={<ShieldCheck size={22} />} title="No security events yet" /> : (
          <div className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {data.recentSecurityAudit.map((row) => (
              <div key={row._id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                <Badge color={ACTION_COLOR(row.action)}>{row.action}</Badge>
                <span className="text-surface-700 dark:text-surface-200">{row.user?.name || 'system'}{row.user?.username && <span className="text-surface-400"> @{row.user.username}</span>}</span>
                {row.targetUser && <span className="text-surface-400">→ {row.targetUser.name}</span>}
                {row.ip && <span className="text-surface-400">{row.ip}</span>}
                <span className="ml-auto text-surface-400">{when(row.createdAt)}</span>
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
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const revoke = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${target.userId}/device/revoke`, { reason });
      toast.success('Device revoked — the user is signed out everywhere and can sign in from a new device');
      onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!target} onClose={onClose} title={`Revoke device — ${target?.name || ''}`}>
      <div className="space-y-4">
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Student reported the laptop lost" />
        <Button className="w-full" variant="danger" loading={busy} onClick={revoke} disabled={reason.trim().length < 3}>Revoke device</Button>
      </div>
    </Modal>
  );
}

function Devices() {
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
        <div className="w-72"><Input placeholder="Search by name, username or email…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} /></div>
        <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          options={[{ value: '', label: 'Active and revoked' }, { value: 'active', label: 'Active' }, { value: 'revoked', label: 'Revoked' }]} />
      </div>
      {!result ? <Spinner full /> : (
        <>
          <Card className="overflow-x-auto">
            {result.items.length === 0 ? <EmptyState icon={<Smartphone size={22} />} title="No devices match" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-400 dark:border-surface-700">
                    <th className="px-4 py-3">User</th><th className="px-4 py-3">Device</th><th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">First authorised</th><th className="px-4 py-3">Last seen</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((d) => (
                    <tr key={d.id} className="border-b border-surface-100 dark:border-surface-700/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-surface-800 dark:text-surface-100">{d.user?.name || '—'}</p>
                        <p className="text-xs text-surface-400">@{d.user?.username} · {d.user?.role}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-surface-700 dark:text-surface-200">{d.publicId}</td>
                      <td className="px-4 py-3 text-xs text-surface-600 dark:text-surface-300">{d.platform} · {d.browser || '—'} · {d.os || '—'}</td>
                      <td className="px-4 py-3 text-xs text-surface-400">{when(d.firstAuthorizedAt)}</td>
                      <td className="px-4 py-3 text-xs text-surface-400">{when(d.lastSeenAt)}<br /><span>{d.lastIp}</span></td>
                      <td className="px-4 py-3"><Badge color={d.status === 'active' ? 'green' : 'gray'}>{d.status}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        {d.status === 'active' && d.user && d.user.role !== 'super_admin' && (
                          <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => setRevoking({ userId: d.user.id, name: d.user.name })}>Revoke</Button>
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
      ? window.prompt('Reason recorded in the audit log:', 'Device reset request approved')
      : window.prompt('Why is this request being dismissed?', '');
    if (resolution === null) return;
    setBusyId(req._id);
    try {
      await api.post(`/admin/device-requests/${req._id}/resolve`, { action, resolution });
      toast.success(action === 'revoke' ? 'Device revoked — the student can sign in from a new device' : 'Request dismissed');
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={[{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' }, { key: 'dismissed', label: 'Dismissed' }]}
        active={status} onChange={(k) => { setPage(1); setStatus(k); }} />
      {!result ? <Spinner full /> : result.items.length === 0 ? <EmptyState icon={<Inbox size={22} />} title={`No ${status} requests`} /> : (
        <>
          <Card className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {result.items.map((req) => (
              <div key={req._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-surface-800 dark:text-surface-100">{req.user?.name || req.username} <span className="text-xs text-surface-400">@{req.username} · {req.user?.role}</span></p>
                  {req.note && <p className="text-xs text-surface-600 dark:text-surface-300">“{req.note}”</p>}
                  <p className="text-[11px] text-surface-400">{when(req.createdAt)} · {req.ip}{req.resolvedBy && ` · ${status} by ${req.resolvedBy.name} ${when(req.resolvedAt)}`}{req.resolution && ` — ${req.resolution}`}</p>
                </div>
                {status === 'open' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" loading={busyId === req._id} onClick={() => resolve(req, 'revoke')}>Approve &amp; revoke</Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve(req, 'dismiss')}>Dismiss</Button>
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
      toast.success('Security policy saved and audited');
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  if (!settings) return <Spinner full />;
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }));
  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <p className="text-sm text-surface-500">These five settings are owner-only. Every change is written to the audit log as <code className="font-mono text-xs">SECURITY_SETTING_CHANGED</code>. Everything else lives in Settings.</p>
      <Select label="Inactivity timeout" value={String(settings.sessionTimeoutMinutes)} onChange={set('sessionTimeoutMinutes')}
        options={[15, 30, 60, 120].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Max failed logins before lockout" type="number" min="3" max="20" value={settings.maxLoginAttempts} onChange={set('maxLoginAttempts')} />
        <Input label="Lockout duration (minutes)" type="number" min="1" max="1440" value={settings.lockoutMinutes} onChange={set('lockoutMinutes')} />
      </div>
      <Toggle label="Require email verification" checked={!!settings.requireEmailVerification} onChange={setBool('requireEmailVerification')} />
      <Toggle label="One authorized device per account" hint="A second device is refused until an administrator revokes the first one."
        checked={!!settings.deviceBindingEnabled} onChange={setBool('deviceBindingEnabled')} />
      <Button loading={busy} onClick={save}>Save security policy</Button>
    </Card>
  );
}
