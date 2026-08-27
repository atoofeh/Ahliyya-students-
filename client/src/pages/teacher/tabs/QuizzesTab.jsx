import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Lock, Unlock, BarChart3, Users, BellRing, HelpCircle } from 'lucide-react';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Modal, Input, Select, Textarea, Toggle, Badge, EmptyState, Spinner } from '../../../components/ui';

const emptyQuiz = () => ({
  title: '', description: '', questions: [], timeLimitMinutes: 0, passingScore: 60,
  maxAttempts: 1, shuffleQuestions: true, shuffleAnswers: true, negativeMarking: false,
  showExplanations: true, showResultsImmediately: true, leaderboardEnabled: false,
  availableFrom: '', availableUntil: '', isPublished: false,
  poolEnabled: false, poolDrawCount: 10, poolTags: '', poolDifficulty: '',
  acEnabled: true, acFullscreen: true, acMaxViolations: 10, acBlockCopy: true,
});

export default function QuizzesTab({ courseId }) {
  const toast = useToast();
  const [quizzes, setQuizzes] = useState(null);
  const [bank, setBank] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyQuiz());
  const [busy, setBusy] = useState(false);
  const [statsModal, setStatsModal] = useState(null); // quiz for stats
  const [stats, setStats] = useState(null);
  const [attemptsModal, setAttemptsModal] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const [gradeModal, setGradeModal] = useState(null); // attempt detail
  const [grades, setGrades] = useState({});

  const load = useCallback(() => {
    api.get(`/quizzes/courses/${courseId}`).then(({ data }) => setQuizzes(data)).catch(() => setQuizzes([]));
    api.get(`/quizzes/courses/${courseId}/questions`, { params: { limit: 100 } })
      .then(({ data }) => setBank(data.items)).catch(() => {});
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(emptyQuiz()); setModal(true); };
  const openEdit = (q) => {
    setForm({
      _id: q._id, title: q.title, description: q.description || '', questions: (q.questions || []).map(String),
      timeLimitMinutes: q.timeLimitMinutes, passingScore: q.passingScore, maxAttempts: q.maxAttempts,
      shuffleQuestions: q.shuffleQuestions, shuffleAnswers: q.shuffleAnswers, negativeMarking: q.negativeMarking,
      showExplanations: q.showExplanations, showResultsImmediately: q.showResultsImmediately,
      leaderboardEnabled: q.leaderboardEnabled,
      availableFrom: q.availableFrom ? q.availableFrom.slice(0, 16) : '',
      availableUntil: q.availableUntil ? q.availableUntil.slice(0, 16) : '',
      isPublished: q.isPublished,
      poolEnabled: q.pool?.enabled || false, poolDrawCount: q.pool?.drawCount || 10,
      poolTags: (q.pool?.tags || []).join(', '), poolDifficulty: q.pool?.difficulty || '',
      acEnabled: q.antiCheat?.enabled !== false, acFullscreen: q.antiCheat?.requireFullscreen !== false,
      acMaxViolations: q.antiCheat?.maxViolations ?? 10, acBlockCopy: q.antiCheat?.blockCopyPaste !== false,
    });
    setModal(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        title: form.title, description: form.description, questions: form.questions,
        timeLimitMinutes: Number(form.timeLimitMinutes) || 0,
        passingScore: Number(form.passingScore) || 60,
        maxAttempts: Number(form.maxAttempts) || 0,
        shuffleQuestions: form.shuffleQuestions, shuffleAnswers: form.shuffleAnswers,
        negativeMarking: form.negativeMarking, showExplanations: form.showExplanations,
        showResultsImmediately: form.showResultsImmediately, leaderboardEnabled: form.leaderboardEnabled,
        availableFrom: form.availableFrom ? new Date(form.availableFrom) : null,
        availableUntil: form.availableUntil ? new Date(form.availableUntil) : null,
        isPublished: form.isPublished,
        pool: {
          enabled: form.poolEnabled,
          drawCount: Number(form.poolDrawCount) || 10,
          tags: form.poolTags.split(',').map((t) => t.trim()).filter(Boolean),
          difficulty: form.poolDifficulty || null,
        },
        antiCheat: {
          enabled: form.acEnabled, requireFullscreen: form.acFullscreen,
          maxViolations: Number(form.acMaxViolations) || 10, blockCopyPaste: form.acBlockCopy,
        },
      };
      if (form._id) await api.put(`/quizzes/courses/${courseId}/${form._id}`, payload);
      else await api.post(`/quizzes/courses/${courseId}`, payload);
      toast.success('Quiz saved');
      setModal(false);
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const toggleLock = async (q) => {
    try {
      await api.put(`/quizzes/courses/${courseId}/${q._id}`, { isLocked: !q.isLocked });
      toast.success(q.isLocked ? 'Quiz unlocked' : 'Quiz locked');
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this quiz?')) return;
    try { await api.delete(`/quizzes/courses/${courseId}/${id}`); load(); }
    catch (err) { toast.error(apiError(err)); }
  };

  const openStats = async (q) => {
    setStatsModal(q); setStats(null);
    const { data } = await api.get(`/quizzes/courses/${courseId}/${q._id}/stats`);
    setStats(data);
  };

  const openAttempts = async (q) => {
    setAttemptsModal(q); setAttempts(null);
    const { data } = await api.get(`/quizzes/courses/${courseId}/${q._id}/attempts`, { params: { limit: 50 } });
    setAttempts(data.items);
  };

  const openGrading = async (attemptId) => {
    const { data } = await api.get(`/quizzes/attempts/${attemptId}`);
    setGradeModal(data);
    const init = {};
    (data.answers || []).forEach((a) => {
      if (a.needsManualGrading) init[a.questionId] = { points: 0, feedback: '' };
    });
    setGrades(init);
  };

  const submitGrades = async () => {
    setBusy(true);
    try {
      const payload = Object.entries(grades).map(([questionId, g]) => ({
        questionId, points: Number(g.points) || 0, feedback: g.feedback,
      }));
      await api.post(`/quizzes/attempts/${gradeModal._id}/grade`, { grades: payload });
      toast.success('Attempt graded');
      setGradeModal(null);
      if (attemptsModal) openAttempts(attemptsModal);
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const remind = async (q) => {
    try {
      const { data } = await api.post(`/quizzes/courses/${courseId}/${q._id}/remind`, {});
      toast.success(`Reminder sent to ${data.notified} student(s)`);
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!quizzes) return <Spinner full />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus size={15} /> New quiz</Button>
      </div>

      {quizzes.length === 0 ? (
        <Card><EmptyState icon={<HelpCircle size={24} />} title="No quizzes yet"
          subtitle="Build questions in the Question bank tab, then assemble quizzes here." /></Card>
      ) : quizzes.map((q) => (
        <Card key={q._id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-surface-900 dark:text-white">{q.title}</p>
                <Badge color={q.isPublished ? 'green' : 'gray'}>{q.isPublished ? 'Published' : 'Draft'}</Badge>
                {q.isLocked && <Badge color="red">Locked</Badge>}
                {q.pool?.enabled && <Badge color="blue">Pool: {q.pool.drawCount}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-surface-400">
                {q.pool?.enabled ? `${q.pool.drawCount} from pool` : `${q.questions?.length || 0} questions`} ·
                {q.timeLimitMinutes ? ` ${q.timeLimitMinutes} min ·` : ' untimed ·'} pass {q.passingScore}% ·
                {q.maxAttempts || '∞'} attempts
                {q.availableUntil && ` · closes ${new Date(q.availableUntil).toLocaleString()}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => openStats(q)}><BarChart3 size={14} /> Stats</Button>
              <Button size="sm" variant="outline" onClick={() => openAttempts(q)}><Users size={14} /> Attempts</Button>
              <Button size="sm" variant="outline" onClick={() => remind(q)}><BellRing size={14} /></Button>
              <Button size="sm" variant="outline" onClick={() => toggleLock(q)}>
                {q.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => remove(q._id)}><Trash2 size={14} className="text-rose-400" /></Button>
            </div>
          </div>
        </Card>
      ))}

      {/* Quiz editor */}
      <Modal open={modal} onClose={() => setModal(false)} title={form._id ? 'Edit quiz' : 'New quiz'} wide>
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

          <Toggle label="Random question pool" hint="Draw random questions instead of a fixed list"
            checked={form.poolEnabled} onChange={(v) => setForm((f) => ({ ...f, poolEnabled: v }))} />

          {form.poolEnabled ? (
            <div className="grid grid-cols-3 gap-3">
              <Input label="Questions to draw" type="number" min="1" value={form.poolDrawCount}
                onChange={(e) => setForm((f) => ({ ...f, poolDrawCount: e.target.value }))} />
              <Input label="Filter by tags" value={form.poolTags} onChange={(e) => setForm((f) => ({ ...f, poolTags: e.target.value }))} />
              <Select label="Difficulty filter" value={form.poolDifficulty}
                options={[{ value: '', label: 'Any' }, ...['easy', 'medium', 'hard'].map((d) => ({ value: d, label: d }))]}
                onChange={(e) => setForm((f) => ({ ...f, poolDifficulty: e.target.value }))} />
            </div>
          ) : (
            <div>
              <span className="mb-1 block text-sm font-medium text-surface-700 dark:text-surface-200">
                Questions ({form.questions.length} selected)
              </span>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-600 p-2">
                {bank.length === 0 && <p className="p-2 text-sm text-surface-400">Question bank is empty.</p>}
                {bank.map((qq) => (
                  <label key={qq._id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/50">
                    <input type="checkbox" checked={form.questions.includes(qq._id)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        questions: e.target.checked ? [...f.questions, qq._id] : f.questions.filter((id) => id !== qq._id),
                      }))} />
                    <span className="flex-1 truncate">{qq.text}</span>
                    <Badge>{qq.type.replace(/_/g, ' ')}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Input label="Time limit (min, 0 = none)" type="number" min="0" value={form.timeLimitMinutes}
              onChange={(e) => setForm((f) => ({ ...f, timeLimitMinutes: e.target.value }))} />
            <Input label="Passing score %" type="number" min="0" max="100" value={form.passingScore}
              onChange={(e) => setForm((f) => ({ ...f, passingScore: e.target.value }))} />
            <Input label="Max attempts (0 = ∞)" type="number" min="0" value={form.maxAttempts}
              onChange={(e) => setForm((f) => ({ ...f, maxAttempts: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Opens at" type="datetime-local" value={form.availableFrom}
              onChange={(e) => setForm((f) => ({ ...f, availableFrom: e.target.value }))} />
            <Input label="Closes at" type="datetime-local" value={form.availableUntil}
              onChange={(e) => setForm((f) => ({ ...f, availableUntil: e.target.value }))} />
          </div>

          <div className="grid gap-1 sm:grid-cols-2">
            <Toggle label="Shuffle questions" checked={form.shuffleQuestions} onChange={(v) => setForm((f) => ({ ...f, shuffleQuestions: v }))} />
            <Toggle label="Shuffle answers" checked={form.shuffleAnswers} onChange={(v) => setForm((f) => ({ ...f, shuffleAnswers: v }))} />
            <Toggle label="Negative marking" checked={form.negativeMarking} onChange={(v) => setForm((f) => ({ ...f, negativeMarking: v }))} />
            <Toggle label="Show explanations" checked={form.showExplanations} onChange={(v) => setForm((f) => ({ ...f, showExplanations: v }))} />
            <Toggle label="Instant results" checked={form.showResultsImmediately} onChange={(v) => setForm((f) => ({ ...f, showResultsImmediately: v }))} />
            <Toggle label="Leaderboard" checked={form.leaderboardEnabled} onChange={(v) => setForm((f) => ({ ...f, leaderboardEnabled: v }))} />
          </div>

          <div className="rounded-lg border border-surface-200 dark:border-surface-600 p-3">
            <p className="mb-1 text-sm font-semibold text-surface-800 dark:text-surface-100">Anti-cheat</p>
            <Toggle label="Enable proctoring" checked={form.acEnabled} onChange={(v) => setForm((f) => ({ ...f, acEnabled: v }))} />
            <Toggle label="Require fullscreen" checked={form.acFullscreen} onChange={(v) => setForm((f) => ({ ...f, acFullscreen: v }))} />
            <Toggle label="Block copy/paste" checked={form.acBlockCopy} onChange={(v) => setForm((f) => ({ ...f, acBlockCopy: v }))} />
            <Input label="Auto-submit after N violations" type="number" min="1" value={form.acMaxViolations}
              onChange={(e) => setForm((f) => ({ ...f, acMaxViolations: e.target.value }))} />
          </div>

          <Toggle label="Published" hint="Students only see published quizzes"
            checked={form.isPublished} onChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
          <Button className="w-full" loading={busy} onClick={save}
            disabled={!form.title.trim() || (!form.poolEnabled && form.questions.length === 0)}>
            Save quiz
          </Button>
        </div>
      </Modal>

      {/* Stats */}
      <Modal open={!!statsModal} onClose={() => setStatsModal(null)} title={`Stats: ${statsModal?.title || ''}`}>
        {!stats ? <Spinner /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[['Attempts', stats.attempts], ['Students', stats.uniqueStudents || 0], ['Average', `${stats.avgPercent}%`],
                ['Pass rate', `${stats.passRate}%`], ['Highest', `${stats.highest}%`], ['Flagged', stats.flaggedAttempts]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-surface-50 dark:bg-surface-700/40 p-3">
                  <p className="text-lg font-bold text-surface-900 dark:text-white">{v}</p>
                  <p className="text-xs text-surface-400">{l}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200">Score distribution</p>
              {stats.distribution?.map((b) => (
                <div key={b.range} className="mb-1 flex items-center gap-2 text-xs">
                  <span className="w-12 text-surface-400">{b.range}</span>
                  <div className="h-3 flex-1 rounded bg-surface-100 dark:bg-surface-700">
                    <div className="h-full rounded bg-primary-500"
                      style={{ width: `${stats.attempts ? (b.count / stats.attempts) * 100 : 0}%` }} />
                  </div>
                  <span className="w-6 text-right text-surface-500">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Attempts + grading */}
      <Modal open={!!attemptsModal} onClose={() => setAttemptsModal(null)} title={`Attempts: ${attemptsModal?.title || ''}`} wide>
        {!attempts ? <Spinner /> : attempts.length === 0 ? <EmptyState title="No attempts yet" /> : (
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {attempts.map((a) => (
              <div key={a._id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{a.student?.name} <span className="text-surface-400">@{a.student?.username}</span></p>
                  <p className="text-xs text-surface-400">
                    #{a.attemptNumber} · {new Date(a.submittedAt || a.createdAt).toLocaleString()}
                    {a.riskScore > 0 && <span className="ml-2 text-rose-500">risk {a.riskScore}</span>}
                  </p>
                </div>
                <Badge color={a.pendingManualGrading ? 'amber' : a.passed ? 'green' : a.passed === false ? 'red' : 'gray'}>
                  {a.pendingManualGrading ? 'Needs grading' : `${a.percent}%`}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => openGrading(a._id)}>
                  {a.pendingManualGrading ? 'Grade' : 'Review'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!gradeModal} onClose={() => setGradeModal(null)} title={`Grade attempt — ${gradeModal?.student?.name || ''}`} wide>
        {gradeModal && (
          <div className="space-y-4">
            {(gradeModal.questionsSnapshot || []).map((q, i) => {
              const a = (gradeModal.answers || []).find((x) => String(x.questionId) === String(q.questionId)) || {};
              const manual = q.type === 'essay' || a.needsManualGrading;
              return (
                <div key={q.questionId} className="rounded-lg border border-surface-200 dark:border-surface-600 p-3">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{i + 1}. {q.text}</p>
                  <p className="mt-1 whitespace-pre-wrap rounded bg-surface-50 dark:bg-surface-700/40 px-2 py-1.5 text-sm text-surface-600 dark:text-surface-300">
                    {a.textAnswer || (a.selectedOptionIds || []).join(', ') || (a.blanks || []).join(' / ') || '(no answer)'}
                  </p>
                  {manual ? (
                    <div className="mt-2 grid grid-cols-[100px_1fr] gap-2">
                      <Input label={`Points (max ${q.points})`} type="number" min="0" max={q.points}
                        value={grades[q.questionId]?.points ?? 0}
                        onChange={(e) => setGrades((g) => ({ ...g, [q.questionId]: { ...g[q.questionId], points: e.target.value } }))} />
                      <Input label="Feedback" value={grades[q.questionId]?.feedback ?? ''}
                        onChange={(e) => setGrades((g) => ({ ...g, [q.questionId]: { ...g[q.questionId], feedback: e.target.value } }))} />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-surface-400">Auto-graded: {a.pointsAwarded ?? 0}/{q.points} pts</p>
                  )}
                </div>
              );
            })}
            {Object.keys(grades).length > 0
              ? <Button className="w-full" loading={busy} onClick={submitGrades}>Save grades</Button>
              : <p className="text-center text-sm text-surface-400">Nothing needs manual grading.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
