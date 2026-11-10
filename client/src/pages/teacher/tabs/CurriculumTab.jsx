import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, PlayCircle, FileText, HelpCircle, ClipboardList, AlignLeft, Unlock } from 'lucide-react';
import { DndContext, closestCenter, useDroppable } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { useDragSensors, dragStyle } from '../../../hooks/useDragSensors';
import DragHandle from '../../../components/DragHandle';
import { useLanguage } from '../../../hooks/useLanguage';
import { Card, Button, Modal, Input, Select, Textarea, Toggle, Badge, EmptyState } from '../../../components/ui';

const LESSON_ICONS = { video: PlayCircle, pdf: FileText, document: FileText, quiz: HelpCircle, assignment: ClipboardList, text: AlignLeft };
const LESSON_TYPE_KEYS = ['video', 'pdf', 'document', 'text', 'quiz', 'assignment'];

/** One lesson row, draggable within its section and into any other. */
function LessonRow({ lesson, sectionId, onEdit, onDelete, busy, t }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson._id,
    data: { type: 'lesson', sectionId },
  });
  const Icon = LESSON_ICONS[lesson.type] || AlignLeft;
  return (
    <div
      ref={setNodeRef}
      style={dragStyle(transform, transition)}
      className={`flex items-center gap-2 border-b border-surface-100 px-4 py-2 last:border-0 dark:border-surface-700/50 ${
        isDragging ? 'relative z-10 rounded-lg bg-white opacity-90 shadow-float dark:bg-surface-800' : ''}`}
    >
      <Icon size={16} className="shrink-0 text-surface-400" aria-hidden="true" />
      <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-surface-700 dark:text-surface-200">{lesson.title}</span>
      {!lesson.isPublished && <Badge>{t('cur.draft')}</Badge>}
      {lesson.isFree && <Badge color="green"><Unlock size={11} className="me-0.5 inline" />{t('cur.free')}</Badge>}
      {lesson.durationMinutes > 0 && (
        <span className="hidden shrink-0 text-xs text-surface-400 sm:inline">{t('catalog.minutes', { n: lesson.durationMinutes })}</span>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit} aria-label={t('cur.editLesson')}><Pencil size={13} /></Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} aria-label={t('cur.deleteLesson')}><Trash2 size={13} className="text-rose-400" /></Button>
      <DragHandle attributes={attributes} listeners={listeners} label={t('cur.dragLesson', { title: lesson.title })} />
    </div>
  );
}

/**
 * The lesson area of a section. It is a drop target in its own right so a
 * lesson can be dropped into a section that has none yet — with only the rows
 * listening there would be nothing to aim at.
 */
function LessonDropZone({ sectionId, empty, children, t }) {
  const { setNodeRef, isOver } = useDroppable({ id: `section-drop-${sectionId}`, data: { type: 'sectionDropZone', sectionId } });
  return (
    <div ref={setNodeRef} className={isOver && empty ? 'bg-brand-50/60 dark:bg-brand-900/20' : undefined}>
      {children}
      {empty && (
        <p className="px-4 py-3 text-center text-xs text-surface-400">{t('cur.noLessonsYet')}</p>
      )}
    </div>
  );
}

/** One section card, draggable among the other sections. */
function SectionCard({ section, busy, t, onEditSection, onDeleteSection, onAddLesson, onEditLesson, onDeleteLesson }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section._id,
    data: { type: 'section' },
  });
  return (
    <div ref={setNodeRef} style={dragStyle(transform, transition)} className={isDragging ? 'relative z-10 opacity-90' : undefined}>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-200 px-4 py-3 dark:border-surface-700">
          <div className="min-w-0 flex-1">
            <p dir="auto" className="truncate font-semibold text-surface-900 dark:text-white">{section.title}</p>
            {section.description && <p dir="auto" className="truncate text-xs text-surface-400">{section.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={onAddLesson}><Plus size={14} /> {t('cur.lesson')}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onEditSection} aria-label={t('cur.editSection')}><Pencil size={14} /></Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDeleteSection} aria-label={t('cur.deleteSection')}><Trash2 size={14} className="text-rose-400" /></Button>
            <DragHandle attributes={attributes} listeners={listeners} label={t('cur.dragSection', { title: section.title })} />
          </div>
        </div>
        <LessonDropZone sectionId={section._id} empty={section.lessons.length === 0} t={t}>
          <SortableContext items={section.lessons.map((l) => l._id)} strategy={verticalListSortingStrategy}>
            {section.lessons.map((lesson) => (
              <LessonRow
                key={lesson._id}
                lesson={lesson}
                sectionId={section._id}
                busy={busy}
                t={t}
                onEdit={() => onEditLesson(section, lesson)}
                onDelete={() => onDeleteLesson(lesson)}
              />
            ))}
          </SortableContext>
        </LessonDropZone>
      </Card>
    </div>
  );
}

export default function CurriculumTab({ courseId, curriculum, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [sectionModal, setSectionModal] = useState(null); // null | {} | section
  const [lessonModal, setLessonModal] = useState(null); // null | { section, lesson? }
  const [videos, setVideos] = useState([]);
  const [files, setFiles] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  /**
   * The arrangement being dragged, which the server has not confirmed yet.
   * Rendering from it rather than from the prop is what makes a drag feel
   * immediate on a phone; it is dropped once `reload()` brings the saved order
   * back, and dropped on failure too, which puts the old order on screen.
   */
  const [draft, setDraft] = useState(null);

  const sections = draft || curriculum;

  const sensors = useDragSensors();

  /**
   * Only ever drop a thing onto its own kind.
   *
   * A section card is tall and a lesson row is short, so left to itself the
   * nearest centre to a section being dragged is usually its own card, and the
   * section never appears to move. Narrowing the candidates to the type in hand
   * also stops a lesson being measured against whole sections.
   */
  const collisionDetection = useCallback((args) => {
    const type = args.active.data.current?.type;
    const droppableContainers = args.droppableContainers.filter((container) => {
      const kind = container.data.current?.type;
      return type === 'section' ? kind === 'section' : (kind === 'lesson' || kind === 'sectionDropZone');
    });
    return closestCenter({ ...args, droppableContainers });
  }, []);

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
    finally { setBusy(false); setDraft(null); }
  };

  const saveSection = () => run(async () => {
    if (form._id) await api.put(`/courses/${courseId}/sections/${form._id}`, { title: form.title, description: form.description });
    else await api.post(`/courses/${courseId}/sections`, { title: form.title, description: form.description || '' });
    setSectionModal(null);
  }, t('cur.sectionSaved'));

  const deleteSection = async (section) => {
    if (!(await confirm(t('cur.confirmDeleteSection', { title: section.title })))) return;
    run(() => api.delete(`/courses/${courseId}/sections/${section._id}`), t('cur.sectionDeleted'));
  };

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

  const deleteLesson = async (lesson) => {
    if (!(await confirm(t('cur.confirmDeleteLesson', { title: lesson.title })))) return;
    run(() => api.delete(`/courses/${courseId}/lessons/${lesson._id}`), t('cur.lessonDeleted'));
  };

  /** Where a lesson currently sits, by id. */
  const locate = (list, lessonId) => {
    for (let s = 0; s < list.length; s += 1) {
      const index = list[s].lessons.findIndex((l) => l._id === lessonId);
      if (index !== -1) return { sectionIdx: s, lessonIdx: index };
    }
    return null;
  };

  /** The section a drop landed on, whether it hit a lesson or the empty area. */
  const sectionIdOf = (over) => {
    const data = over?.data?.current;
    if (data?.type === 'lesson' || data?.type === 'sectionDropZone') return data.sectionId;
    if (data?.type === 'section') return String(over.id);
    return null;
  };

  /**
   * While a lesson is held over another section, move it there in the draft so
   * the row appears under the finger where it will land. Reordering inside one
   * section is left to the drop itself — doing it here as well makes rows
   * flicker between two positions as the pointer crosses a boundary.
   */
  const onDragOver = ({ active, over }) => {
    if (!over || active.data.current?.type !== 'lesson') return;
    const targetSectionId = sectionIdOf(over);
    if (!targetSectionId || targetSectionId === active.data.current.sectionId) return;

    setDraft((current) => {
      const list = (current || curriculum).map((s) => ({ ...s, lessons: [...s.lessons] }));
      const from = locate(list, active.id);
      const targetIdx = list.findIndex((s) => s._id === targetSectionId);
      if (!from || targetIdx === -1) return current;
      const [moved] = list[from.sectionIdx].lessons.splice(from.lessonIdx, 1);
      const overIdx = list[targetIdx].lessons.findIndex((l) => l._id === over.id);
      list[targetIdx].lessons.splice(overIdx === -1 ? list[targetIdx].lessons.length : overIdx, 0, moved);
      return list;
    });
  };

  const onDragEnd = ({ active, over }) => {
    const type = active.data.current?.type;
    if (!over) { setDraft(null); return; }

    if (type === 'section') {
      const ids = sections.map((s) => s._id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(sectionIdOf(over) || over.id));
      if (from === -1 || to === -1 || from === to) { setDraft(null); return; }
      const next = arrayMove(sections, from, to);
      setDraft(next);
      run(() => api.post(`/courses/${courseId}/reorder`, { sections: next.map((s) => s._id) }), t('cur.orderSaved'));
      return;
    }

    if (type !== 'lesson') { setDraft(null); return; }

    // `sections` already carries any cross-section move made while dragging;
    // all that can be left is the position inside the section it now sits in.
    const list = sections.map((s) => ({ ...s, lessons: [...s.lessons] }));
    const at = locate(list, active.id);
    if (!at) { setDraft(null); return; }
    const lessons = list[at.sectionIdx].lessons;
    const overIdx = lessons.findIndex((l) => l._id === over.id);
    if (overIdx !== -1 && overIdx !== at.lessonIdx) {
      list[at.sectionIdx].lessons = arrayMove(lessons, at.lessonIdx, overIdx);
    }

    const sameAsSaved = JSON.stringify(list.map((s) => s.lessons.map((l) => l._id)))
      === JSON.stringify(curriculum.map((s) => s.lessons.map((l) => l._id)));
    if (sameAsSaved) { setDraft(null); return; }

    setDraft(list);
    run(() => api.post(`/courses/${courseId}/reorder`, {
      lessons: list.map((s) => ({ sectionId: s._id, lessonIds: s.lessons.map((l) => l._id) })),
    }), t('cur.orderSaved'));
  };

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

      {sections.length === 0 && <Card><EmptyState title={t('cur.noSections')} subtitle={t('cur.noSectionsHint')} /></Card>}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraft(null)}
      >
        <SortableContext items={sections.map((s) => s._id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {sections.map((section) => (
              <SectionCard
                key={section._id}
                section={section}
                busy={busy}
                t={t}
                onAddLesson={() => openLessonModal(section)}
                onEditSection={() => { setForm(section); setSectionModal(section); }}
                onDeleteSection={() => deleteSection(section)}
                onEditLesson={openLessonModal}
                onDeleteLesson={deleteLesson}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
