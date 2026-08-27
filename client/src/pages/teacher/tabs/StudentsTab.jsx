import { useEffect, useState, useCallback } from 'react';
import { KeyRound, UserPlus, UserMinus, CalendarClock, Copy } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../context/ToastContext';
import { Card, Button, Modal, Input, Badge, EmptyState, Spinner, ProgressBar, Pagination } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';

export default function StudentsTab({ courseId }) {
  const toast = useToast();
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [page, setPage] = useState(1);
  const [codes, setCodes] = useState(null);
  const [codeForm, setCodeForm] = useState({ count: 5, maxUses: 1, expiresInDays: '', grantsAccessDays: '' });
  const [assignName, setAssignName] = useState('');
  const [expireModal, setExpireModal] = useState(null);
  const [expireDate, setExpireDate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/enrollments/courses/${courseId}/students`, { params: { page, limit: 20 } })
      .then(({ data }) => setStudents(data)).catch(() => {});
    if (user?.role === 'admin') {
      api.get(`/enrollments/courses/${courseId}/codes`, { params: { limit: 50 } })
        .then(({ data }) => setCodes(data.items)).catch(() => {});
    }
  }, [courseId, page, user?.role]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post(`/enrollments/courses/${courseId}/codes`, {
        count: Number(codeForm.count) || 1,
        maxUses: Number(codeForm.maxUses) || 1,
        ...(codeForm.expiresInDays && { expiresInDays: Number(codeForm.expiresInDays) }),
        ...(codeForm.grantsAccessDays && { grantsAccessDays: Number(codeForm.grantsAccessDays) }),
      });
      toast.success('Codes generated');
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const assign = async () => {
    if (!assignName.trim()) return;
    try {
      await api.post(`/enrollments/courses/${courseId}/students`, { student: assignName.trim() });
      toast.success('Student enrolled');
      setAssignName('');
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const remove = async (studentId) => {
    if (!window.confirm('Remove this student from the course?')) return;
    try { await api.delete(`/enrollments/courses/${courseId}/students/${studentId}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const setExpiry = async () => {
    try {
      await api.post(`/enrollments/courses/${courseId}/students/${expireModal.student._id}/expire`, {
        expiresAt: expireDate ? new Date(expireDate) : null,
      });
      toast.success('Access expiry updated');
      setExpireModal(null);
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const revokeCode = async (codeId) => {
    try { await api.post(`/enrollments/courses/${courseId}/codes/${codeId}/revoke`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => toast.success('Code copied'));
  };

  return (
    <div className={user?.role === 'admin' ? "grid gap-5 lg:grid-cols-[1fr_360px]" : "space-y-4"}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">Enrolled students</h3>
          {user?.role === 'admin' && (
            <div className="flex gap-2">
              <Input placeholder="username or email" value={assignName} onChange={(e) => setAssignName(e.target.value)} />
              <Button variant="outline" onClick={assign}><UserPlus size={15} /> Enroll</Button>
            </div>
          )}
        </div>
        {!students ? <Spinner /> : students.items.length === 0 ? (
          <Card>
            <EmptyState
              title="No students yet"
              subtitle={user?.role === 'admin' ? "Generate access codes or enroll students directly." : "Students can enroll using an access code."}
            />
          </Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {students.items.map((e) => (
              <div key={e._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                    {e.student?.name} <span className="text-xs text-surface-400">@{e.student?.username}</span>
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <ProgressBar value={e.progressPercent} className="w-32" />
                    <span className="text-xs text-surface-400">{e.progressPercent}%</span>
                    {e.status === 'completed' && <Badge color="green">Completed</Badge>}
                    {e.expiresAt && <Badge color="amber">expires {new Date(e.expiresAt).toLocaleDateString()}</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setExpireModal(e); setExpireDate(e.expiresAt ? e.expiresAt.slice(0, 10) : ''); }}>
                  <CalendarClock size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(e.student._id)}>
                  <UserMinus size={14} className="text-rose-400" />
                </Button>
              </div>
            ))}
          </Card>
        )}
        <Pagination meta={students?.meta} onPage={setPage} />
      </div>

      {user?.role === 'admin' && (
        <div className="space-y-4">
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">Access codes</h3>
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Input label="How many" type="number" min="1" max="500" value={codeForm.count}
                onChange={(e) => setCodeForm((f) => ({ ...f, count: e.target.value }))} />
              <Input label="Uses per code" type="number" min="1" value={codeForm.maxUses}
                onChange={(e) => setCodeForm((f) => ({ ...f, maxUses: e.target.value }))} />
              <Input label="Code expires (days)" type="number" min="1" placeholder="never" value={codeForm.expiresInDays}
                onChange={(e) => setCodeForm((f) => ({ ...f, expiresInDays: e.target.value }))} />
              <Input label="Grants access (days)" type="number" min="0" placeholder="course default" value={codeForm.grantsAccessDays}
                onChange={(e) => setCodeForm((f) => ({ ...f, grantsAccessDays: e.target.value }))} />
            </div>
            <Button className="w-full" loading={busy} onClick={generate}><KeyRound size={15} /> Generate codes</Button>
          </Card>

          {!codes ? <Spinner /> : (
            <Card className="max-h-96 divide-y divide-surface-100 dark:divide-surface-700 overflow-y-auto">
              {codes.length === 0 && <EmptyState title="No codes yet" />}
              {codes.map((c) => {
                const exhausted = c.usedCount >= c.maxUses;
                return (
                  <div key={c._id} className="flex items-center gap-2 px-4 py-2.5">
                    <code className={`flex-1 font-mono text-sm ${c.isRevoked || exhausted ? 'text-surface-300 line-through' : 'text-surface-800 dark:text-surface-100'}`}>
                      {c.code}
                    </code>
                    <span className="text-xs text-surface-400">{c.usedCount}/{c.maxUses}</span>
                    {c.isRevoked ? <Badge color="red">Revoked</Badge> : exhausted ? <Badge>Used</Badge> : (
                      <>
                        <button onClick={() => copyCode(c.code)} className="text-surface-400 hover:text-primary-500"><Copy size={14} /></button>
                        <button onClick={() => revokeCode(c._id)} className="text-xs text-rose-400 hover:underline">revoke</button>
                      </>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      <Modal open={!!expireModal} onClose={() => setExpireModal(null)} title={`Access expiry — ${expireModal?.student?.name || ''}`}>
        <div className="space-y-4">
          <Input label="Access ends on (leave empty for no expiry)" type="date" value={expireDate}
            onChange={(e) => setExpireDate(e.target.value)} />
          <Button className="w-full" onClick={setExpiry}>Save expiry</Button>
        </div>
      </Modal>
    </div>
  );
}
