import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, LogOut, Trash2, Eye, Smartphone } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABEL } from '../../utils/roles';
import { Card, Button, Modal, Input, Select, Badge, Spinner, Pagination, EmptyState, Tabs } from '../../components/ui';

const ROLE_COLORS = { super_admin: 'gold', admin: 'primary', teacher: 'blue', student: 'gray' };
const STATUS_COLORS = { active: 'green', suspended: 'amber', banned: 'red', pending: 'gray' };

export default function AdminUsers() {
  const toast = useToast();
  const { user: me } = useAuth();
  const isOwner = me?.role === 'super_admin';
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [revokeModal, setRevokeModal] = useState(null); // { user }
  const [revokeReason, setRevokeReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'student', mustChangePassword: true });

  /** Mirrors the server's assertCanManage: which accounts may I act on? */
  const canManage = (u) => {
    if (String(u._id) === String(me?.id)) return false;
    if (u.role === 'super_admin') return false;
    if (u.role === 'admin' && !isOwner) return false;
    return true;
  };

  const load = useCallback(() => {
    api.get('/admin/users', {
      params: { page, limit: 20, search: filters.search || undefined, role: filters.role || undefined, status: filters.status || undefined },
    }).then(({ data }) => setResult(data)).catch(() => {});
  }, [page, filters]);
  useEffect(() => { const t = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(t); }, [load, filters.search]);

  const createUser = async () => {
    setBusy(true);
    try {
      await api.post('/admin/users', { ...form, email: form.email || undefined });
      toast.success(`${ROLE_LABEL[form.role] || form.role} account created`);
      setCreateModal(false);
      setForm({ name: '', username: '', email: '', password: '', role: 'student', mustChangePassword: true });
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const setStatus = async (user, status) => {
    try {
      await api.post(`/admin/users/${user._id}/status`, { status });
      toast.success(`${user.name} is now ${status}`);
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const forceLogout = async (user) => {
    try {
      await api.post(`/admin/users/${user._id}/force-logout`);
      toast.success('All sessions terminated');
    } catch (err) { toast.error(apiError(err)); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.name}? This is a soft delete — records are preserved but the account is disabled.`)) return;
    try {
      await api.delete(`/admin/users/${user._id}`);
      toast.success('User deleted');
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${resetModal._id}/reset-password`, { password: newPassword });
      toast.success('Password reset — user must change it at next login');
      setResetModal(null); setNewPassword('');
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const viewDetail = async (user) => {
    setDetailModal({ loading: true });
    const [{ data }, device] = await Promise.all([
      api.get(`/admin/users/${user._id}`),
      api.get(`/admin/users/${user._id}/device`).then((r) => r.data).catch(() => null),
    ]);
    setDetailModal({ ...data, device });
  };

  const revokeDevice = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${revokeModal.user.id}/device/revoke`, { reason: revokeReason });
      toast.success('Device revoked — the user is signed out everywhere and can sign in from a new device');
      setRevokeModal(null); setRevokeReason('');
      viewDetail({ _id: revokeModal.user.id });
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">User management</h1>
          <p className="text-sm text-surface-500">Create accounts, control access, reset credentials and devices.</p>
        </div>
        <Button onClick={() => setCreateModal(true)}><Plus size={15} /> Create user</Button>
      </div>

      <Tabs
        tabs={[
          { key: '', label: 'All' }, { key: 'student', label: 'Students' }, { key: 'teacher', label: 'Teachers' },
          ...(isOwner ? [{ key: 'admin', label: 'Admins' }] : []),
        ]}
        active={filters.role}
        onChange={(role) => { setPage(1); setFilters((f) => ({ ...f, role })); }}
      />

      <div className="flex flex-wrap gap-3">
        <div className="w-64"><Input placeholder="Search name, username, email..." value={filters.search}
          onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, search: e.target.value })); }} /></div>
        <Select value={filters.status} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, status: e.target.value })); }}
          options={[{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'banned', label: 'Banned' }]} />
      </div>

      {!result ? <Spinner full /> : (
        <>
          <Card className="overflow-x-auto">
            {result.items.length === 0 ? <EmptyState title="No users match" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 dark:border-surface-700 text-left text-xs uppercase tracking-wide text-surface-400">
                    <th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last login</th><th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((u) => (
                    <tr key={u._id} className="border-b border-surface-100 dark:border-surface-700/50 hover:bg-surface-50 dark:hover:bg-surface-700/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-surface-800 dark:text-surface-100">{u.name}</p>
                        <p className="text-xs text-surface-400">@{u.username}{u.email && ` · ${u.email}`}</p>
                      </td>
                      <td className="px-4 py-3"><Badge color={ROLE_COLORS[u.role]}>{ROLE_LABEL[u.role] || u.role}</Badge></td>
                      <td className="px-4 py-3"><Badge color={STATUS_COLORS[u.status]}>{u.status}</Badge></td>
                      <td className="px-4 py-3 text-surface-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Details" onClick={() => viewDetail(u)}><Eye size={14} /></Button>
                          {canManage(u) && (
                            <>
                              <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetModal(u)}><KeyRound size={14} /></Button>
                              <Button size="sm" variant="ghost" title="Force logout" onClick={() => forceLogout(u)}><LogOut size={14} /></Button>
                              {u.status === 'active'
                                ? <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'suspended')}>Suspend</Button>
                                : <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'active')}>Activate</Button>}
                              {u.status !== 'banned' && <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'banned')}>Ban</Button>}
                              <Button size="sm" variant="ghost" onClick={() => deleteUser(u)}><Trash2 size={14} className="text-rose-400" /></Button>
                            </>
                          )}
                        </div>
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

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create user">
        <div className="space-y-4">
          <Input label="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
            <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              options={[
                { value: 'student', label: 'Student' },
                { value: 'teacher', label: 'Teacher' },
                ...(isOwner ? [{ value: 'admin', label: 'Administrator' }] : []),
              ]} />
          </div>
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Temporary password" type="text" value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            hint="8+ chars, upper + lower + digit. User is forced to change it on first login." />
          <Button className="w-full" loading={busy} onClick={createUser}
            disabled={!form.name || !form.username || form.password.length < 8}>Create account</Button>
        </div>
      </Modal>

      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={`Reset password — ${resetModal?.name || ''}`}>
        <div className="space-y-4">
          <Input label="New temporary password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            hint="User is logged out everywhere and must set a new password on next login." />
          <Button className="w-full" loading={busy} onClick={resetPassword} disabled={newPassword.length < 8}>Reset password</Button>
        </div>
      </Modal>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={`User detail — ${detailModal?.user?.name || ''}`} wide>
        {detailModal?.loading ? <Spinner /> : detailModal && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <p><span className="text-surface-400">Username:</span> @{detailModal.user.username}</p>
              <p><span className="text-surface-400">Email:</span> {detailModal.user.email || '—'} {detailModal.user.emailVerified && <Badge color="green">verified</Badge>}</p>
              <p><span className="text-surface-400">Role:</span> {ROLE_LABEL[detailModal.user.role] || detailModal.user.role}</p>
              <p><span className="text-surface-400">Created:</span> {new Date(detailModal.user.createdAt).toLocaleString()}</p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Smartphone size={15} /> Authorized device</p>
              {!detailModal.device?.active ? (
                <p className="text-xs text-surface-400">No authorized device — the next sign-in will bind one.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-surface-200 px-3 py-2 text-xs dark:border-surface-700">
                  <span className="font-mono font-semibold text-surface-800 dark:text-surface-100">{detailModal.device.active.publicId}</span>
                  <span className="text-surface-600 dark:text-surface-300">{detailModal.device.active.platform} · {detailModal.device.active.browser || '—'} · {detailModal.device.active.os || '—'}</span>
                  <span className="text-surface-400">first {new Date(detailModal.device.active.firstAuthorizedAt).toLocaleString()}</span>
                  <span className="text-surface-400">last seen {new Date(detailModal.device.active.lastSeenAt).toLocaleString()}</span>
                  {canManage({ _id: detailModal.user.id, role: detailModal.user.role }) && (
                    <Button size="sm" variant="ghost" className="ml-auto text-rose-500" onClick={() => setRevokeModal({ user: detailModal.user })}>Revoke device</Button>
                  )}
                </div>
              )}
              {detailModal.device?.history?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {detailModal.device.history.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-2 text-[11px] text-surface-400">
                      <Badge color="gray">revoked</Badge>
                      <span className="font-mono">{d.publicId}</span>
                      <span>{d.revocationReason}</span>
                      <span className="ml-auto">{d.revokedBy?.name ? `by ${d.revokedBy.name} · ` : ''}{new Date(d.revokedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 font-semibold text-surface-800 dark:text-surface-100">Recent sessions</p>
              {detailModal.sessions.map((s) => (
                <div key={s._id} className="flex items-center gap-2 border-b border-surface-100 dark:border-surface-700 py-1.5 text-xs">
                  <Badge color={s.isActive ? 'green' : 'gray'}>{s.isActive ? 'active' : s.endReason || 'ended'}</Badge>
                  <span className="text-surface-600 dark:text-surface-300">{s.browser} · {s.os}</span>
                  <span className="text-surface-400">{s.ip}</span>
                  <span className="ml-auto text-surface-400">{new Date(s.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 font-semibold text-surface-800 dark:text-surface-100">Login history</p>
              <div className="max-h-48 overflow-y-auto">
                {detailModal.loginHistory.map((h) => (
                  <div key={h._id} className="flex items-center gap-2 border-b border-surface-100 dark:border-surface-700 py-1.5 text-xs">
                    <Badge color={h.success ? 'green' : 'red'}>{h.success ? 'success' : h.reason}</Badge>
                    <span className="text-surface-400">{h.ip} · {h.browser}</span>
                    <span className="ml-auto text-surface-400">{new Date(h.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            {detailModal.enrollments.length > 0 && (
              <div>
                <p className="mb-2 font-semibold text-surface-800 dark:text-surface-100">Enrollments</p>
                {detailModal.enrollments.map((e) => (
                  <div key={e._id} className="flex items-center gap-2 py-1 text-xs">
                    <span className="text-surface-600 dark:text-surface-300">{e.course?.title}</span>
                    <Badge>{e.status}</Badge>
                    <span className="ml-auto text-surface-400">{e.progressPercent}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!revokeModal} onClose={() => setRevokeModal(null)} title={`Revoke device — ${revokeModal?.user?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-surface-600 dark:text-surface-300">
            All sessions end immediately and the account can be signed in from a new device. This is recorded in the audit log.
          </p>
          <Input label="Reason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="e.g. Student reported the laptop lost" />
          <Button className="w-full" variant="danger" loading={busy} onClick={revokeDevice} disabled={revokeReason.trim().length < 3}>Revoke device</Button>
        </div>
      </Modal>
    </div>
  );
}
