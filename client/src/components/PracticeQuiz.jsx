import { useCallback, useEffect, useState } from 'react';
import { Check, X, RotateCcw, Sparkles } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { useLanguage } from '../hooks/useLanguage';
import { Button, ProgressBar } from './ui';
import ChoiceGroup from './Choice';
import { SkeletonCard } from './Skeletons';

/**
 * Practice under a past paper.
 *
 * Revision, not an exam: one question at a time, the verdict the moment it is
 * answered, and as many run-throughs as a student wants. Nothing is recorded
 * and no score goes to a teacher — which is the point, because a student
 * revising for a retake should be free to be wrong.
 *
 * The key stays on the server: the client posts what was chosen and is told
 * what came of it, so nothing in the page ever holds the answers.
 */
export default function PracticeQuiz({ paperId, onClose }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ items: null, error: null });
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState([]);
  const [verdict, setVerdict] = useState(null);
  const [right, setRight] = useState(0);
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/past-papers/${paperId}/practice`);
      setState({ items: data.items, error: null });
    } catch (err) {
      setState({ items: null, error: apiError(err) });
    }
  }, [paperId]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const items = state.items;
  const question = items?.[at];
  const total = items?.length || 0;

  const check = async () => {
    if (!selected.length || verdict) return;
    setChecking(true);
    try {
      const { data } = await api.post(`/past-papers/${paperId}/practice/${question._id}/check`, { selectedOptionIds: selected });
      setVerdict(data);
      if (data.correct) setRight((n) => n + 1);
    } catch (err) {
      setState((s) => ({ ...s, error: apiError(err) }));
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    setVerdict(null);
    setSelected([]);
    if (at + 1 >= total) setFinished(true);
    else setAt(at + 1);
  };

  const restart = () => {
    setAt(0);
    setSelected([]);
    setVerdict(null);
    setRight(0);
    setFinished(false);
  };

  if (state.error) return <p className="px-4 pb-4 text-sm text-rose-500">{state.error}</p>;
  if (!items) return <div className="px-4 pb-4"><SkeletonCard lines={3} /></div>;
  if (!total) return <p className="px-4 pb-4 text-sm text-surface-400">{t('pp.pr.empty')}</p>;

  if (finished) {
    const perfect = right === total;
    return (
      <div className="px-4 pb-5 text-center">
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
          perfect ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-brand-50 text-brand-600 dark:bg-surface-800 dark:text-brand-300'}`}>
          {perfect ? <Sparkles size={22} /> : <Check size={22} />}
        </div>
        <p className="font-display text-[15px] font-bold text-surface-900 dark:text-white">
          {t('pp.pr.score', { right, total })}
        </p>
        <p className="mt-1 text-xs text-surface-400">{t('pp.pr.hint')}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={restart}><RotateCcw size={15} /> {t('pp.pr.retry')}</Button>
          <Button variant="outline" onClick={onClose}>{t('pp.pr.close')}</Button>
        </div>
      </div>
    );
  }

  const correctIds = verdict?.correctOptionIds || [];
  // After the verdict the choices stop being controls and become the answer:
  // the right one is marked green, a wrong pick red.
  const tone = (id) => {
    if (correctIds.includes(id)) return 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/20 dark:text-emerald-100';
    if (selected.includes(id)) return 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/70 dark:bg-rose-900/20 dark:text-rose-100';
    return 'border-surface-200 text-surface-500 dark:border-surface-700 dark:text-surface-400';
  };

  return (
    <div className="px-4 pb-5">
      <div className="mb-3 flex items-center gap-3">
        <ProgressBar value={Math.round((at / total) * 100)} className="h-1.5 flex-1" />
        <span dir="ltr" className="shrink-0 text-[11px] font-semibold tabular-nums text-surface-400">
          {at + 1} / {total}
        </span>
      </div>

      <p dir="auto" className="text-[15px] font-semibold leading-relaxed text-surface-900 dark:text-white">{question.text}</p>

      {/* While answering these are controls; once answered they are the answer,
          so they stop being buttons and become a marked list. */}
      {verdict ? (
        <ul className="mt-3 space-y-2">
          {question.options.map((o) => (
            <li key={o.id} dir="auto"
              className={`flex items-center gap-3 rounded-xl border-2 p-3.5 text-sm ${tone(o.id)}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {correctIds.includes(o.id) && <Check size={16} className="text-emerald-600 dark:text-emerald-400" />}
                {!correctIds.includes(o.id) && selected.includes(o.id) && <X size={16} className="text-rose-500" />}
              </span>
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <ChoiceGroup
            multiple={question.multipleCorrect}
            options={question.options}
            value={selected}
            onChange={setSelected}
            name={question.text}
          />
        </div>
      )}

      {verdict && (
        <div role="status" className={`mt-3 rounded-xl p-3 text-sm ${
          verdict.correct ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                          : 'bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200'}`}>
          <p className="flex items-center gap-1.5 font-semibold">
            {verdict.correct ? <Check size={15} /> : <X size={15} />}
            {t(verdict.correct ? 'pp.pr.correct' : 'pp.pr.wrong')}
          </p>
          {verdict.explanation && <p dir="auto" className="mt-1 leading-relaxed opacity-90">{verdict.explanation}</p>}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {verdict
          ? <Button onClick={next}>{t(at + 1 >= total ? 'pp.pr.finish' : 'pp.pr.next')}</Button>
          : <Button onClick={check} loading={checking} disabled={!selected.length}>{t('pp.pr.check')}</Button>}
        <Button variant="ghost" onClick={onClose}>{t('pp.pr.close')}</Button>
      </div>
    </div>
  );
}
