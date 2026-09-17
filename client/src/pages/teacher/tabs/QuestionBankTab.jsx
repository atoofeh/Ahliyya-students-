import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, HelpCircle, ImagePlus, X, Image as ImageIcon } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Modal, Input, Select, Textarea, Toggle, Badge, EmptyState, Pagination } from '../../../components/ui';
import AuthedImage from '../../../components/AuthedImage';
import { SkeletonCard } from '../../../components/Skeletons';

/**
 * The answer format. A picture is not a format — it attaches to the prompt of
 * any question below, so "show them a diagram and have them type the answer" is
 * short answer with an image, not a type of its own. `image_choice` is the one
 * case where the *options* are pictures instead of labels.
 */
const TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'essay', label: 'Essay (manual grading)' },
  { value: 'fill_blanks', label: 'Fill in the blanks' },
  { value: 'image_choice', label: 'Pick the picture (image options)' },
];

const CHOICE_TYPES = ['multiple_choice', 'true_false', 'image_choice'];

const emptyForm = () => ({
  type: 'multiple_choice', text: '', image: null, points: 1, negativePoints: 0, explanation: '',
  difficulty: 'medium', tags: '', caseSensitive: false, multipleCorrect: false,
  options: [{ id: 'a', text: '', image: null, isCorrect: true }, { id: 'b', text: '', image: null, isCorrect: false }],
  correctAnswers: '',
});

/** Upload one image into the course's file store and hand back its FileAsset id. */
function ImagePicker({ courseId, value, onChange, compact = false }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('scope', 'question');
      const { data } = await api.post(`/files/courses/${courseId}/images`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data._id);
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); e.target.value = ''; }
  };

  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-3'}>
      <input ref={input} type="file" className="hidden" accept="image/png,image/jpeg,image/gif,image/webp" onChange={pick} />
      {value && <AuthedImage fileId={value} className={compact ? 'h-12 rounded' : 'max-h-40 rounded-lg'} />}
      <Button size="sm" variant="outline" loading={busy} onClick={() => input.current?.click()}>
        {compact ? <ImageIcon size={14} /> : <><ImagePlus size={14} /> {value ? 'Replace image' : 'Add image'}</>}
      </Button>
      {value && (
        <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label="Remove image">
          <X size={14} className="text-rose-400" />
        </Button>
      )}
    </div>
  );
}

export default function QuestionBankTab({ courseId }) {
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/quizzes/courses/${courseId}/questions`, { params: { page, limit: 20 } })
      .then(({ data }) => setResult(data)).catch(() => {});
  }, [courseId, page]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(emptyForm()); setModal(true); };

  const openEdit = (q) => {
    setForm({
      _id: q._id, type: q.type, text: q.text, image: q.image || null,
      points: q.points, negativePoints: q.negativePoints,
      explanation: q.explanation || '', difficulty: q.difficulty, tags: (q.tags || []).join(', '),
      caseSensitive: q.caseSensitive, multipleCorrect: q.multipleCorrect,
      options: q.options?.length
        ? q.options.map((o) => ({ id: o.id, text: o.text || '', image: o.image || null, isCorrect: !!o.isCorrect }))
        : emptyForm().options,
      correctAnswers: (q.correctAnswers || []).join('\n'),
    });
    setModal(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const isChoice = CHOICE_TYPES.includes(form.type);
      const payload = {
        type: form.type,
        text: form.text,
        image: form.image || null,
        points: Number(form.points) || 1,
        negativePoints: Number(form.negativePoints) || 0,
        explanation: form.explanation,
        difficulty: form.difficulty,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        caseSensitive: form.caseSensitive,
        multipleCorrect: form.multipleCorrect,
        // An option earns its place with a label or a picture — image options
        // deliberately carry no text, and dropping them left the question blank.
        options: form.type === 'true_false'
          ? [{ id: 'true', text: 'True', isCorrect: form.options[0]?.isCorrect ?? true },
             { id: 'false', text: 'False', isCorrect: !(form.options[0]?.isCorrect ?? true) }]
          : isChoice
            ? form.options
              .filter((o) => o.text.trim() || o.image)
              .map((o) => ({ id: o.id, text: o.text.trim(), image: o.image || null, isCorrect: o.isCorrect }))
            : [],
        correctAnswers: ['short_answer', 'fill_blanks'].includes(form.type)
          ? form.correctAnswers.split('\n').map((a) => a.trim()).filter(Boolean)
          : [],
      };
      if (form._id) await api.put(`/quizzes/courses/${courseId}/questions/${form._id}`, payload);
      else await api.post(`/quizzes/courses/${courseId}/questions`, payload);
      toast.success('Question saved');
      setModal(false);
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this question? It will be removed from quizzes too.')) return;
    try { await api.delete(`/quizzes/courses/${courseId}/questions/${id}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const setOption = (i, patch) => setForm((f) => ({
    ...f, options: f.options.map((o, oi) => (oi === i ? { ...o, ...patch } : o)),
  }));

  if (!result) return <SkeletonCard lines={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{result.meta.total} questions in the bank. Quizzes pick from here.</p>
        <Button onClick={openNew}><Plus size={15} /> New question</Button>
      </div>

      {result.items.length === 0 ? (
        <Card><EmptyState icon={<HelpCircle size={24} />} title="Question bank is empty" /></Card>
      ) : (
        <Card className="divide-y divide-surface-100 dark:divide-surface-700">
          {result.items.map((q) => (
            <div key={q._id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{q.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge color="primary">{q.type.replace(/_/g, ' ')}</Badge>
                  {(q.image || q.options?.some((o) => o.image)) && (
                    <Badge color="blue"><ImageIcon size={11} className="me-1 inline" />image</Badge>
                  )}
                  <Badge>{q.difficulty}</Badge>
                  <Badge color="blue">{q.points} pt{q.points !== 1 && 's'}</Badge>
                  {q.tags?.map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => remove(q._id)}><Trash2 size={14} className="text-rose-400" /></Button>
            </div>
          ))}
        </Card>
      )}
      <Pagination meta={result.meta} onPage={setPage} />

      <Modal open={modal} onClose={() => setModal(false)} title={form._id ? 'Edit question' : 'New question'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.type} options={TYPES} disabled={!!form._id}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} />
            <Select label="Difficulty" value={form.difficulty}
              options={['easy', 'medium', 'hard'].map((d) => ({ value: d, label: d }))}
              onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} />
          </div>
          <Textarea
            label={form.type === 'fill_blanks' ? 'Question text — use {{blank}} for each gap' : 'Question text'}
            value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            placeholder={form.type === 'fill_blanks' ? 'HTTP uses port {{blank}} and HTTPS uses {{blank}}.' : 'Type the question...'} />

          {/* Works with every answer format above — a diagram with a typed answer,
              an essay about a photograph, a picture with true/false. */}
          <div>
            <span className="mb-1 block text-sm font-medium text-surface-700 dark:text-surface-200">
              Question image <span className="font-normal text-surface-400">— optional, shown above the answers</span>
            </span>
            <ImagePicker courseId={courseId} value={form.image}
              onChange={(image) => setForm((f) => ({ ...f, image }))} />
          </div>

          {['multiple_choice', 'image_choice'].includes(form.type) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
                  Options (check the correct ones)
                  {form.type === 'image_choice' && <span className="font-normal text-surface-400"> — a picture, a label, or both</span>}
                </span>
                <Button size="sm" variant="outline" onClick={() => setForm((f) => ({
                  ...f, options: [...f.options, { id: String.fromCharCode(97 + f.options.length), text: '', image: null, isCorrect: false }],
                }))}>Add option</Button>
              </div>
              {form.options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type={form.multipleCorrect ? 'checkbox' : 'radio'} name="correct" checked={o.isCorrect}
                    onChange={() => setForm((f) => ({
                      ...f,
                      options: f.options.map((oo, oi) => ({
                        ...oo,
                        isCorrect: form.multipleCorrect ? (oi === i ? !oo.isCorrect : oo.isCorrect) : oi === i,
                      })),
                    }))} />
                  <Input className="flex-1" value={o.text}
                    placeholder={form.type === 'image_choice' ? `Option ${o.id.toUpperCase()} label (optional)` : `Option ${o.id.toUpperCase()}`}
                    onChange={(e) => setOption(i, { text: e.target.value })} />
                  {form.type === 'image_choice' && (
                    <ImagePicker compact courseId={courseId} value={o.image}
                      onChange={(image) => setOption(i, { image })} />
                  )}
                  {form.options.length > 2 && (
                    <button onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, oi) => oi !== i) }))}>
                      <Trash2 size={15} className="text-rose-400" />
                    </button>
                  )}
                </div>
              ))}
              <Toggle label="Multiple correct answers" checked={form.multipleCorrect}
                onChange={(v) => setForm((f) => ({ ...f, multipleCorrect: v, options: v ? f.options : f.options.map((o, i) => ({ ...o, isCorrect: i === 0 })) }))} />
            </div>
          )}

          {form.type === 'true_false' && (
            <Select label="Correct answer" value={form.options[0]?.isCorrect ? 'true' : 'false'}
              options={[{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }]}
              onChange={(e) => setForm((f) => ({ ...f, options: [{ id: 'true', text: 'True', isCorrect: e.target.value === 'true' }, { id: 'false', text: 'False', isCorrect: e.target.value === 'false' }] }))} />
          )}

          {form.type === 'short_answer' && (
            <Textarea label="Accepted answers (one per line, case-insensitive by default)"
              value={form.correctAnswers} onChange={(e) => setForm((f) => ({ ...f, correctAnswers: e.target.value }))} />
          )}
          {form.type === 'fill_blanks' && (
            <Textarea label="Answers — one line per blank; use a|b for alternatives"
              value={form.correctAnswers} onChange={(e) => setForm((f) => ({ ...f, correctAnswers: e.target.value }))}
              placeholder={'80\n443'} />
          )}
          {['short_answer', 'fill_blanks'].includes(form.type) && (
            <Toggle label="Case sensitive matching" checked={form.caseSensitive}
              onChange={(v) => setForm((f) => ({ ...f, caseSensitive: v }))} />
          )}

          <div className="grid grid-cols-3 gap-3">
            <Input label="Points" type="number" min="0" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))} />
            <Input label="Negative points" type="number" min="0" value={form.negativePoints}
              onChange={(e) => setForm((f) => ({ ...f, negativePoints: e.target.value }))} />
            <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </div>
          <Textarea label="Explanation (shown after grading)" value={form.explanation}
            onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} />
          <Button className="w-full" loading={busy} onClick={save} disabled={!form.text.trim()}>Save question</Button>
        </div>
      </Modal>
    </div>
  );
}
