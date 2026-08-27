import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, HelpCircle } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Modal, Input, Select, Textarea, Toggle, Badge, EmptyState, Spinner, Pagination } from '../../../components/ui';

const TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'essay', label: 'Essay (manual grading)' },
  { value: 'fill_blanks', label: 'Fill in the blanks' },
  { value: 'image_choice', label: 'Image question' },
];

const emptyForm = () => ({
  type: 'multiple_choice', text: '', points: 1, negativePoints: 0, explanation: '',
  difficulty: 'medium', tags: '', caseSensitive: false, multipleCorrect: false,
  options: [{ id: 'a', text: '', isCorrect: true }, { id: 'b', text: '', isCorrect: false }],
  correctAnswers: '',
});

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
      _id: q._id, type: q.type, text: q.text, points: q.points, negativePoints: q.negativePoints,
      explanation: q.explanation || '', difficulty: q.difficulty, tags: (q.tags || []).join(', '),
      caseSensitive: q.caseSensitive, multipleCorrect: q.multipleCorrect,
      options: q.options?.length ? q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: !!o.isCorrect })) : emptyForm().options,
      correctAnswers: (q.correctAnswers || []).join('\n'),
    });
    setModal(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const isChoice = ['multiple_choice', 'true_false', 'image_choice'].includes(form.type);
      const payload = {
        type: form.type,
        text: form.text,
        points: Number(form.points) || 1,
        negativePoints: Number(form.negativePoints) || 0,
        explanation: form.explanation,
        difficulty: form.difficulty,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        caseSensitive: form.caseSensitive,
        multipleCorrect: form.multipleCorrect,
        options: form.type === 'true_false'
          ? [{ id: 'true', text: 'True', isCorrect: form.options[0]?.isCorrect ?? true },
             { id: 'false', text: 'False', isCorrect: !(form.options[0]?.isCorrect ?? true) }]
          : isChoice ? form.options.filter((o) => o.text.trim()) : [],
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

  if (!result) return <Spinner full />;

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

          {['multiple_choice', 'image_choice'].includes(form.type) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-surface-700 dark:text-surface-200">Options (check the correct ones)</span>
                <Button size="sm" variant="outline" onClick={() => setForm((f) => ({
                  ...f, options: [...f.options, { id: String.fromCharCode(97 + f.options.length), text: '', isCorrect: false }],
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
                  <Input className="flex-1" placeholder={`Option ${o.id.toUpperCase()}`} value={o.text}
                    onChange={(e) => setOption(i, { text: e.target.value })} />
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
