import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, FileText, AlignLeft, HelpCircle, ClipboardList, Lock, KeyRound, Unlock } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import VideoPlayer from '../../components/VideoPlayer';
import DocumentViewer from '../../components/DocumentViewer';
import CourseCover from '../../components/CourseCover';
import { Card, Button, Badge, EmptyState } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import ErrorState from '../../components/ErrorState';

const LESSON_ICONS = {
  video: PlayCircle, pdf: FileText, document: FileText, quiz: HelpCircle,
  assignment: ClipboardList, text: AlignLeft,
};

/**
 * A listed course as seen by someone who is not enrolled: the description, and
 * the lessons its teacher marked free. Everything else is behind an access code.
 */
export default function CoursePreview() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [lessonError, setLessonError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/courses/${courseId}/preview`);
      setError(null);
      setData(res.data);
      return res.data;
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
      return null;
    }
  }, [courseId]);

  const openLesson = useCallback(async (lessonId) => {
    setLessonError(null);
    try {
      const { data: full } = await api.get(`/courses/${courseId}/lessons/${lessonId}`);
      setLesson(full);
    } catch (err) { setLessonError(apiError(err)); }
  }, [courseId]);

  useEffect(() => {
    const t = setTimeout(() => {
      load().then((d) => { if (d?.freeLessons?.length) openLesson(d.freeLessons[0]._id); });
    }, 0);
    return () => clearTimeout(t);
  }, [load, openLesson]);

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!data) return <SkeletonCard lines={5} />;

  const { course, freeLessons, lessonCount, enrolled } = data;
  const lockedCount = Math.max(lessonCount - freeLessons.length, 0);

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/student/catalog')} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
        <ArrowLeft size={15} /> Back to the catalog
      </button>

      <Card className="overflow-hidden">
        <CourseCover title={course.title} category={course.category} className="h-32" />
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-surface-900 dark:text-white">{course.title}</h1>
              <p className="mt-0.5 text-sm text-surface-500">
                By {course.teacher?.name} · {lessonCount} lessons
                {course.durationMinutes > 0 && ` · ${Math.round(course.durationMinutes / 6) / 10}h`}
              </p>
            </div>
            {enrolled
              ? <Button onClick={() => navigate(`/student/courses/${courseId}`)}>Open the full course</Button>
              : <Badge color="amber"><KeyRound size={12} className="mr-1" /> Access code needed</Badge>}
          </div>
          {course.description && (
            <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-surface-600 dark:text-surface-300">{course.description}</p>
          )}
        </div>
      </Card>

      {freeLessons.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Lock size={26} />}
            title="No free lessons in this course"
            subtitle="Ask the teacher for an access code to enrol and see the whole course."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            {lessonError && <ErrorState message={lessonError} onRetry={() => lesson && openLesson(lesson._id)} />}
            {lesson?.type === 'video' && lesson.video && (
              lesson.video.status === 'ready'
                ? <VideoPlayer key={lesson.video._id} videoId={lesson.video._id} lessonId={lesson._id} startAt={0} onProgress={() => {}} />
                : <Card className="p-6 text-center text-sm text-surface-500">This video is still processing — check back shortly.</Card>
            )}
            {(lesson?.type === 'pdf' || lesson?.type === 'document') && lesson.fileAsset && (
              <DocumentViewer fileAsset={lesson.fileAsset} title={lesson.title} />
            )}
            {lesson?.type === 'text' && (
              <Card className="max-w-none whitespace-pre-wrap p-6 text-[15px] leading-relaxed text-surface-700 dark:text-surface-200">
                {lesson.content}
              </Card>
            )}
            {lesson && !['video', 'pdf', 'document', 'text'].includes(lesson.type) && (
              <Card className="p-6 text-sm text-surface-500">
                {lesson.title} is part of the enrolled course — enrol with an access code to take it.
              </Card>
            )}
          </div>

          <div className="space-y-3">
            <Card>
              <div className="border-b border-surface-200 px-4 py-3 dark:border-surface-700">
                <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Free lessons</p>
                <p className="text-xs text-surface-400">Watch these without enrolling.</p>
              </div>
              {freeLessons.map((l) => {
                const Icon = LESSON_ICONS[l.type] || AlignLeft;
                const active = lesson?._id === l._id;
                return (
                  <button
                    key={l._id}
                    onClick={() => openLesson(l._id)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                      active
                        ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300'
                        : 'text-surface-600 hover:bg-surface-50 dark:text-surface-300 dark:hover:bg-surface-700/40'
                    }`}
                  >
                    <Unlock size={14} className="shrink-0 text-emerald-500" />
                    <Icon size={15} className="shrink-0 text-surface-400" />
                    <span className="flex-1 truncate">{l.title}</span>
                    {l.durationMinutes > 0 && <span className="text-[11px] text-surface-400">{l.durationMinutes}m</span>}
                  </button>
                );
              })}
            </Card>

            {lockedCount > 0 && !enrolled && (
              <Card className="p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-surface-800 dark:text-surface-100">
                  <Lock size={15} className="text-surface-400" /> {lockedCount} more {lockedCount === 1 ? 'lesson' : 'lessons'}
                </p>
                <p className="mt-1 text-sm text-surface-500">
                  Quizzes, assignments and the rest of the course open once you enrol.
                </p>
                <Button className="mt-3 w-full" variant="outline" onClick={() => navigate('/student?redeem=1')}>
                  <KeyRound size={15} /> I have an access code
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
