import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, LogOut, Smartphone, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { Card, Button, Modal, Input, Badge, Spinner, EmptyState, PageHeader } from '../../components/ui';

const STATUS_COLORS = { active: 'green', suspended: 'amber', banned: 'red' };

/** Owner-only: the administrators who run the institution day to day. */
export default function AdminAdmins() {
  const toast = useToast();
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
  }, 'Administrator created — they must change their password at first sign-in');
  const setStatus = (u, status) => run(() => api.post(`/admin/users/${u._id}/status`, { status }), `${u.name} is now ${status}`);
  const forceLogout = (u) => run(() => api.post(`/admin/users/${u._id}/force-logout`), 'All sessions ended');
  const resetPassword = () => run(async () => {
    await api.post(`/admin/users/${resetModal._id}/reset-password`, { password: newPassword });
    setResetModal(null); setNewPassword('');
  }, 'Password reset');
  const revokeDevice = () => run(async () => {
    await api.post(`/admin/users/${revokeModal._id}/device/revoke`, { reason });
    setRevokeModal(null); setReason('');
  }, 'Device revoked');

  if (!rows) return <Spinner full />;
  return (
    <div className="space-y-5">
      <PageHeader title="Administrators" subtitle="Operational admins. Only you can create, suspend or reset them." gold
        actions={<Button variant="gold" onClick={() => setCreateModal(true)}><Plus size={15} /> New administrator</Button>} />

      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState icon={<ShieldCheck size={24} />} title="No administrators yet" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-400 dark:border-surface-700">
                <th className="px-4 py-3">Administrator</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Last login</th><th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u._id} className="border-b border-surface-100 dark:border-surface-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-surface-800 dark:text-surface-100">{u.name}</p>
                    <p className="text-xs text-surface-400">@{u.username}{u.email && ` · ${u.email}`}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLORS[u.status] || 'gray'}>{u.status}</Badge>
                    {u.mustChangePassword && <Badge className="ml-1" color="amber">onboarding</Badge>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {devices[u._id]
                      ? <span className="font-mono text-surface-700 dark:text-surface-200">{devices[u._id].publicId} · {devices[u._id].platform}</span>
                      : <span className="text-surface-400">none</span>}
                  </td>
                  <td className="px-4 py-3 text-surface-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetModal(u)}><KeyRound size={14} /></Button>
                      <Button size="sm" variant="ghost" title="Force logout" onClick={() => forceLogout(u)}><LogOut size={14} /></Button>
                      {devices[u._id] && <Button size="sm" variant="ghost" title="Revoke device" onClick={() => setRevokeModal(u)}><Smartphone size={14} /></Button>}
                      {u.status === 'active'
                        ? <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'suspended')}>Suspend</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'active')}>Activate</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="New administrator">
        <div className="space-y-4">
          <Input label="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Temporary password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            hint="8+ chars, upper + lower + digit. Forced change at first sign-in." />
          <Button className="w-full" loading={busy} onClick={createAdmin}
            disabled={!form.name || form.username.length < 3 || form.password.length < 8}>Create administrator</Button>
        </div>
      </Modal>

      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={`Reset password — ${resetModal?.name || ''}`}>
        <div className="space-y-4">
          <Input label="New temporary password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Button className="w-full" loading={busy} onClick={resetPassword} disabled={newPassword.length < 8}>Reset password</Button>
        </div>
      </Modal>

      <Modal open={!!revokeModal} onClose={() => setRevokeModal(null)} title={`Revoke device — ${revokeModal?.name || ''}`}>
        <div className="space-y-4">
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button className="w-full" variant="danger" loading={busy} onClick={revokeDevice} disabled={reason.trim().length < 3}>Revoke device</Button>
        </div>
      </Modal>
    </div>
  );
}
