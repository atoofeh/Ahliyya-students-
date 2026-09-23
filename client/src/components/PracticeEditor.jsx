import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ClipboardPaste, Check, ArrowLeft } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { useToast } from '../hooks/useToast';
import { useLanguage } from '../hooks/useLanguage';
import { parseQuestions } from '../utils/parseQuestions';
import { Button, Input, Textarea, Modal, Toggle, EmptyState } from './ui';
import { SkeletonCard } from './Skeletons';

const LETTERS = 'abcdefghij';
const blank = () => ({ text: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }], explanation: '' });

/**
 * Writing the practice that sits under a paper.
 *
 * The papers are photographs of handwriting, so every question is typed by
 * someone. Typing forty of them one at a time is the thing that would stop
 * this being used, so there are two ways in: a single question form, and a
 * box to paste a whole exam into (see `utils/parseQuestions`), which shows
 * what it understood before anything is saved.
 *
 * A set stays hidden from students until it is published here: a practice
 * question with the wrong answer marked teaches the wrong answer.
 */
export default function PracticeEditor({ paper, onClose, onChanged }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [data, setData] = useState(null); // { published, items }
  const [view, setView] = useState('list'); // list | one | paste
  const [form, setForm] = useState(blank());
  const [editingId, setEditingId] = useState(null);
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: body } = await api.get(`/past-papers/${paper._id}/practice`);
      setData(body);
    } catch (err) { toast.error(apiError(err)); }
  }, [paper._id, toast]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const refresh = async () => { await load(); onChanged?.(); };

  const publish = async (published) => {
    try {
      await api.post(`/past-papers/${paper._id}/practice/publish`, { published });
      toast.success(t(published ? 'pp.ed.nowVisible' : 'pp.ed.nowHidden'));
      refresh();
    } catch (err) { toast.error(apiError(err)); }
  };

  const openForm = (question) => {
    setEditingId(question?._id || null);
    setForm(question
      ? { text: question.text, options: question.options.map((o) => ({ text: o.text, isCorrect: !!o.isCorrect })), explanation: question.explanation || '' }
      : blank());
    setView('one');
  };

  const saveOne = async () => {
    const body = {
      text: form.text.trim(),
      options: form.options.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
      explanation: form.explanation.trim(),
    };
    setSaving(true);
    try {
      if (editingId) await api.patch(`/past-papers/${paper._id}/practice/${editingId}`, body);
      else await api.post(`/past-papers/${paper._id}/practice`, body);
      toast.success(t('pp.ed.saved'));
      setView('list');
      refresh();
    } catch (err) { toast.error(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (question) => {
    if (!window.confirm(t('pp.ed.confirmDelete'))) return;
    try {
      await api.delete(`/past-papers/${paper._id}/practice/${question._id}`);
      toast.success(t('pp.ed.removed'));
      refresh();
    } catch (err) { toast.error(apiError(err)); }
  };

  const parsed = view === 'paste' ? parseQuestions(pasted) : null;
  const addParsed = async () => {
    setSaving(true);
    try {
      const { data: body } = await api.post(`/past-papers/${paper._id}/practice`, { items: parsed.questions });
      toast.success(t('pp.ed.addedMany', { n: body.added }));
      setPasted('');
      setView('list');
      refresh();
    } catch (err) { toast.error(apiError(err)); }
    finally { setSaving(false); }
  };

  const canSave = form.text.trim() && form.options.filter((o) => o.text.trim()).length >= 2
    && form.options.some((o) => o.isCorrect && o.text.trim());

  const setOption = (i, patch) => setForm((f) => ({
    ...f,
    options: f.options.map((o, j) => (j === i ? { ...o, ...patch } : (patch.isCorrect ? { ...o, isCorrect: false } : o))),
  }));

  return (
    <Modal open onClose={onClose} title={t('pp.ed.title')} wide>
      {!data ? <SkeletonCard lines={4} /> : view === 'list' ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-50 p-3.5 dark:bg-surface-800/60">
            <Toggle
              label={t('pp.ed.publish')}
              hint={data.items.length ? t('pp.ed.publishHint', { n: data.items.length }) : t('pp.ed.publishEmptyHint')}
              checked={!!data.published}
              onChange={(v) => publish(v)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openForm(null)}><Plus size={15} /> {t('pp.ed.add')}</Button>
            <Button variant="outline" onClick={() => setView('paste')}><ClipboardPaste size={15} /> {t('pp.ed.pasteMany')}</Button>
          </div>

          {data.items.length === 0 ? (
            <EmptyState title={t('pp.ed.empty')} subtitle={t('pp.ed.emptyHint')} />
          ) : (
            <ol className="divide-y divide-surface-100 overflow-hidden rounded-xl border border-surface-200 dark:divide-surface-700/60 dark:border-surface-700">
              {data.items.map((q, i) => (
                <li key={q._id} className="flex items-start gap-3 p-3">
                  <span className="mt-0.5 w-5 shrink-0 text-xs font-bold tabular-nums text-surface-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-[13px] font-semibold text-surface-800 dark:text-surface-100">{q.text}</p>
                    <p dir="auto" className="mt-0.5 truncate text-xs text-emerald-600 dark:text-emerald-400">
                      <Check size={11} className="inline" /> {q.options.filter((o) => o.isCorrect).map((o) => o.text).join(' · ')}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openForm(q)} aria-label={t('pp.ed.edit')} title={t('pp.ed.edit')}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(q)} aria-label={t('pp.ed.delete')} title={t('pp.ed.delete')}><Trash2 size={14} className="text-rose-400" /></Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : view === 'one' ? (
        <div className="space-y-4">
          <Textarea label={t('pp.ed.question')} dir="auto" value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />

          <div className="space-y-2">
            <span className="block text-[13px] font-semibold text-surface-700 dark:text-surface-200">{t('pp.ed.options')}</span>
            {form.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setOption(i, { isCorrect: true })}
                  aria-label={t('pp.ed.markCorrect')} title={t('pp.ed.markCorrect')}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors ${
                    o.isCorrect ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-surface-300 text-surface-400 hover:border-emerald-400 dark:border-surface-600'}`}>
                  {LETTERS[i]}
                </button>
                <Input className="flex-1" dir="auto" value={o.text} placeholder={t('pp.ed.optionPlaceholder')}
                  onChange={(e) => setOption(i, { text: e.target.value })} />
                {form.options.length > 2 && (
                  <Button variant="ghost" size="sm" aria-label={t('pp.ed.removeOption')}
                    onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }))}>
                    <Trash2 size={14} className="text-rose-400" />
                  </Button>
                )}
              </div>
            ))}
            {form.options.length < 10 && (
              <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, options: [...f.options, { text: '', isCorrect: false }] }))}>
                <Plus size={14} /> {t('pp.ed.addOption')}
              </Button>
            )}
            <p className="text-xs text-surface-400">{t('pp.ed.markHint')}</p>
          </div>

          <Input label={t('pp.ed.explanation')} hint={t('pp.ed.explanationHint')} dir="auto" value={form.explanation}
            onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} />

          <div className="flex gap-2">
            <Button onClick={saveOne} loading={saving} disabled={!canSave}>{t('pp.ed.save')}</Button>
            <Button variant="ghost" onClick={() => setView('list')}><ArrowLeft size={15} /> {t('pp.ed.back')}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Textarea label={t('pp.ed.pasteMany')} dir="auto" rows={12} value={pasted}
            onChange={(e) => setPasted(e.target.value)} placeholder={t('pp.ed.pastePlaceholder')} className="min-h-[220px] font-mono text-[13px]" />
          <p className="whitespace-pre-line text-xs leading-relaxed text-surface-500 dark:text-surface-400">{t('pp.ed.pasteHelp')}</p>

          {pasted.trim() && (
            <div className="rounded-xl bg-surface-50 p-3 text-[13px] dark:bg-surface-800/60">
              <p className="font-semibold text-surface-700 dark:text-surface-200">{t('pp.ed.pasteFound', { n: parsed.questions.length })}</p>
              {parsed.unmarked > 0 && <p className="mt-1 text-amber-600 dark:text-amber-400">{t('pp.ed.pasteUnmarked', { n: parsed.unmarked })}</p>}
              {parsed.skipped > 0 && <p className="mt-1 text-surface-400">{t('pp.ed.pasteSkipped', { n: parsed.skipped })}</p>}
              {parsed.questions[0] && (
                <p dir="auto" className="mt-2 truncate text-xs text-surface-500">{t('pp.ed.pasteFirst', { text: parsed.questions[0].text })}</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={addParsed} loading={saving} disabled={!parsed?.questions.length}>
              {t('pp.ed.pasteAdd', { n: parsed?.questions.length || 0 })}
            </Button>
            <Button variant="ghost" onClick={() => setView('list')}><ArrowLeft size={15} /> {t('pp.ed.back')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
