import { useEffect, useState, useCallback } from 'react';
import { KeyRound, UserPlus, UserMinus, CalendarClock, Copy, Wallet } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { isAdminRole } from '../../../utils/roles';
import { PACKAGES, packageOf, money, DEFAULT_CURRENCY } from '../../../utils/packages';
import { Card, Button, Modal, Input, Select, Badge, EmptyState, Spinner, ProgressBar, Pagination } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';

const PACKAGE_OPTIONS = PACKAGES.map((p) => ({ value: p.value, label: p.label }));

export default function StudentsTab({ courseId, currency = DEFAULT_CURRENCY }) {
  const toast = useToast();
  const { user } = useAuth();
  const staff = isAdminRole(user?.role);
  const [students, setStudents] = useState(null);
  const [page, setPage] = useState(1);
  const [codes, setCodes] = useState(null);
  const [codeForm, setCodeForm] = useState({
    count: 5, maxUses: 1, expiresInDays: '', grantsAccessDays: '', package: 'full', amountPaid: '',
  });
  const [enrolModal, setEnrolModal] = useState(false);
  const [enrolForm, setEnrolForm] = useState({ student: '', package: 'full', amountPaid: '', paymentNote: '' });
  // { enrollment } — an administrator correcting what a student took or paid.
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ package: 'full', amountPaid: '', paymentNote: '' });
  const [expireModal, setExpireModal] = useState(null);
  const [expireDate, setExpireDate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/enrollments/courses/${courseId}/students`, { params: { page, limit: 20 } })
      .then(({ data }) => setStudents(data)).catch(() => {});
    if (staff) {
      api.get(`/enrollments/courses/${courseId}/codes`, { params: { limit: 50 } })
        .then(({ data }) => setCodes(data.items)).catch(() => {});
    }
  }, [courseId, page, staff]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, message) => {
    setBusy(true);
    try { await fn(); if (message) toast.success(message); load(); }
    catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  const generate = () => run(() => api.post(`/enrollments/courses/${courseId}/codes`, {
    count: Number(codeForm.count) || 1,
    maxUses: Number(codeForm.maxUses) || 1,
    package: codeForm.package,
    ...(codeForm.amountPaid !== '' && { amountPaid: Number(codeForm.amountPaid) }),
    ...(codeForm.expiresInDays && { expiresInDays: Number(codeForm.expiresInDays) }),
    ...(codeForm.grantsAccessDays && { grantsAccessDays: Number(codeForm.grantsAccessDays) }),
  }), 'Codes generated');

  const enrol = () => run(async () => {
    await api.post(`/enrollments/courses/${courseId}/students`, {
      student: enrolForm.student.trim(),
      package: enrolForm.package,
      ...(enrolForm.amountPaid !== '' && { amountPaid: Number(enrolForm.amountPaid) }),
      ...(enrolForm.paymentNote.trim() && { paymentNote: enrolForm.paymentNote.trim() }),
    });
    setEnrolModal(false);
    setEnrolForm({ student: '', package: 'full', amountPaid: '', paymentNote: '' });
  }, 'Student enrolled');

  const openPayment = (e) => {
    setPayForm({
      package: e.package || 'full',
      amountPaid: e.amountPaid ?? '',
      paymentNote: e.paymentNote || '',
    });
    setPayModal(e);
  };

  const savePayment = () => run(async () => {
    await api.patch(`/enrollments/courses/${courseId}/students/${payModal.student._id}/payment`, {
      package: payForm.package,
      amountPaid: Number(payForm.amountPaid) || 0,
      paymentNote: payForm.paymentNote.trim(),
    });
    setPayModal(null);
  }, 'Payment updated');

  const remove = (studentId) => {
    if (!window.confirm('Remove this student from the course?')) return;
    return run(() => api.delete(`/enrollments/courses/${courseId}/students/${studentId}`));
  };

  const setExpiry = () => run(async () => {
    await api.post(`/enrollments/courses/${courseId}/students/${expireModal.student._id}/expire`, {
      expiresAt: expireDate ? new Date(expireDate) : null,
    });
    setExpireModal(null);
  }, 'Access expiry updated');

  const revokeCode = (codeId) => run(() => api.post(`/enrollments/courses/${courseId}/codes/${codeId}/revoke`));
  const copyCode = (code) => navigator.clipboard.writeText(code).then(() => toast.success('Code copied'));

  return (
    <div className={staff ? 'grid gap-5 lg:grid-cols-[1fr_360px]' : 'space-y-4'}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">Enrolled students</h3>
          {staff && <Button variant="outline" onClick={() => setEnrolModal(true)}><UserPlus size={15} /> Enrol a student</Button>}
        </div>
        {!students ? <Spinner /> : students.items.length === 0 ? (
          <Card>
            <EmptyState
              title="No students yet"
              subtitle={staff ? 'Enrol a student directly, or generate access codes.' : 'Students join with an access code from the office.'}
            />
          </Card>
        ) : (
          <Card className="divide-y divide-surface-100 dark:divide-surface-700">
            {students.items.map((e) => {
              const pkg = packageOf(e.package);
              return (
                <div key={e._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                      {e.student?.name} <span className="text-xs text-surface-400">@{e.student?.username}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge color={pkg.color}>{pkg.label}</Badge>
                      {/* ProgressBar is w-full; the width has to come from a
                          wrapper, or it eats the whole row on a flex line. */}
                      <span className="flex items-center gap-2">
                        <span className="block w-28"><ProgressBar value={e.progressPercent} /></span>
                        <span className="text-xs tabular-nums text-surface-400">{e.progressPercent}%</span>
                      </span>
                      {e.status === 'completed' && <Badge color="green">Completed</Badge>}
                      {e.expiresAt && <Badge color="amber">expires {new Date(e.expiresAt).toLocaleDateString()}</Badge>}
                      {/* Only administrators are sent an amount at all. */}
                      {e.amountPaid !== undefined && (
                        <span className={`text-xs font-semibold ${e.amountPaid > 0 ? 'text-surface-600 dark:text-surface-300' : 'text-amber-600 dark:text-amber-400'}`}>
                          {e.amountPaid > 0 ? money(e.amountPaid, e.currency) : 'nothing recorded'}
                        </span>
                      )}
                    </div>
                  </div>
                  {staff && (
                    <Button size="sm" variant="outline" onClick={() => openPayment(e)} aria-label={`Payment for ${e.student?.name}`}>
                      <Wallet size={14} />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" aria-label={`Access expiry for ${e.student?.name}`}
                    onClick={() => { setExpireModal(e); setExpireDate(e.expiresAt ? e.expiresAt.slice(0, 10) : ''); }}>
                    <CalendarClock size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(e.student._id)} aria-label={`Remove ${e.student?.name}`}>
                    <UserMinus size={14} className="text-rose-400" />
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
        <Pagination meta={students?.meta} onPage={setPage} />
      </div>

      {staff && (
        <div className="space-y-4">
          <h3 className="font-semibold text-surface-800 dark:text-surface-100">Access codes</h3>
          <Card className="space-y-3 p-4">
            <p className="text-xs text-surface-500">
              A code carries what it was sold as, so students who join with one still appear in the course figures.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Package" value={codeForm.package} options={PACKAGE_OPTIONS}
                onChange={(e) => setCodeForm((f) => ({ ...f, package: e.target.value }))} />
              <Input label={`Price (${currency})`} type="number" min="0" step="0.01" placeholder="0"
                value={codeForm.amountPaid} onChange={(e) => setCodeForm((f) => ({ ...f, amountPaid: e.target.value }))} />
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
            <Card className="max-h-96 divide-y divide-surface-100 overflow-y-auto dark:divide-surface-700">
              {codes.length === 0 && <EmptyState title="No codes yet" />}
              {codes.map((c) => {
                const exhausted = c.usedCount >= c.maxUses;
                const pkg = packageOf(c.package);
                return (
                  <div key={c._id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <code className={`block font-mono text-sm ${c.isRevoked || exhausted ? 'text-surface-300 line-through' : 'text-surface-800 dark:text-surface-100'}`}>
                        {c.code}
                      </code>
                      <span className="text-[11px] text-surface-400">
                        {pkg.short}{c.amountPaid > 0 ? ` · ${money(c.amountPaid, currency)}` : ''}
                      </span>
                    </div>
                    <span className="text-xs text-surface-400">{c.usedCount}/{c.maxUses}</span>
                    {c.isRevoked ? <Badge color="red">Revoked</Badge> : exhausted ? <Badge>Used</Badge> : (
                      <>
                        <button onClick={() => copyCode(c.code)} aria-label={`Copy ${c.code}`} className="text-surface-400 hover:text-primary-500"><Copy size={14} /></button>
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

      <Modal open={enrolModal} onClose={() => setEnrolModal(false)} title="Enrol a student">
        <div className="space-y-4">
          <Input label="Username or email" value={enrolForm.student} placeholder="e.g. sara.k"
            onChange={(e) => setEnrolForm((f) => ({ ...f, student: e.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="What did they take?" value={enrolForm.package} options={PACKAGE_OPTIONS}
              onChange={(e) => setEnrolForm((f) => ({ ...f, package: e.target.value }))} />
            <Input label={`How much did they pay? (${currency})`} type="number" min="0" step="0.01" placeholder="0"
              value={enrolForm.amountPaid} onChange={(e) => setEnrolForm((f) => ({ ...f, amountPaid: e.target.value }))} />
          </div>
          <Input label="Note (optional)" placeholder="cash, instalment, discount…" value={enrolForm.paymentNote}
            onChange={(e) => setEnrolForm((f) => ({ ...f, paymentNote: e.target.value }))} />
          <p className="text-xs text-surface-400">
            The teacher sees which package the student took. What they paid stays with administrators and the owner.
          </p>
          <Button className="w-full" loading={busy} onClick={enrol} disabled={!enrolForm.student.trim()}>
            Enrol student
          </Button>
        </div>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Payment — ${payModal?.student?.name || ''}`}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Package" value={payForm.package} options={PACKAGE_OPTIONS}
              onChange={(e) => setPayForm((f) => ({ ...f, package: e.target.value }))} />
            <Input label={`Amount paid (${payModal?.currency || currency})`} type="number" min="0" step="0.01"
              value={payForm.amountPaid} onChange={(e) => setPayForm((f) => ({ ...f, amountPaid: e.target.value }))} />
          </div>
          <Input label="Note (optional)" value={payForm.paymentNote}
            onChange={(e) => setPayForm((f) => ({ ...f, paymentNote: e.target.value }))} />
          {payModal?.paymentRecordedAt && (
            <p className="text-xs text-surface-400">
              Last recorded {new Date(payModal.paymentRecordedAt).toLocaleString()}.
            </p>
          )}
          <Button className="w-full" loading={busy} onClick={savePayment}>Save</Button>
        </div>
      </Modal>

      <Modal open={!!expireModal} onClose={() => setExpireModal(null)} title={`Access expiry — ${expireModal?.student?.name || ''}`}>
        <div className="space-y-4">
          <Input label="Access ends on (leave empty for no expiry)" type="date" value={expireDate}
            onChange={(e) => setExpireDate(e.target.value)} />
          <Button className="w-full" loading={busy} onClick={setExpiry}>Save expiry</Button>
        </div>
      </Modal>
    </div>
  );
}
