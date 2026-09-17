import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, LogOut, Smartphone, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, Modal, Input, Badge, EmptyState, PageIntro } from '../../components/ui';
import { SkeletonRows } from '../../components/Skeletons';

const STATUS_COLORS = { active: 'green', suspended: 'amber', banned: 'red' };

/** Owner-only: the administrators who run the institution day to day. */
export default function AdminAdmins() {
  const toast = useToast();
  const { t } = useLanguage();
  const [rows, setRows] = useState(null);
  const [devices, setDevices] = useState({});
  const [createModal, setCreateModal] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [revokeModal, setRevokeModal] = useState(null);
  const [reason, setReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });

  const load = useCallback(async () => {
    const { data } = await api.get('/admin/users', { params: { role: 'admin', limit: 100 } });
    setRows(data.items);
    const entries = await Promise.all(data.items.map((u) =>
      api.get(`/admin/users/${u._id}/device`).then((r) => [u._id, r.data.active]).catch(() => [u._id, null])));
    setDevices(Object.fromEntries(entries));
  }, []);
  useEffect(() => { const t = setTimeout(() => load().catch(() => {}), 0); return () => clearTimeout(t); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const createAdmin = () => run(async () => {
    await api.post('/admin/users', { ...form, email: form.email || undefined, role: 'admin', mustChangePassword: true });
    setCreateModal(false); setForm({ name: '', username: '', email: '', password: '' });
  }, t('adm2.created'));
  const setStatus = (u, status) => run(
    () => api.post(`/admin/users/${u._id}/status`, { status }),
    t('adm2.statusChanged', { name: u.name, status: t(`usr.status${status.charAt(0).toUpperCase()}${status.slice(1)}`) })
  );
  const forceLogout = (u) => run(() => api.post(`/admin/users/${u._id}/force-logout`), t('adm2.sessionsEnded'));
  const resetPassword = () => run(async () => {
    await api.post(`/admin/users/${resetModal._id}/reset-password`, { password: newPassword });
    setResetModal(null); setNewPassword('');
  }, t('adm2.passwordReset'));
  const revokeDevice = () => run(async () => {
    await api.post(`/admin/users/${revokeModal._id}/device/revoke`, { reason });
    setRevokeModal(null); setReason('');
  }, t('adm2.deviceRevoked'));

  if (!rows) return <SkeletonRows />;
  return (
    <div className="space-y-5">
      <PageIntro title={t('adm2.title')} subtitle={t('adm2.subtitle')}
        actions={<Button variant="gold" onClick={() => setCreateModal(true)}><Plus size={15} /> {t('adm2.new')}</Button>} />

      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState icon={<ShieldCheck size={24} />} title={t('adm2.none')} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-start text-xs uppercase tracking-wide text-surface-400 dark:border-surface-700">
                <th className="px-4 py-3">{t('adm2.colAdmin')}</th><th className="px-4 py-3">{t('usr.colStatus')}</th><th className="px-4 py-3">{t('adm2.colDevice')}</th>
                <th className="px-4 py-3">{t('usr.colLastLogin')}</th><th className="px-4 py-3 text-end">{t('usr.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u._id} className="border-b border-surface-100 dark:border-surface-700/50">
                  <td className="px-4 py-3">
                    <p dir="auto" className="font-medium text-surface-800 dark:text-surface-100">{u.name}</p>
                    <p dir="ltr" className="text-xs text-surface-400">@{u.username}{u.email && ` · ${u.email}`}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLORS[u.status] || 'gray'}>{t(`usr.status${u.status.charAt(0).toUpperCase()}${u.status.slice(1)}`)}</Badge>
                    {u.mustChangePassword && <Badge className="ms-1" color="amber">{t('adm2.onboarding')}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {devices[u._id]
                      ? <span dir="ltr" className="font-mono text-surface-700 dark:text-surface-200">{devices[u._id].publicId} · {devices[u._id].platform}</span>
                      : <span className="text-surface-400">{t('adm2.noDevice')}</span>}
                  </td>
                  <td className="px-4 py-3 text-surface-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : t('usr.never')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title={t('usr.resetPassword')} onClick={() => setResetModal(u)}><KeyRound size={14} /></Button>
                      <Button size="sm" variant="ghost" title={t('usr.forceLogout')} onClick={() => forceLogout(u)}><LogOut size={14} /></Button>
                      {devices[u._id] && <Button size="sm" variant="ghost" title={t('usr.revokeDevice')} onClick={() => setRevokeModal(u)}><Smartphone size={14} /></Button>}
                      {u.status === 'active'
                        ? <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'suspended')}>{t('usr.suspend')}</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'active')}>{t('usr.activate')}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title={t('adm2.new')}>
        <div className="space-y-4">
          <Input label={t('usr.fullName')} dir="auto" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label={t('usr.username')} dir="ltr" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
          <Input label={t('usr.emailOptional')} dir="ltr" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label={t('usr.tempPassword')} dir="ltr" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            hint={t('adm2.tempHint')} />
          <Button className="w-full" loading={busy} onClick={createAdmin}
            disabled={!form.name || form.username.length < 3 || form.password.length < 8}>{t('adm2.createAdmin')}</Button>
        </div>
      </Modal>

      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={t('usr.resetTitle', { name: resetModal?.name || '' })}>
        <div className="space-y-4">
          <Input label={t('usr.newTempPassword')} dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Button className="w-full" loading={busy} onClick={resetPassword} disabled={newPassword.length < 8}>{t('usr.resetPassword')}</Button>
        </div>
      </Modal>

      <Modal open={!!revokeModal} onClose={() => setRevokeModal(null)} title={t('usr.revokeTitle', { name: revokeModal?.name || '' })}>
        <div className="space-y-4">
          <Input label={t('usr.reason')} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button className="w-full" variant="danger" loading={busy} onClick={revokeDevice} disabled={reason.trim().length < 3}>{t('usr.revokeDevice')}</Button>
        </div>
      </Modal>
    </div>
  );
}
