import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, LogOut, Trash2, Eye } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { Card, Button, Modal, Input, Select, Badge, Spinner, Pagination, EmptyState } from '../../components/ui';

const ROLE_COLORS = { admin: 'primary', teacher: 'blue', student: 'gray' };
const STATUS_COLORS = { active: 'green', suspended: 'amber', banned: 'red', pending: 'gray' };

export default function AdminUsers() {
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'student', mustChangePassword: true });

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
      toast.success(`${form.role} account created`);
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
    const { data } = await api.get(`/admin/users/${user._id}`);
    setDetailModal(data);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">User management</h1>
          <p className="text-sm text-surface-500">Create accounts, control access, reset credentials.</p>
        </div>
        <Button onClick={() => setCreateModal(true)}><Plus size={15} /> Create user</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-64"><Input placeholder="Search name, username, email..." value={filters.search}
          onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, search: e.target.value })); }} /></div>
        <Select value={filters.role} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, role: e.target.value })); }}
          options={[{ value: '', label: 'All roles' }, { value: 'admin', label: 'Admins' }, { value: 'teacher', label: 'Teachers' }, { value: 'student', label: 'Students' }]} />
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
                      <td className="px-4 py-3"><Badge color={ROLE_COLORS[u.role]}>{u.role}</Badge></td>
                      <td className="px-4 py-3"><Badge color={STATUS_COLORS[u.status]}>{u.status}</Badge></td>
                      <td className="px-4 py-3 text-surface-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Details" onClick={() => viewDetail(u)}><Eye size={14} /></Button>
                          <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetModal(u)}><KeyRound size={14} /></Button>
                          <Button size="sm" variant="ghost" title="Force logout" onClick={() => forceLogout(u)}><LogOut size={14} /></Button>
                          {u.status === 'active'
                            ? <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'suspended')}>Suspend</Button>
                            : <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'active')}>Activate</Button>}
                          {u.status !== 'banned' && <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'banned')}>Ban</Button>}
                          <Button size="sm" variant="ghost" onClick={() => deleteUser(u)}><Trash2 size={14} className="text-rose-400" /></Button>
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
              options={[{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'admin', label: 'Administrator' }]} />
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
              <p><span className="text-surface-400">Role:</span> {detailModal.user.role}</p>
              <p><span className="text-surface-400">Created:</span> {new Date(detailModal.user.createdAt).toLocaleString()}</p>
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
    </div>
  );
}
