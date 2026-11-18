import { useEffect, useState } from 'react';
import api, { apiError } from '../../../api/axios';
import { useLanguage } from '../../../hooks/useLanguage';
import VideoPlayer from '../../../components/VideoPlayer';
import DocumentViewer from '../../../components/DocumentViewer';
import DownloadButton from '../../../components/DownloadButton';
import ErrorState from '../../../components/ErrorState';
import { SkeletonCard } from '../../../components/Skeletons';
import { Badge, Button, EmptyState } from '../../../components/ui';

/** Staff consumption only: no quiz attempts, lesson progress, or publish writes. */
export default function LessonPreview({ courseId, lessonId, quizzes, assignments, onOpenTab }) {
  const { t } = useLanguage();
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError(null);
      api.get(`/courses/${courseId}/lessons/${lessonId}`, { signal: controller.signal, timeout: 15000 })
        .then(({ data }) => { if (!cancelled) setLesson(data); })
        .catch((err) => {
          if (!cancelled) setError({ code: err.response?.data?.code, message: apiError(err) });
        });
    }, 0);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [courseId, lessonId, attempt]);

  if (error) return <ErrorState compact code={error.code} message={error.message} onRetry={() => setAttempt((value) => value + 1)} />;
  if (!lesson) return <SkeletonCard lines={4} />;

  let content;
  if (lesson.type === 'video' && lesson.video) {
    content = lesson.video.status === 'ready'
      ? <VideoPlayer key={lesson.video._id} videoId={lesson.video._id} />
      : <EmptyState title={t('player.processing')} />;
  } else if (['pdf', 'document'].includes(lesson.type) && lesson.fileAsset) {
    content = <DocumentViewer fileAsset={lesson.fileAsset} title={lesson.title} />;
  } else if (lesson.type === 'text') {
    content = lesson.content
      ? <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed text-surface-700 dark:text-surface-200">{lesson.content}</div>
      : <EmptyState title={t('cur.previewEmpty')} />;
  } else if (lesson.type === 'quiz' && lesson.quiz) {
    const quiz = quizzes.find((item) => item._id === (lesson.quiz._id || lesson.quiz)) || lesson.quiz;
    content = (
      <div className="space-y-3 text-sm text-surface-600 dark:text-surface-300">
        <p dir="auto" className="font-semibold text-surface-900 dark:text-white">{quiz.title}</p>
        {quiz.description && <p dir="auto" className="whitespace-pre-wrap break-words">{quiz.description}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{quiz.timeLimitMinutes ? t('qz.minutes', { n: quiz.timeLimitMinutes }) : t('qz.untimed')}</span>
          <span>{t('qz.pass', { n: quiz.passingScore })}</span>
          <span>{t('qz.attemptsAllowed', { n: quiz.maxAttempts || '∞' })}</span>
        </div>
        {onOpenTab && <Button variant="outline" onClick={() => onOpenTab('quizzes')}>{t('cur.openQuizzes')}</Button>}
      </div>
    );
  } else if (lesson.type === 'assignment' && lesson.assignment) {
    const assignment = assignments.find((item) => item._id === (lesson.assignment._id || lesson.assignment)) || lesson.assignment;
    content = (
      <div className="space-y-3 text-sm text-surface-600 dark:text-surface-300">
        <p dir="auto" className="font-semibold text-surface-900 dark:text-white">{assignment.title}</p>
        {assignment.instructions && <p dir="auto" className="whitespace-pre-wrap break-words">{assignment.instructions}</p>}
        <p>{assignment.dueAt ? t('asg.due', { date: new Date(assignment.dueAt).toLocaleString() }) : t('asg.noDueDate')}</p>
        <p>{t('cur.assignmentPoints', { n: assignment.maxPoints })}</p>
        {assignment.attachment && <DownloadButton fileId={assignment.attachment._id || assignment.attachment}
          filename={assignment.attachment.originalName || 'attachment'}>
          {t('player.downloadAttachment')}
        </DownloadButton>}
        {onOpenTab && <Button variant="outline" onClick={() => onOpenTab('assignments')}>{t('cur.openAssignments')}</Button>}
      </div>
    );
  } else {
    content = <EmptyState title={t('cur.previewEmpty')} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge>{t(`cur.type.${lesson.type}`)}</Badge>
        {!lesson.isPublished && <Badge color="amber">{t('cur.draft')}</Badge>}
        {lesson.isFree && <Badge color="green">{t('cur.free')}</Badge>}
      </div>
      {content}
      <p className="text-xs text-surface-400">{t('cur.staffPreview')}</p>
    </div>
  );
}
