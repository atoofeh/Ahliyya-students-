import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, LogOut, Trash2, Eye, Smartphone } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { useConfirm } from '../../hooks/useConfirm';
import { Card, Button, Modal, Input, Select, Badge, Spinner, Pagination, EmptyState, Tabs } from '../../components/ui';
import { SkeletonRows } from '../../components/Skeletons';

const ROLE_COLORS = { super_admin: 'gold', admin: 'primary', teacher: 'blue', student: 'gray' };
const STATUS_COLORS = { active: 'green', suspended: 'amber', banned: 'red', pending: 'gray' };

export default function AdminUsers() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const isOwner = me?.role === 'super_admin';
  const [result, setResult] = useState(null);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [revokeModal, setRevokeModal] = useState(null); // { user }
  const [completingDeletionRequest, setCompletingDeletionRequest] = useState(null);
  const [retainGradesForDeletion, setRetainGradesForDeletion] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'student', mustChangePassword: true, reviewerAccess: false });

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
  const loadDeletionRequests = useCallback(() => {
    api.get('/admin/account-deletion-requests', { params: { status: 'open', limit: 100 } })
      .then(({ data }) => setDeletionRequests(data.items))
      .catch(() => setDeletionRequests([]));
  }, []);
  useEffect(() => { const t = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(t); }, [load, filters.search]);
  useEffect(() => { const t = setTimeout(loadDeletionRequests, 0); return () => clearTimeout(t); }, [loadDeletionRequests]);

  const createUser = async () => {
    setBusy(true);
    try {
      await api.post('/admin/users', { ...form, email: form.email || undefined });
      toast.success(t('usr.accountCreated', { role: t(`role.${form.role}`) }));
      setCreateModal(false);
      setForm({ name: '', username: '', email: '', password: '', role: 'student', mustChangePassword: true, reviewerAccess: false });
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
      toast.success(t('usr.toastLoggedOut'));
    } catch (err) { toast.error(apiError(err)); }
  };

  const deleteUser = async (user) => {
    if (!(await confirm(t('usr.confirmDelete', { name: user.name })))) return;
    try {
      await api.delete(`/admin/users/${user._id}`);
      toast.success(t('usr.toastDeleted'));
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const resolveDeletionRequest = async (request, action, retainGrades = false) => {
    setBusy(true);
    try {
      await api.post(`/admin/account-deletion-requests/${request._id}/resolve`, { action, retainGrades });
      toast.success(t(action === 'complete' ? 'usr.deletionCompleted' : 'usr.deletionDismissed'));
      setCompletingDeletionRequest(null);
      loadDeletionRequests();
      load();
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${resetModal._id}/reset-password`, { password: newPassword });
      toast.success(t('usr.toastPasswordReset'));
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
      toast.success(t('usr.toastDeviceRevoked'));
      setRevokeModal(null); setRevokeReason('');
      viewDetail({ _id: revokeModal.user.id });
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('usr.title')}</h1>
          <p className="text-sm text-surface-500">{t('usr.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateModal(true)}><Plus size={15} /> {t('usr.createUser')}</Button>
      </div>

      {deletionRequests.length > 0 && (
        <Card className="space-y-3 border-rose-200 p-4 dark:border-rose-500/30">
          <div className="flex items-center gap-2">
            <Trash2 size={17} className="text-rose-500" />
            <h2 className="font-semibold text-surface-900 dark:text-white">{t('usr.deletionRequests')}</h2>
            <Badge color="red">{deletionRequests.length}</Badge>
          </div>
          <p className="text-xs text-surface-500">{t('usr.deletionRequestsHint')}</p>
          <p className="text-xs text-surface-500">{t('usr.deletionContactHint')}</p>
          {deletionRequests.map((request) => (
            <div key={request._id} className="flex flex-col gap-3 rounded-xl border border-surface-200 p-3 dark:border-surface-700 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-surface-800 dark:text-surface-100">{request.user?.name || t('usr.deletedAccount')} · @{request.user?.username || '—'}</p>
                <p dir="ltr" className="text-xs text-surface-400">{request.user?.email || '—'} · {new Date(request.createdAt).toLocaleString()} · {t('usr.deletionDueBy', { date: new Date(new Date(request.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString() })}</p>
                {request.reason && <p dir="auto" className="mt-1 text-sm text-surface-600 dark:text-surface-300">{request.reason}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => { setRetainGradesForDeletion(false); setCompletingDeletionRequest(request); }}>{t('usr.completeDeletion')}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveDeletionRequest(request, 'dismiss')}>{t('usr.dismissRequest')}</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Tabs
        tabs={[
          { key: '', label: t('usr.all') }, { key: 'student', label: t('usr.students') }, { key: 'teacher', label: t('usr.teachers') },
          ...(isOwner ? [{ key: 'admin', label: t('usr.admins') }] : []),
        ]}
        active={filters.role}
        onChange={(role) => { setPage(1); setFilters((f) => ({ ...f, role })); }}
      />

      <div className="flex flex-wrap gap-3">
        <div className="w-64"><Input placeholder={t('usr.searchPlaceholder')} dir="auto" value={filters.search}
          onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, search: e.target.value })); }} /></div>
        <Select value={filters.status} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, status: e.target.value })); }}
          options={[{ value: '', label: t('usr.allStatuses') }, { value: 'active', label: t('usr.statusActive') }, { value: 'suspended', label: t('usr.statusSuspended') }, { value: 'banned', label: t('usr.statusBanned') }]} />
      </div>

      {!result ? <SkeletonRows /> : (
        <>
          <Card className="overflow-x-auto">
            {result.items.length === 0 ? <EmptyState title={t('usr.noMatch')} /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 dark:border-surface-700 text-start text-xs uppercase tracking-wide text-surface-400">
                    <th className="px-4 py-3">{t('usr.colUser')}</th><th className="px-4 py-3">{t('usr.colRole')}</th><th className="px-4 py-3">{t('usr.colStatus')}</th>
                    <th className="px-4 py-3">{t('usr.colLastLogin')}</th><th className="px-4 py-3 text-end">{t('usr.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((u) => (
                    <tr key={u._id} className="border-b border-surface-100 dark:border-surface-700/50 hover:bg-surface-50 dark:hover:bg-surface-700/30">
                      <td className="px-4 py-3">
                        <p dir="auto" className="font-medium text-surface-800 dark:text-surface-100">{u.name}</p>
                        <p dir="ltr" className="text-xs text-surface-400">@{u.username}{u.email && ` · ${u.email}`}</p>
                      </td>
                      <td className="px-4 py-3"><Badge color={ROLE_COLORS[u.role]}>{t(`role.${u.role}`)}</Badge></td>
                      <td className="px-4 py-3"><Badge color={STATUS_COLORS[u.status]}>{t(`usr.status${u.status.charAt(0).toUpperCase()}${u.status.slice(1)}`)}</Badge></td>
                      <td className="px-4 py-3 text-surface-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : t('usr.never')}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title={t('usr.details')} onClick={() => viewDetail(u)}><Eye size={14} /></Button>
                          {canManage(u) && (
                            <>
                              <Button size="sm" variant="ghost" title={t('usr.resetPassword')} onClick={() => setResetModal(u)}><KeyRound size={14} /></Button>
                              <Button size="sm" variant="ghost" title={t('usr.forceLogout')} onClick={() => forceLogout(u)}><LogOut size={14} /></Button>
                              {u.status === 'active'
                                ? <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'suspended')}>{t('usr.suspend')}</Button>
                                : <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'active')}>{t('usr.activate')}</Button>}
                              {u.status !== 'banned' && <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'banned')}>{t('usr.ban')}</Button>}
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

      <Modal open={createModal} onClose={() => setCreateModal(false)} title={t('usr.createUser')}>
        <div className="space-y-4">
          <Input label={t('usr.fullName')} dir="auto" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('usr.username')} dir="ltr" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
            <Select label={t('usr.role')} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              options={[
                { value: 'student', label: t('usr.roleStudent') },
                { value: 'teacher', label: t('usr.roleTeacher') },
                ...(isOwner ? [{ value: 'admin', label: t('usr.roleAdmin') }] : []),
              ]} />
          </div>
          <Input label={t('usr.emailOptional')} dir="ltr" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label={t('usr.tempPassword')} dir="ltr" type="text" value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            hint={t('usr.tempPasswordHint')} />
          {isOwner && form.role === 'student' && (
            <label className="flex items-start gap-2 rounded-xl border border-surface-200 p-3 text-sm dark:border-surface-700">
              <input type="checkbox" className="mt-1 accent-brand-600" checked={form.reviewerAccess}
                onChange={(e) => setForm((f) => ({ ...f, reviewerAccess: e.target.checked }))} />
              <span>
                <span className="font-medium text-surface-800 dark:text-surface-100">{t('usr.reviewerAccess')}</span>
                <span className="mt-1 block text-xs text-surface-500">{t('usr.reviewerAccessHint')}</span>
              </span>
            </label>
          )}
          <Button className="w-full" loading={busy} onClick={createUser}
            disabled={!form.name || !form.username || form.password.length < 8}>{t('usr.createAccount')}</Button>
        </div>
      </Modal>

      <Modal open={!!completingDeletionRequest} onClose={() => setCompletingDeletionRequest(null)} title={t('usr.completeDeletionTitle')}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-surface-600 dark:text-surface-300">
            {t('usr.confirmDeletionRequest', { name: completingDeletionRequest?.user?.name || completingDeletionRequest?.user?.username || '' })}
          </p>
          <label className="flex items-start gap-2 rounded-xl border border-surface-200 p-3 text-sm dark:border-surface-700">
            <input type="checkbox" className="mt-1 accent-brand-600" checked={retainGradesForDeletion} onChange={(e) => setRetainGradesForDeletion(e.target.checked)} />
            <span>
              <span className="font-medium text-surface-800 dark:text-surface-100">{t('usr.retainGradesLabel')}</span>
              <span className="mt-1 block text-xs text-surface-500">{t('usr.retainGradesHint')}</span>
            </span>
          </label>
          <div className="flex justify-end">
            <Button variant="danger" loading={busy} onClick={() => resolveDeletionRequest(completingDeletionRequest, 'complete', retainGradesForDeletion)}>{t('usr.completeDeletion')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={t('usr.resetTitle', { name: resetModal?.name || '' })}>
        <div className="space-y-4">
          <Input label={t('usr.newTempPassword')} dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            hint={t('usr.newTempHint')} />
          <Button className="w-full" loading={busy} onClick={resetPassword} disabled={newPassword.length < 8}>{t('usr.resetPassword')}</Button>
        </div>
      </Modal>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={t('usr.detailTitle', { name: detailModal?.user?.name || '' })} wide>
        {detailModal?.loading ? <Spinner /> : detailModal && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <p><span className="text-surface-400">{t('usr.fieldUsername')}</span> <span dir="ltr">@{detailModal.user.username}</span></p>
              <p><span className="text-surface-400">{t('usr.fieldEmail')}</span> <span dir="ltr">{detailModal.user.email || '—'}</span> {detailModal.user.emailVerified && <Badge color="green">{t('usr.verified')}</Badge>}</p>
              <p><span className="text-surface-400">{t('usr.fieldRole')}</span> {t(`role.${detailModal.user.role}`)}</p>
              <p><span className="text-surface-400">{t('usr.fieldCreated')}</span> {new Date(detailModal.user.createdAt).toLocaleString()}</p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Smartphone size={15} /> {t('usr.authorizedDevice')}</p>
              {!detailModal.device?.active ? (
                <p className="text-xs text-surface-400">{t('usr.noDevice')}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-surface-200 px-3 py-2 text-xs dark:border-surface-700">
                  <span dir="ltr" className="font-mono font-semibold text-surface-800 dark:text-surface-100">{detailModal.device.active.publicId}</span>
                  <span className="text-surface-600 dark:text-surface-300">{detailModal.device.active.platform} · {detailModal.device.active.browser || '—'} · {detailModal.device.active.os || '—'}</span>
                  <span className="text-surface-400">{t('usr.firstSeen', { date: new Date(detailModal.device.active.firstAuthorizedAt).toLocaleString() })}</span>
                  <span className="text-surface-400">{t('usr.lastSeen', { date: new Date(detailModal.device.active.lastSeenAt).toLocaleString() })}</span>
                  {canManage({ _id: detailModal.user.id, role: detailModal.user.role }) && (
                    <Button size="sm" variant="ghost" className="ms-auto text-rose-500" onClick={() => setRevokeModal({ user: detailModal.user })}>{t('usr.revokeDevice')}</Button>
                  )}
                </div>
              )}
              {detailModal.device?.history?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {detailModal.device.history.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-2 text-[11px] text-surface-400">
                      <Badge color="gray">{t('usr.revokedBadge')}</Badge>
                      <span dir="ltr" className="font-mono">{d.publicId}</span>
                      <span dir="auto">{d.revocationReason}</span>
                      <span className="ms-auto">{d.revokedBy?.name ? t('usr.revokedBy', { name: d.revokedBy.name }) : ''}{new Date(d.revokedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 font-semibold text-surface-800 dark:text-surface-100">{t('usr.recentSessions')}</p>
              {detailModal.sessions.map((s) => (
                <div key={s._id} className="flex items-center gap-2 border-b border-surface-100 dark:border-surface-700 py-1.5 text-xs">
                  <Badge color={s.isActive ? 'green' : 'gray'}>{s.isActive ? t('usr.sessionActive') : s.endReason || t('usr.sessionEnded')}</Badge>
                  <span className="text-surface-600 dark:text-surface-300">{s.browser} · {s.os}</span>
                  <span dir="ltr" className="text-surface-400">{s.ip}</span>
                  <span className="ms-auto text-surface-400">{new Date(s.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 font-semibold text-surface-800 dark:text-surface-100">{t('usr.loginHistory')}</p>
              <div className="max-h-48 overflow-y-auto">
                {detailModal.loginHistory.map((h) => (
                  <div key={h._id} className="flex items-center gap-2 border-b border-surface-100 dark:border-surface-700 py-1.5 text-xs">
                    <Badge color={h.success ? 'green' : 'red'}>{h.success ? t('usr.loginSuccess') : h.reason}</Badge>
                    <span dir="ltr" className="text-surface-400">{h.ip} · {h.browser}</span>
                    <span className="ms-auto text-surface-400">{new Date(h.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            {detailModal.enrollments.length > 0 && (
              <div>
                <p className="mb-2 font-semibold text-surface-800 dark:text-surface-100">{t('usr.enrollments')}</p>
                {detailModal.enrollments.map((e) => (
                  <div key={e._id} className="flex items-center gap-2 py-1 text-xs">
                    <span dir="auto" className="text-surface-600 dark:text-surface-300">{e.course?.title}</span>
                    <Badge>{e.status}</Badge>
                    <span className="ms-auto text-surface-400">{e.progressPercent}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!revokeModal} onClose={() => setRevokeModal(null)} title={t('usr.revokeTitle', { name: revokeModal?.user?.name || '' })}>
        <div className="space-y-4">
          <p className="text-sm text-surface-600 dark:text-surface-300">{t('usr.revokeExplain')}</p>
          <Input label={t('usr.reason')} dir="auto" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder={t('usr.reasonPlaceholder')} />
          <Button className="w-full" variant="danger" loading={busy} onClick={revokeDevice} disabled={revokeReason.trim().length < 3}>{t('usr.revokeDevice')}</Button>
        </div>
      </Modal>
    </div>
  );
}
