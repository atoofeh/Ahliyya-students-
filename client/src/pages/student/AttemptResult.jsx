import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, MinusCircle, Trophy, ArrowLeft } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Badge, Button } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

export default function AttemptResult() {
  const { attemptId } = useParams();
  const toast = useToast();
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    api.get(`/quizzes/attempts/${attemptId}`)
      .then(({ data }) => setAttempt(data))
      .catch((err) => toast.error(apiError(err)));
  }, [attemptId, toast]);

  if (!attempt) return <SkeletonCard />;

  if (attempt.message) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-surface-600 dark:text-surface-300">{attempt.message}</p>
        <Link to="/student" className="mt-4 inline-block"><Button variant="outline"><ArrowLeft size={15} /> Back</Button></Link>
      </Card>
    );
  }

  const answerByQ = Object.fromEntries((attempt.answers || []).map((a) => [String(a.questionId), a]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={`/student/courses/${attempt.course?._id || attempt.course}`} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
        <ArrowLeft size={15} /> Back to course
      </Link>

      <Card className="p-6 text-center">
        <Trophy size={40} className={`mx-auto mb-2 ${attempt.passed ? 'text-amber-400' : 'text-surface-300'}`} />
        <h1 className="text-xl font-bold text-surface-900 dark:text-white">{attempt.quiz?.title}</h1>
        <p className="mt-1 text-4xl font-extrabold text-surface-900 dark:text-white">{attempt.percent}%</p>
        <p className="text-sm text-surface-400">{attempt.score} / {attempt.maxScore} points · Attempt #{attempt.attemptNumber}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          {attempt.pendingManualGrading
            ? <Badge color="amber">Some answers await manual grading</Badge>
            : attempt.passed != null && <Badge color={attempt.passed ? 'green' : 'red'}>{attempt.passed ? 'Passed' : 'Not passed'} (pass mark {attempt.quiz?.passingScore}%)</Badge>}
          {attempt.status === 'auto_submitted' && <Badge color="amber">Auto-submitted</Badge>}
          {attempt.status === 'invalidated' && <Badge color="red">Invalidated: {attempt.invalidatedReason}</Badge>}
        </div>
      </Card>

      {(attempt.questionsSnapshot || []).map((q, i) => {
        const a = answerByQ[String(q.questionId)] || {};
        const icon = a.needsManualGrading || a.isCorrect == null
          ? <MinusCircle size={18} className="text-amber-500" />
          : a.isCorrect ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />;

        return (
          <Card key={q.questionId} className="p-5">
            <div className="flex items-start gap-3">
              {icon}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-surface-900 dark:text-white">
                  {i + 1}. {q.type === 'fill_blanks' ? q.text.replace(/\{\{blank\}\}/g, '_____') : q.text}
                </p>

                {['multiple_choice', 'true_false', 'image_choice'].includes(q.type) && (
                  <div className="mt-2 space-y-1">
                    {q.options.map((o) => {
                      const chosen = (a.selectedOptionIds || []).includes(o.id);
                      const correct = o.isCorrect;
                      return (
                        <div key={o.id} className={`rounded-lg px-3 py-1.5 text-sm ${
                          correct ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                            : chosen ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                            : 'text-surface-500'}`}>
                          {o.text}
                          {chosen && <span className="ml-2 text-xs">(your answer)</span>}
                          {correct && <span className="ml-2 text-xs">✓ correct</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {['short_answer', 'essay'].includes(q.type) && (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="rounded-lg bg-surface-50 dark:bg-surface-700/40 px-3 py-2 text-surface-700 dark:text-surface-200 whitespace-pre-wrap">
                      {a.textAnswer || <em className="text-surface-400">No answer</em>}
                    </p>
                    {q.correctAnswers?.length > 0 && (
                      <p className="text-emerald-600 dark:text-emerald-400 text-xs">Accepted: {q.correctAnswers.join(' / ')}</p>
                    )}
                  </div>
                )}

                {q.type === 'fill_blanks' && (
                  <div className="mt-2 space-y-1 text-sm">
                    {(a.blanks || []).map((b, bi) => (
                      <p key={bi} className="text-surface-600 dark:text-surface-300">
                        Blank {bi + 1}: <strong>{b || '—'}</strong>
                        {q.correctAnswers?.[bi] && <span className="ml-2 text-xs text-emerald-600">✓ {q.correctAnswers[bi].split('|').join(' / ')}</span>}
                      </p>
                    ))}
                  </div>
                )}

                {a.graderFeedback && (
                  <p className="mt-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-sm text-sky-700 dark:text-sky-300">
                    Instructor feedback: {a.graderFeedback}
                  </p>
                )}
                {q.explanation && (
                  <p className="mt-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 px-3 py-2 text-sm text-primary-700 dark:text-primary-300">
                    💡 {q.explanation}
                  </p>
                )}
              </div>
              <Badge color={a.pointsAwarded > 0 ? 'green' : 'gray'}>{a.pointsAwarded ?? 0}/{q.points}</Badge>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
