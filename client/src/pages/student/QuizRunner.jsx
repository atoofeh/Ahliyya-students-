import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, ShieldAlert, ChevronLeft, ChevronRight, Send, Maximize } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import useAntiCheat from '../../hooks/useAntiCheat';
import { Button, Card, Spinner, Badge, Modal } from '../../components/ui';

/**
 * Fullscreen proctored quiz runner. Autosaves every 15s, live countdown,
 * anti-cheat monitoring with warning banner, auto-submit on time-up or
 * violation threshold.
 */
export default function QuizRunner() {
  const { courseId, quizId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [warning, setWarning] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const buildAnswerPayload = useCallback((ansMap, questions) =>
    questions.map((q) => ({
      questionId: q.questionId,
      selectedOptionIds: ansMap[q.questionId]?.selected || [],
      textAnswer: ansMap[q.questionId]?.text || '',
      blanks: ansMap[q.questionId]?.blanks || [],
    })), []);

  const doSubmit = useCallback(async (auto = false) => {
    if (submittedRef.current || !attempt) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const payload = buildAnswerPayload(answers, attempt.questions);
      const { data } = await api.post(`/quizzes/attempts/${attempt.attemptId}/submit`, { answers: payload });
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      toast[auto ? 'info' : 'success'](auto ? 'Quiz auto-submitted' : 'Quiz submitted');
      navigate(`/student/attempts/${data._id || attempt.attemptId}`, { replace: true });
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      toast.error(apiError(err));
      if (err.response?.data?.code === 'TIME_UP') {
        navigate(`/student/courses/${courseId}`, { replace: true });
      }
    }
  }, [attempt, answers, buildAnswerPayload, navigate, toast, courseId]);

  const { violations, enterFullscreen } = useAntiCheat({
    attemptId: attempt?.attemptId,
    enabled: !!attempt && attempt.quiz?.antiCheat?.enabled !== false,
    requireFullscreen: attempt?.quiz?.antiCheat?.requireFullscreen,
    blockCopyPaste: attempt?.quiz?.antiCheat?.blockCopyPaste !== false,
    onWarning: (type) => {
      setWarning(type.replace(/_/g, ' '));
      setTimeout(() => setWarning(null), 4000);
    },
    onAutoSubmit: () => doSubmit(true),
  });

  // Start attempt
  useEffect(() => {
    api.post(`/quizzes/courses/${courseId}/${quizId}/start`)
      .then(({ data }) => {
        setAttempt(data);
        // Rehydrate any autosaved answers when resuming.
        const restored = {};
        for (const a of data.answers || []) {
          restored[a.questionId] = { selected: a.selectedOptionIds || [], text: a.textAnswer || '', blanks: a.blanks || [] };
        }
        setAnswers(restored);
      })
      .catch((err) => {
        toast.error(apiError(err));
        navigate(`/student/courses/${courseId}`, { replace: true });
      });
  }, [courseId, quizId, navigate, toast]);

  // Countdown timer
  useEffect(() => {
    if (!attempt?.deadlineAt) return undefined;
    const tick = () => {
      const ms = new Date(attempt.deadlineAt) - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0) doSubmit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt, doSubmit]);

  // Autosave every 15s
  useEffect(() => {
    if (!attempt) return undefined;
    const interval = setInterval(() => {
      const payload = buildAnswerPayload(answers, attempt.questions);
      // clientSavedAt lets the server drop a slow, older save that arrives after a newer one.
      api.post(`/quizzes/attempts/${attempt.attemptId}/answers`, { answers: payload, clientSavedAt: new Date().toISOString() }).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [attempt, answers, buildAnswerPayload]);

  if (!attempt) return <div className="flex h-screen items-center justify-center bg-surface-50 dark:bg-surface-900"><Spinner full /></div>;

  const q = attempt.questions[index];
  const answer = answers[q.questionId] || { selected: [], text: '', blanks: [] };
  const setAnswer = (patch) => setAnswers((a) => ({ ...a, [q.questionId]: { ...answer, ...patch } }));
  const answeredCount = attempt.questions.filter((qq) => {
    const a = answers[qq.questionId];
    return a && (a.selected?.length || a.text?.trim() || a.blanks?.some((b) => b?.trim()));
  }).length;

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const toggleOption = (optId) => {
    if (q.multipleCorrect) {
      const set = new Set(answer.selected);
      set.has(optId) ? set.delete(optId) : set.add(optId);
      setAnswer({ selected: [...set] });
    } else {
      setAnswer({ selected: [optId] });
    }
  };

  const renderQuestion = () => {
    const blanksCount = (q.text.match(/\{\{blank\}\}/g) || []).length;
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap text-lg font-medium text-surface-900 dark:text-white">
            {q.type === 'fill_blanks'
              ? q.text.split('{{blank}}').map((part, i, arr) => (
                  <span key={i}>{part}{i < arr.length - 1 && <span className="mx-1 inline-block rounded bg-primary-100 dark:bg-primary-900/40 px-2 text-primary-600 dark:text-primary-300 text-sm">blank {i + 1}</span>}</span>
                ))
              : q.text}
          </p>
          <Badge color="primary">{q.points} pt{q.points !== 1 && 's'}</Badge>
        </div>

        {q.image && <img src={`${api.defaults.baseURL}/files/${q.image}/content`} alt="Question" className="max-h-72 rounded-lg" />}

        {['multiple_choice', 'true_false', 'image_choice'].includes(q.type) && (
          <div className="space-y-2">
            {q.multipleCorrect && <p className="text-xs text-surface-400">Select all that apply</p>}
            {q.options.map((o) => (
              <button key={o.id} onClick={() => toggleOption(o.id)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left text-sm transition-colors ${
                  answer.selected.includes(o.id)
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-200'
                    : 'border-surface-200 dark:border-surface-600 hover:border-primary-300 text-surface-700 dark:text-surface-200'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-${q.multipleCorrect ? 'md' : 'full'} border-2 ${
                  answer.selected.includes(o.id) ? 'border-primary-500 bg-primary-500' : 'border-surface-300'}`}>
                  {answer.selected.includes(o.id) && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                {o.image && <img src={`${api.defaults.baseURL}/files/${o.image}/content`} alt="" className="h-16 rounded" />}
                {o.text}
              </button>
            ))}
          </div>
        )}

        {q.type === 'short_answer' && (
          <input value={answer.text} onChange={(e) => setAnswer({ text: e.target.value })}
            placeholder="Type your answer..."
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-3 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
        )}

        {q.type === 'essay' && (
          <textarea value={answer.text} onChange={(e) => setAnswer({ text: e.target.value })}
            placeholder="Write your essay answer..." rows={8}
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-3 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
        )}

        {q.type === 'fill_blanks' && (
          <div className="space-y-2">
            {Array.from({ length: blanksCount }).map((_, i) => (
              <input key={i} value={answer.blanks[i] || ''}
                onChange={(e) => {
                  const blanks = [...(answer.blanks || [])];
                  blanks[i] = e.target.value;
                  setAnswer({ blanks });
                }}
                placeholder={`Blank ${i + 1}`}
                className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-2.5 text-sm text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface-100 dark:bg-surface-900 select-none">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-surface-900 dark:text-white">{attempt.quiz.title}</p>
            <p className="text-xs text-surface-400">Attempt #{attempt.attemptNumber} · {answeredCount}/{attempt.questions.length} answered</p>
          </div>
          <div className="flex items-center gap-3">
            {violations > 0 && (
              <Badge color="red"><ShieldAlert size={12} className="mr-1" /> {violations} violation{violations !== 1 && 's'}</Badge>
            )}
            {attempt.quiz.antiCheat?.requireFullscreen && !document.fullscreenElement && (
              <Button size="sm" variant="outline" onClick={enterFullscreen}><Maximize size={14} /> Fullscreen</Button>
            )}
            {remaining != null && (
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-bold ${
                remaining < 120 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300 animate-pulse' : 'bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200'}`}>
                <Clock size={15} /> {fmt(remaining)}
              </div>
            )}
          </div>
        </div>
      </div>

      {warning && (
        <div className="sticky top-[57px] z-10 bg-rose-500 px-4 py-2 text-center text-sm font-medium text-white animate-fade-in">
          ⚠ Suspicious activity detected: {warning}. This has been reported to your instructor.
        </div>
      )}

      <div className="mx-auto max-w-4xl p-4 md:p-6">
        {/* Question navigator */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {attempt.questions.map((qq, i) => {
            const a = answers[qq.questionId];
            const done = a && (a.selected?.length || a.text?.trim() || a.blanks?.some((b) => b?.trim()));
            return (
              <button key={qq.questionId} onClick={() => setIndex(i)}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                  i === index ? 'bg-primary-600 text-white'
                    : done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-white dark:bg-surface-800 text-surface-500 border border-surface-200 dark:border-surface-600'}`}>
                {i + 1}
              </button>
            );
          })}
        </div>

        <Card className="p-6">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-surface-400">
            Question {index + 1} of {attempt.questions.length} · {q.type.replace(/_/g, ' ')}
          </p>
          {renderQuestion()}
        </Card>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            <ChevronLeft size={16} /> Previous
          </Button>
          {index < attempt.questions.length - 1 ? (
            <Button onClick={() => setIndex((i) => i + 1)}>Next <ChevronRight size={16} /></Button>
          ) : (
            <Button onClick={() => setConfirmSubmit(true)} loading={submitting}>
              <Send size={15} /> Submit quiz
            </Button>
          )}
        </div>
      </div>

      <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit quiz?">
        <p className="text-sm text-surface-600 dark:text-surface-300">
          You answered {answeredCount} of {attempt.questions.length} questions.
          {answeredCount < attempt.questions.length && ' Unanswered questions score zero.'}
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmSubmit(false)}>Keep working</Button>
          <Button className="flex-1" loading={submitting} onClick={() => doSubmit(false)}>Submit now</Button>
        </div>
      </Modal>
    </div>
  );
}
