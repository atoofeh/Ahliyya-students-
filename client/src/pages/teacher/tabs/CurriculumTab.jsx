import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, PlayCircle, FileText, HelpCircle, ClipboardList, AlignLeft, Unlock } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { useLanguage } from '../../../hooks/useLanguage';
import { Card, Button, Modal, Input, Select, Textarea, Toggle, Badge, EmptyState } from '../../../components/ui';

const LESSON_ICONS = { video: PlayCircle, pdf: FileText, document: FileText, quiz: HelpCircle, assignment: ClipboardList, text: AlignLeft };
const LESSON_TYPE_KEYS = ['video', 'pdf', 'document', 'text', 'quiz', 'assignment'];

export default function CurriculumTab({ courseId, curriculum, reload }) {
  const toast = useToast();
  const { t } = useLanguage();
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
  }, t('cur.sectionSaved'));

  const deleteSection = (id) => run(() => api.delete(`/courses/${courseId}/sections/${id}`), t('cur.sectionDeleted'));

  const saveLesson = () => run(async () => {
    const payload = {
      section: lessonModal.section._id,
      title: form.title,
      type: form.type,
      durationMinutes: Number(form.durationMinutes) || 0,
      isPublished: form.isPublished !== false,
      isFree: form.isFree === true,
      content: form.type === 'text' ? form.content || '' : '',
      video: form.type === 'video' ? form.video || null : null,
      fileAsset: ['pdf', 'document'].includes(form.type) ? form.fileAsset || null : null,
      quiz: form.type === 'quiz' ? form.quiz || null : null,
      assignment: form.type === 'assignment' ? form.assignment || null : null,
    };
    if (form._id) await api.put(`/courses/${courseId}/lessons/${form._id}`, payload);
    else await api.post(`/courses/${courseId}/lessons`, payload);
    setLessonModal(null);
  }, t('cur.lessonSaved'));

  const deleteLesson = (id) => run(() => api.delete(`/courses/${courseId}/lessons/${id}`), t('cur.lessonDeleted'));

  const moveSection = (sectionIdx, dir) => run(async () => {
    const ids = curriculum.map((section) => section._id);
    const target = sectionIdx + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[sectionIdx], ids[target]] = [ids[target], ids[sectionIdx]];
    await api.post(`/courses/${courseId}/reorder`, { sections: ids });
  }, t('cur.orderSaved'));

  const moveLesson = (sectionIdx, lessonIdx, dir) => run(async () => {
    const groups = curriculum.map((section) => ({
      sectionId: section._id,
      lessonIds: section.lessons.map((lesson) => lesson._id),
    }));
    const source = groups[sectionIdx].lessonIds;
    const targetLessonIdx = lessonIdx + dir;

    if (targetLessonIdx >= 0 && targetLessonIdx < source.length) {
      [source[lessonIdx], source[targetLessonIdx]] = [source[targetLessonIdx], source[lessonIdx]];
    } else {
      const targetSectionIdx = sectionIdx + dir;
      if (targetSectionIdx < 0 || targetSectionIdx >= groups.length) return;
      const [lessonId] = source.splice(lessonIdx, 1);
      const destination = groups[targetSectionIdx].lessonIds;
      if (dir < 0) destination.push(lessonId);
      else destination.unshift(lessonId);
    }

    await api.post(`/courses/${courseId}/reorder`, { lessons: groups });
  }, t('cur.orderSaved'));

  const openLessonModal = (section, lesson) => {
    setForm(lesson ? {
      _id: lesson._id, title: lesson.title, type: lesson.type, durationMinutes: lesson.durationMinutes,
      isPublished: lesson.isPublished, isFree: lesson.isFree, content: lesson.content,
      video: lesson.video || '', fileAsset: lesson.fileAsset || '', quiz: lesson.quiz || '', assignment: lesson.assignment || '',
    } : { type: 'video', title: '', durationMinutes: 0, isPublished: true, isFree: false });
    setLessonModal({ section, lesson });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-surface-400">{t('cur.orderHint')}</p>
        <Button onClick={() => { setForm({ title: '', description: '' }); setSectionModal({}); }}>
          <Plus size={15} /> {t('cur.addSection')}
        </Button>
      </div>

      {curriculum.length === 0 && <Card><EmptyState title={t('cur.noSections')} subtitle={t('cur.noSectionsHint')} /></Card>}

      {curriculum.map((section, sectionIdx) => (
        <Card key={section._id}>
          <div className="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 px-4 py-3">
            <div>
              <p dir="auto" className="font-semibold text-surface-900 dark:text-white">{section.title}</p>
              {section.description && <p dir="auto" className="text-xs text-surface-400">{section.description}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label={t('cur.moveSectionUp', { title: section.title })} disabled={sectionIdx === 0 || busy}
                onClick={() => moveSection(sectionIdx, -1)}><ChevronUp size={14} /></Button>
              <Button size="sm" variant="ghost" aria-label={t('cur.moveSectionDown', { title: section.title })} disabled={sectionIdx === curriculum.length - 1 || busy}
                onClick={() => moveSection(sectionIdx, 1)}><ChevronDown size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(section); setSectionModal(section); }}><Pencil size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => deleteSection(section._id)}><Trash2 size={14} className="text-rose-400" /></Button>
              <Button size="sm" variant="outline" onClick={() => openLessonModal(section)}><Plus size={14} /> {t('cur.lesson')}</Button>
            </div>
          </div>
          {section.lessons.map((l, i) => {
            const Icon = LESSON_ICONS[l.type] || AlignLeft;
            return (
              <div key={l._id} className="flex items-center gap-2 border-b border-surface-100 dark:border-surface-700/50 px-4 py-2 last:border-0">
                <Icon size={16} className="shrink-0 text-surface-400" />
                <span dir="auto" className="flex-1 truncate text-sm text-surface-700 dark:text-surface-200">{l.title}</span>
                {!l.isPublished && <Badge>{t('cur.draft')}</Badge>}
                {l.isFree && <Badge color='green'><Unlock size={11} className='me-0.5 inline' />{t('cur.free')}</Badge>}
                {l.durationMinutes > 0 && <span className="text-xs text-surface-400">{t('catalog.minutes', { n: l.durationMinutes })}</span>}
                <Button size="sm" variant="ghost" aria-label={t('cur.moveLessonUp', { title: l.title })} disabled={(sectionIdx === 0 && i === 0) || busy}
                  onClick={() => moveLesson(sectionIdx, i, -1)}><ChevronUp size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={t('cur.moveLessonDown', { title: l.title })}
                  disabled={(sectionIdx === curriculum.length - 1 && i === section.lessons.length - 1) || busy}
                  onClick={() => moveLesson(sectionIdx, i, 1)}><ChevronDown size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => openLessonModal(section, l)}><Pencil size={13} /></Button>
                <Button size="sm" variant="ghost" onClick={() => deleteLesson(l._id)}><Trash2 size={13} className="text-rose-400" /></Button>
              </div>
            );
          })}
        </Card>
      ))}

      <Modal open={!!sectionModal} onClose={() => setSectionModal(null)} title={t(form._id ? 'cur.editSection' : 'cur.newSection')}>
        <div className="space-y-4">
          <Input label={t('cur.title')} dir="auto" value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label={t('cur.descriptionOptional')} dir="auto" value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Button className="w-full" loading={busy} onClick={saveSection} disabled={!form.title?.trim()}>{t('cur.saveSection')}</Button>
        </div>
      </Modal>

      <Modal open={!!lessonModal} onClose={() => setLessonModal(null)} title={form._id ? t('cur.editLesson') : t('cur.newLessonIn', { section: lessonModal?.section?.title || '' })}>
        <div className="space-y-4">
          <Input label={t('cur.title')} dir="auto" value={form.title || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('cur.type')} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              options={LESSON_TYPE_KEYS.map((k) => ({ value: k, label: t(`cur.type.${k}`) }))} />
            <Input label={t('cur.duration')} type="number" min="0" value={form.durationMinutes || 0}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
          </div>

          {form.type === 'video' && (
            <Select label={t('cur.video')} value={form.video || ''} onChange={(e) => setForm((f) => ({ ...f, video: e.target.value }))}
              options={[{ value: '', label: t('cur.selectVideo') },
                ...videos.filter((v) => v.status === 'ready').map((v) => ({ value: v._id, label: v.title }))]} />
          )}
          {['pdf', 'document'].includes(form.type) && (
            <Select label={t('cur.file')} value={form.fileAsset || ''} onChange={(e) => setForm((f) => ({ ...f, fileAsset: e.target.value }))}
              options={[{ value: '', label: t('cur.selectFile') },
                ...files.map((fl) => ({ value: fl._id, label: fl.originalName }))]} />
          )}
          {form.type === 'quiz' && (
            <Select label={t('cur.quiz')} value={form.quiz || ''} onChange={(e) => setForm((f) => ({ ...f, quiz: e.target.value }))}
              options={[{ value: '', label: t('cur.selectQuiz') },
                // A draft attached here is invisible to students until it is published.
                ...quizzes.map((q) => ({ value: q._id, label: q.isPublished ? q.title : t('cur.draftSuffix', { title: q.title }) }))]} />
          )}
          {form.type === 'assignment' && (
            <Select label={t('cur.assignment')} value={form.assignment || ''} onChange={(e) => setForm((f) => ({ ...f, assignment: e.target.value }))}
              options={[{ value: '', label: t('cur.selectAssignment') },
                ...assignments.map((a) => ({ value: a._id, label: a.title }))]} />
          )}
          {form.type === 'text' && (
            <Textarea label={t('cur.content')} dir="auto" value={form.content || ''} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={6} />
          )}
          <Toggle label={t('cur.publishedToggle')} checked={form.isPublished !== false} onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
          <Toggle label={t('cur.freeToggle')} hint={t('cur.freeHint')}
            checked={form.isFree === true} onChange={(v) => setForm((f) => ({ ...f, isFree: v }))} />
          <Button className="w-full" loading={busy} onClick={saveLesson} disabled={!form.title?.trim()}>{t('cur.saveLesson')}</Button>
        </div>
      </Modal>
    </div>
  );
}
