import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, PlayCircle, FileText, HelpCircle, ClipboardList, AlignLeft } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../context/ToastContext';
import { Card, Button, Modal, Input, Select, Textarea, Toggle, Badge, EmptyState } from '../../../components/ui';

const LESSON_ICONS = { video: PlayCircle, pdf: FileText, document: FileText, quiz: HelpCircle, assignment: ClipboardList, text: AlignLeft };
const LESSON_TYPES = ['video', 'pdf', 'document', 'text', 'quiz', 'assignment'].map((t) => ({ value: t, label: t }));

export default function CurriculumTab({ courseId, curriculum, reload }) {
  const toast = useToast();
  const [sectionModal, setSectionModal] = useState(null); // null | {} | section
  const [lessonModal, setLessonModal] = useState(null); // null | { section, lesson? }
  const [videos, setVideos] = useState([]);
  const [files, setFiles] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    api.get(`/videos/courses/${courseId}`).then(({ data }) => setVideos(data)).catch(() => {});
    api.get(`/files/courses/${courseId}?limit=100`).then(({ data }) => setFiles(data.items)).catch(() => {});
    api.get(`/quizzes/courses/${courseId}`).then(({ data }) => setQuizzes(data)).catch(() => {});
    api.get(`/assignments/courses/${courseId}`).then(({ data }) => setAssignments(data)).catch(() => {});
  }, [courseId]);

  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast.success(msg); await reload(); }
    catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  const saveSection = () => run(async () => {
    if (form._id) await api.put(`/courses/${courseId}/sections/${form._id}`, { title: form.title, description: form.description });
    else await api.post(`/courses/${courseId}/sections`, { title: form.title, description: form.description || '' });
    setSectionModal(null);
  }, 'Section saved');

  const deleteSection = (id) => run(() => api.delete(`/courses/${courseId}/sections/${id}`), 'Section deleted');

  const saveLesson = () => run(async () => {
    const payload = {
      section: lessonModal.section._id,
      title: form.title,
      type: form.type,
      durationMinutes: Number(form.durationMinutes) || 0,
      isPublished: form.isPublished !== false,
      content: form.type === 'text' ? form.content || '' : '',
      video: form.type === 'video' ? form.video || null : null,
      fileAsset: ['pdf', 'document'].includes(form.type) ? form.fileAsset || null : null,
      quiz: form.type === 'quiz' ? form.quiz || null : null,
      assignment: form.type === 'assignment' ? form.assignment || null : null,
    };
    if (form._id) await api.put(`/courses/${courseId}/lessons/${form._id}`, payload);
    else await api.post(`/courses/${courseId}/lessons`, payload);
    setLessonModal(null);
  }, 'Lesson saved');

  const deleteLesson = (id) => run(() => api.delete(`/courses/${courseId}/lessons/${id}`), 'Lesson deleted');

  const moveLesson = (section, lessonIdx, dir) => run(async () => {
    const ids = section.lessons.map((l) => l._id);
    const target = lessonIdx + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[lessonIdx], ids[target]] = [ids[target], ids[lessonIdx]];
    await api.post(`/courses/${courseId}/reorder`, { lessons: [{ sectionId: section._id, lessonIds: ids }] });
  });

  const openLessonModal = (section, lesson) => {
    setForm(lesson ? {
      _id: lesson._id, title: lesson.title, type: lesson.type, durationMinutes: lesson.durationMinutes,
      isPublished: lesson.isPublished, content: lesson.content,
      video: lesson.video || '', fileAsset: lesson.fileAsset || '', quiz: lesson.quiz || '', assignment: lesson.assignment || '',
    } : { type: 'video', title: '', durationMinutes: 0, isPublished: true });
    setLessonModal({ section, lesson });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setForm({ title: '', description: '' }); setSectionModal({}); }}>
          <Plus size={15} /> Add section
        </Button>
      </div>

      {curriculum.length === 0 && <Card><EmptyState title="No sections yet" subtitle="Structure your course into sections, then add lessons." /></Card>}

      {curriculum.map((section) => (
        <Card key={section._id}>
          <div className="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 px-4 py-3">
            <div>
              <p className="font-semibold text-surface-900 dark:text-white">{section.title}</p>
              {section.description && <p className="text-xs text-surface-400">{section.description}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => { setForm(section); setSectionModal(section); }}><Pencil size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => deleteSection(section._id)}><Trash2 size={14} className="text-rose-400" /></Button>
              <Button size="sm" variant="outline" onClick={() => openLessonModal(section)}><Plus size={14} /> Lesson</Button>
            </div>
          </div>
          {section.lessons.map((l, i) => {
            const Icon = LESSON_ICONS[l.type] || AlignLeft;
            return (
              <div key={l._id} className="flex items-center gap-2 border-b border-surface-100 dark:border-surface-700/50 px-4 py-2 last:border-0">
                <Icon size={16} className="shrink-0 text-surface-400" />
                <span className="flex-1 truncate text-sm text-surface-700 dark:text-surface-200">{l.title}</span>
                {!l.isPublished && <Badge>Draft</Badge>}
                {l.durationMinutes > 0 && <span className="text-xs text-surface-400">{l.durationMinutes}m</span>}
                <button className="p-1 text-surface-300 hover:text-surface-600 disabled:opacity-30" disabled={i === 0 || busy}
                  onClick={() => moveLesson(section, i, -1)}><ChevronUp size={14} /></button>
                <button className="p-1 text-surface-300 hover:text-surface-600 disabled:opacity-30" disabled={i === section.lessons.length - 1 || busy}
                  onClick={() => moveLesson(section, i, 1)}><ChevronDown size={14} /></button>
                <Button size="sm" variant="ghost" onClick={() => openLessonModal(section, l)}><Pencil size={13} /></Button>
                <Button size="sm" variant="ghost" onClick={() => deleteLesson(l._id)}><Trash2 size={13} className="text-rose-400" /></Button>
              </div>
            );
          })}
        </Card>
      ))}

      <Modal open={!!sectionModal} onClose={() => setSectionModal(null)} title={form._id ? 'Edit section' : 'New section'}>
        <div className="space-y-4">
          <Input label="Title" value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Description (optional)" value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Button className="w-full" loading={busy} onClick={saveSection} disabled={!form.title?.trim()}>Save section</Button>
        </div>
      </Modal>

      <Modal open={!!lessonModal} onClose={() => setLessonModal(null)} title={form._id ? 'Edit lesson' : `New lesson in “${lessonModal?.section?.title}”`}>
        <div className="space-y-4">
          <Input label="Title" value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} options={LESSON_TYPES} />
            <Input label="Duration (minutes)" type="number" min="0" value={form.durationMinutes || 0}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
          </div>

          {form.type === 'video' && (
            <Select label="Video" value={form.video || ''} onChange={(e) => setForm((f) => ({ ...f, video: e.target.value }))}
              options={[{ value: '', label: '— select uploaded video (Videos tab) —' },
                ...videos.filter((v) => v.status === 'ready').map((v) => ({ value: v._id, label: v.title }))]} />
          )}
          {['pdf', 'document'].includes(form.type) && (
            <Select label="File" value={form.fileAsset || ''} onChange={(e) => setForm((f) => ({ ...f, fileAsset: e.target.value }))}
              options={[{ value: '', label: '— select uploaded file (Videos tab → files) —' },
                ...files.map((fl) => ({ value: fl._id, label: fl.originalName }))]} />
          )}
          {form.type === 'quiz' && (
            <Select label="Quiz" value={form.quiz || ''} onChange={(e) => setForm((f) => ({ ...f, quiz: e.target.value }))}
              options={[{ value: '', label: '— select quiz (Quizzes tab) —' },
                ...quizzes.map((q) => ({ value: q._id, label: q.title }))]} />
          )}
          {form.type === 'assignment' && (
            <Select label="Assignment" value={form.assignment || ''} onChange={(e) => setForm((f) => ({ ...f, assignment: e.target.value }))}
              options={[{ value: '', label: '— select assignment —' },
                ...assignments.map((a) => ({ value: a._id, label: a.title }))]} />
          )}
          {form.type === 'text' && (
            <Textarea label="Content" value={form.content || ''} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={6} />
          )}
          <Toggle label="Published" checked={form.isPublished !== false} onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
          <Button className="w-full" loading={busy} onClick={saveLesson} disabled={!form.title?.trim()}>Save lesson</Button>
        </div>
      </Modal>
    </div>
  );
}
