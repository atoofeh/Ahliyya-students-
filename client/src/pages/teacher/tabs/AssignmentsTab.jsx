import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, ClipboardList, Inbox } from 'lucide-react';
import api, { API_BASE, apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Modal, Input, Textarea, Toggle, Badge, EmptyState, Spinner } from '../../../components/ui';
import { SkeletonCard } from '../../../components/Skeletons';

export default function AssignmentsTab({ courseId }) {
  const toast = useToast();
  const [assignments, setAssignments] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [subsModal, setSubsModal] = useState(null);
  const [subs, setSubs] = useState(null);
  const [grading, setGrading] = useState({}); // submissionId -> {points, feedback}

  const load = useCallback(() => {
    api.get(`/assignments/courses/${courseId}`).then(({ data }) => setAssignments(data)).catch(() => setAssignments([]));
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ title: '', instructions: '', dueAt: '', maxPoints: 100, allowLateSubmission: false, isPublished: true });
    setModal(true);
  };
  const openEdit = (a) => {
    setForm({
      _id: a._id, title: a.title, instructions: a.instructions || '',
      dueAt: a.dueAt ? a.dueAt.slice(0, 16) : '', maxPoints: a.maxPoints,
      allowLateSubmission: a.allowLateSubmission, isPublished: a.isPublished,
    });
    setModal(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        title: form.title, instructions: form.instructions,
        dueAt: form.dueAt ? new Date(form.dueAt) : null,
        maxPoints: Number(form.maxPoints) || 100,
        allowLateSubmission: form.allowLateSubmission, isPublished: form.isPublished,
      };
      if (form._id) await api.put(`/assignments/courses/${courseId}/${form._id}`, payload);
      else await api.post(`/assignments/courses/${courseId}`, payload);
      toast.success('Assignment saved');
      setModal(false);
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this assignment?')) return;
    try { await api.delete(`/assignments/courses/${courseId}/${id}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const openSubs = async (a) => {
    setSubsModal(a); setSubs(null);
    const { data } = await api.get(`/assignments/courses/${courseId}/${a._id}/submissions`, { params: { limit: 100 } });
    setSubs(data.items);
    const init = {};
    data.items.forEach((s) => { init[s._id] = { points: s.pointsAwarded ?? '', feedback: s.feedback || '' }; });
    setGrading(init);
  };

  const grade = async (submissionId) => {
    const g = grading[submissionId];
    try {
      await api.post(`/assignments/submissions/${submissionId}/grade`, {
        points: Number(g.points) || 0, feedback: g.feedback,
      });
      toast.success('Graded');
      openSubs(subsModal);
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!assignments) return <SkeletonCard lines={5} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus size={15} /> New assignment</Button>
      </div>

      {assignments.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList size={24} />} title="No assignments yet" /></Card>
      ) : assignments.map((a) => (
        <Card key={a._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-surface-900 dark:text-white">{a.title}</p>
              <Badge color={a.isPublished ? 'green' : 'gray'}>{a.isPublished ? 'Published' : 'Draft'}</Badge>
            </div>
            <p className="text-xs text-surface-400">
              {a.dueAt ? `Due ${new Date(a.dueAt).toLocaleString()}` : 'No due date'} · {a.maxPoints} pts
              {a.allowLateSubmission && ' · late allowed'}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => openSubs(a)}><Inbox size={14} /> Submissions</Button>
            <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil size={14} /></Button>
            <Button size="sm" variant="ghost" onClick={() => remove(a._id)}><Trash2 size={14} className="text-rose-400" /></Button>
          </div>
        </Card>
      ))}

      <Modal open={modal} onClose={() => setModal(false)} title={form._id ? 'Edit assignment' : 'New assignment'}>
        <div className="space-y-4">
          <Input label="Title" value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Instructions" value={form.instructions || ''} rows={5}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Due date" type="datetime-local" value={form.dueAt || ''}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
            <Input label="Max points" type="number" min="0" value={form.maxPoints || 100}
              onChange={(e) => setForm((f) => ({ ...f, maxPoints: e.target.value }))} />
          </div>
          <Toggle label="Allow late submissions" checked={!!form.allowLateSubmission}
            onChange={(v) => setForm((f) => ({ ...f, allowLateSubmission: v }))} />
          <Toggle label="Published" checked={form.isPublished !== false}
            onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
          <Button className="w-full" loading={busy} onClick={save} disabled={!form.title?.trim()}>Save assignment</Button>
        </div>
      </Modal>

      <Modal open={!!subsModal} onClose={() => setSubsModal(null)} title={`Submissions: ${subsModal?.title || ''}`} wide>
        {!subs ? <Spinner /> : subs.length === 0 ? <EmptyState title="No submissions yet" /> : (
          <div className="space-y-4">
            {subs.map((s) => (
              <div key={s._id} className="rounded-lg border border-surface-200 dark:border-surface-600 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                    {s.student?.name} <span className="text-surface-400">@{s.student?.username}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    {s.isLate && <Badge color="amber">Late</Badge>}
                    <Badge color={s.status === 'graded' ? 'green' : 'blue'}>{s.status}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-surface-400">Submitted {new Date(s.submittedAt).toLocaleString()}</p>
                {s.text && <p className="mt-2 whitespace-pre-wrap rounded bg-surface-50 dark:bg-surface-700/40 p-2 text-sm text-surface-600 dark:text-surface-300">{s.text}</p>}
                {s.attachment && (
                  <a href={`${API_BASE}/files/${s.attachment._id || s.attachment}/content?download=1`} target="_blank" rel="noreferrer"
                    className="mt-1 inline-block text-xs text-primary-600 hover:underline">
                    Download attachment ({s.attachment.originalName})
                  </a>
                )}
                <div className="mt-3 grid grid-cols-[110px_1fr_auto] items-end gap-2">
                  <Input label={`Points / ${subsModal.maxPoints}`} type="number" min="0" max={subsModal.maxPoints}
                    value={grading[s._id]?.points ?? ''}
                    onChange={(e) => setGrading((g) => ({ ...g, [s._id]: { ...g[s._id], points: e.target.value } }))} />
                  <Input label="Feedback" value={grading[s._id]?.feedback ?? ''}
                    onChange={(e) => setGrading((g) => ({ ...g, [s._id]: { ...g[s._id], feedback: e.target.value } }))} />
                  <Button size="sm" onClick={() => grade(s._id)}>Save</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
