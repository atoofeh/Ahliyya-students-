import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  PlayCircle, FileText, HelpCircle, ClipboardList, AlignLeft, CheckCircle2, CircleDot,
  Circle, AlarmClock, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Megaphone,
  MessageSquareText, Send, Star, Lock, ListTree, X,
} from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import VideoPlayer from '../../components/VideoPlayer';
import { Card, Button, Badge, ProgressBar, EmptyState, Textarea, Input, Modal, Skeleton } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import ErrorState from '../../components/ErrorState';
import DocumentViewer from '../../components/DocumentViewer';
import DownloadButton from '../../components/DownloadButton';
import { pushBackHandler } from '../../app/shell';

const LESSON_ICONS = {
  video: PlayCircle, pdf: FileText, document: FileText, quiz: HelpCircle,
  assignment: ClipboardList, text: AlignLeft,
};

/** complete → current → overdue → available. Students never receive unpublished lessons. */
const STATE_ICON = {
  complete: { Icon: CheckCircle2, className: 'text-emerald-500', label: 'Completed' },
  current: { Icon: CircleDot, className: 'text-brand-500', label: 'Current lesson' },
  overdue: { Icon: AlarmClock, className: 'text-amber-500', label: 'Overdue' },
  available: { Icon: Circle, className: 'text-surface-300 dark:text-surface-600', label: 'Not started' },
};

export default function CoursePlayer() {
  const { courseId } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [lesson, setLesson] = useState(null); // full lesson doc
  const [quizzes, setQuizzes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [threads, setThreads] = useState([]);
  const [section, setSection] = useState(null); // which course section is expanded below the lesson
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qaForm, setQaForm] = useState({ title: '', body: '' });
  const [reply, setReply] = useState({});
  const [bookmarkModal, setBookmarkModal] = useState(false);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [openSections, setOpenSections] = useState({});
  const [submitModal, setSubmitModal] = useState(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadQA = useCallback(
    () => api.get(`/qa/courses/${courseId}`).then(({ data }) => setThreads(data.items)).catch(() => {}),
    [courseId]
  );

  const load = useCallback(async () => {
    const { data } = await api.get(`/courses/${courseId}`);
    setError(null);
    setDetail(data);
    setOpenSections(Object.fromEntries(data.curriculum.map((s) => [s._id, true])));
    return data;
  }, [courseId]);

  // The curriculum sheet is a layer: Android back should close it, not leave the course.
  useEffect(() => (sheetOpen ? pushBackHandler(() => setSheetOpen(false)) : undefined), [sheetOpen]);

  const openLesson = useCallback(async (lessonId) => {
    try {
      const { data } = await api.get(`/courses/${courseId}/lessons/${lessonId}`);
      setLesson(data);
      setSheetOpen(false);
      setParams({ lesson: lessonId }, { replace: true });
    } catch (err) { toast.error(apiError(err)); }
  }, [courseId, setParams, toast]);

  useEffect(() => {
    const t = setTimeout(() => {
      load()
        .then((data) => {
          const lessonId = params.get('lesson');
          const all = data.curriculum.flatMap((s) => s.lessons);
          const target = (lessonId && all.find((l) => l._id === lessonId))
            || all.find((l) => !l.progress?.completed) || all[0];
          if (target) openLesson(target._id);
        })
        .catch((err) => setError({ code: err.response?.data?.code, message: apiError(err) }));
      api.get(`/quizzes/courses/${courseId}`).then(({ data }) => setQuizzes(data)).catch(() => {});
      api.get(`/assignments/courses/${courseId}`).then(({ data }) => setAssignments(data)).catch(() => {});
      api.get(`/announcements/courses/${courseId}`).then(({ data }) => setAnnouncements(data.items)).catch(() => {});
      loadQA();
    }, 0);
    return () => clearTimeout(t);
    // params is read once for the deep link; re-running on every search change would fight openLesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, load, openLesson, loadQA]);

  const markComplete = async () => {
    try {
      await api.post(`/enrollments/courses/${courseId}/lessons/${lesson._id}/complete`);
      toast.success('Lesson completed');
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const addBookmark = async () => {
    try {
      await api.post('/bookmarks', { lesson: lesson._id, note: bookmarkNote });
      toast.success('Bookmarked');
      setBookmarkModal(false); setBookmarkNote('');
    } catch (err) { toast.error(apiError(err)); }
  };

  const askQuestion = async () => {
    if (!qaForm.title.trim() || !qaForm.body.trim()) return;
    try {
      await api.post(`/qa/courses/${courseId}`, { ...qaForm, lesson: lesson?._id || null });
      setQaForm({ title: '', body: '' });
      toast.success('Question sent — your teacher reviews it before the class sees it');
      loadQA();
    } catch (err) { toast.error(apiError(err)); }
  };

  const sendReply = async (threadId) => {
    const body = reply[threadId]?.trim();
    if (!body) return;
    try {
      await api.post(`/qa/${threadId}/replies`, { body });
      setReply((r) => ({ ...r, [threadId]: '' }));
      loadQA();
    } catch (err) { toast.error(apiError(err)); }
  };

  const submitAssignment = async () => {
    setBusy(true);
    try {
      let attachmentId = null;
      if (submissionFile) {
        const form = new FormData();
        form.append('file', submissionFile);
        const { data } = await api.post('/files/submissions', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        attachmentId = data._id;
      }
      await api.post(`/assignments/courses/${courseId}/${submitModal._id}/submit`, {
        text: submissionText, attachment: attachmentId,
      });
      toast.success('Assignment submitted');
      setSubmitModal(null); setSubmissionText(''); setSubmissionFile(null);
      const { data } = await api.get(`/assignments/courses/${courseId}`);
      setAssignments(data);
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const toggleFavorite = async () => {
    await api.post(`/enrollments/courses/${courseId}/favorite`).catch(() => {});
    load();
  };

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-72" />
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4"><Skeleton className="aspect-video rounded-xl" /><SkeletonCard /></div>
          <SkeletonCard lines={8} />
        </div>
      </div>
    );
  }

  const { course, curriculum, enrollment } = detail;
  const flatLessons = curriculum.flatMap((s) => s.lessons);
  const totalLessons = flatLessons.length;
  const idx = flatLessons.findIndex((l) => l._id === lesson?._id);
  const prevLesson = idx > 0 ? flatLessons[idx - 1] : null;
  const nextLesson = idx >= 0 && idx < flatLessons.length - 1 ? flatLessons[idx + 1] : null;
  const currentSection = curriculum.find((s) => s.lessons.some((l) => l._id === lesson?._id));
  const goRelative = (delta) => {
    const target = delta < 0 ? prevLesson : nextLesson;
    if (target) openLesson(target._id);
  };

  // A lesson counts as overdue when its linked quiz/assignment closed and it is not complete.
  const past = (d) => d && new Date(d) < new Date();
  const overdueIds = new Set([
    ...quizzes.filter((q) => past(q.availableUntil) && !q.myAttempts?.some((a) => a.status !== 'in_progress')).map((q) => q._id),
    ...assignments.filter((a) => past(a.dueAt) && !a.mySubmission).map((a) => a._id),
  ]);
  const lessonState = (l) => {
    if (l.progress?.completed) return 'complete';
    if (l._id === lesson?._id) return 'current';
    if ((l.quiz && overdueIds.has(l.quiz)) || (l.assignment && overdueIds.has(l.assignment))) return 'overdue';
    return 'available';
  };

  const renderLessonBody = () => {
    if (!lesson) return <Card><EmptyState title="Select a lesson to begin" subtitle="Open the course contents and pick where to start." /></Card>;
    return (
      <div className="space-y-4">
        {lesson.type === 'video' && lesson.video && (
          lesson.video.status === 'ready'
            ? <VideoPlayer key={lesson.video._id} videoId={lesson.video._id} lessonId={lesson._id}
                startAt={flatLessons.find((l) => l._id === lesson._id)?.progress?.positionSeconds || 0}
                onProgress={() => {}} />
            : <Card className="p-6 text-center text-sm text-surface-500">This video is still processing — check back shortly.</Card>
        )}
        {(lesson.type === 'pdf' || lesson.type === 'document') && lesson.fileAsset && (
          <DocumentViewer fileAsset={lesson.fileAsset} title={lesson.title} />
        )}
        {lesson.type === 'text' && (
          <Card className="max-w-none whitespace-pre-wrap p-6 text-[15px] leading-relaxed text-surface-700 dark:text-surface-200">
            {lesson.content}
          </Card>
        )}
        {lesson.type === 'quiz' && lesson.quiz && (
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-surface-900 dark:text-white">{lesson.quiz.title}</h3>
                <p className="mt-1 text-sm text-surface-500">
                  {lesson.quiz.timeLimitMinutes ? `${lesson.quiz.timeLimitMinutes} min · ` : ''}
                  Pass mark {lesson.quiz.passingScore}% · {lesson.quiz.maxAttempts || '∞'} attempt(s)
                </p>
              </div>
              {lesson.quiz.isLocked
                ? <Badge color="red"><Lock size={12} className="mr-1" /> Locked</Badge>
                : <Button onClick={() => navigate(`/student/courses/${courseId}/quiz/${lesson.quiz._id}`)}>Start quiz</Button>}
            </div>
          </Card>
        )}
        {lesson.type === 'assignment' && lesson.assignment && (
          <Card className="p-6">
            <h3 className="font-display font-bold text-surface-900 dark:text-white">{lesson.assignment.title}</h3>
            <p className="mt-1 text-sm text-surface-500">
              {lesson.assignment.dueAt ? `Due ${new Date(lesson.assignment.dueAt).toLocaleString()}` : 'No due date'} · {lesson.assignment.maxPoints} points
            </p>
            <Button className="mt-3" variant="outline" onClick={() => { setSection('assignments'); document.getElementById('course-sections')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Open in assignments
            </Button>
          </Card>
        )}

        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          <Button variant="outline" size="sm" onClick={() => setBookmarkModal(true)}><Bookmark size={15} /> Bookmark</Button>
          {lesson.type !== 'quiz' && (
            <Button size="sm" onClick={markComplete}><CheckCircle2 size={15} /> Mark as complete</Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => goRelative(-1)} disabled={!prevLesson}><ChevronLeft size={16} /> Previous</Button>
            <Button size="sm" variant="ghost" onClick={() => goRelative(1)} disabled={!nextLesson}>Next <ChevronRight size={16} /></Button>
          </div>
        </div>
      </div>
    );
  };

  const renderQuizzes = () => (
    <div className="space-y-3">
      {quizzes.length === 0 ? <EmptyState title="No quizzes yet" subtitle="Quizzes your instructor publishes appear here." /> : quizzes.map((q) => {
        const best = q.myAttempts?.filter((a) => a.percent != null).sort((a, b) => b.percent - a.percent)[0];
        const used = q.myAttempts?.filter((a) => a.status !== 'in_progress').length || 0;
        const exhausted = q.maxAttempts > 0 && used >= q.maxAttempts;
        return (
          <div key={q._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 p-3.5 dark:border-surface-700/60">
            <div className="min-w-0">
              <p className="font-medium text-surface-900 dark:text-white">{q.title}</p>
              <p className="text-xs text-surface-400">
                {q.timeLimitMinutes ? `${q.timeLimitMinutes} min · ` : ''}Pass {q.passingScore}% · Attempts {used}/{q.maxAttempts || '∞'}
                {q.availableUntil && ` · closes ${new Date(q.availableUntil).toLocaleString()}`}
              </p>
              {best && <p className="mt-1 text-xs">Best: <Badge color={best.passed ? 'green' : 'red'}>{best.percent}%</Badge></p>}
            </div>
            {q.isLocked ? <Badge color="red"><Lock size={12} className="mr-1" /> Locked</Badge>
              : exhausted ? <Badge color="amber">No attempts left</Badge>
              : <Button size="sm" onClick={() => navigate(`/student/courses/${courseId}/quiz/${q._id}`)}>{used > 0 ? 'Retake' : 'Start'}</Button>}
          </div>
        );
      })}
    </div>
  );

  const renderAssignments = () => (
    <div className="space-y-3">
      {assignments.length === 0 ? <EmptyState title="No assignments" subtitle="Work your instructor sets appears here." /> : assignments.map((a) => (
        <div key={a._id} className="rounded-xl border border-surface-200 p-3.5 dark:border-surface-700/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-surface-900 dark:text-white">{a.title}</p>
              <p className="text-xs text-surface-400">
                {a.dueAt ? `Due ${new Date(a.dueAt).toLocaleString()}` : 'No due date'} · {a.maxPoints} pts
              </p>
              {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">{a.instructions}</p>}
              {a.attachment && (
                <DownloadButton
                  className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-300"
                  fileId={a.attachment._id || a.attachment}
                  filename={a.attachment.originalName || 'attachment'}>
                  Download attachment
                </DownloadButton>
              )}
            </div>
            <div className="text-right">
              {a.mySubmission ? (
                a.mySubmission.status === 'graded'
                  ? <Badge color="green">{a.mySubmission.pointsAwarded}/{a.maxPoints} pts</Badge>
                  : <Badge color="blue">Submitted{a.mySubmission.isLate ? ' (late)' : ''}</Badge>
              ) : <Button size="sm" onClick={() => setSubmitModal(a)}>Submit</Button>}
              {a.mySubmission?.feedback && <p className="mt-1 max-w-[200px] text-xs text-surface-400">“{a.mySubmission.feedback}”</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderAnnouncements = () => (
    <div className="space-y-3">
      {announcements.length === 0 ? <EmptyState icon={<Megaphone size={24} />} title="No announcements" /> : announcements.map((an) => (
        <div key={an._id} className="rounded-xl border border-surface-200 p-3.5 dark:border-surface-700/60">
          <div className="flex items-center gap-2">
            {an.pinned && <Badge color="amber">Pinned</Badge>}
            <p className="font-medium text-surface-900 dark:text-white">{an.title}</p>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">{an.body}</p>
          <p className="mt-2 text-xs text-surface-400">{an.author?.name} · {new Date(an.publishedAt).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );

  const renderQA = () => (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-surface-200 p-3.5 dark:border-surface-700/60">
        <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Ask a question</p>
        <p className="text-xs text-surface-400">Your teacher reads it first. Once they approve it, the rest of the class can see and answer it.</p>
        <Input placeholder="Question title" value={qaForm.title} onChange={(e) => setQaForm((f) => ({ ...f, title: e.target.value }))} />
        <Textarea placeholder="Describe your question…" value={qaForm.body} onChange={(e) => setQaForm((f) => ({ ...f, body: e.target.value }))} />
        <Button size="sm" onClick={askQuestion}><Send size={14} /> Post question</Button>
      </div>
      {threads.map((t) => (
        <div key={t._id} className="rounded-xl border border-surface-200 p-3.5 dark:border-surface-700/60">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-surface-900 dark:text-white">{t.title}</p>
            <div className="flex shrink-0 gap-1.5">
              {t.status === 'pending' && <Badge color="amber">Awaiting approval</Badge>}
              {t.status === 'rejected' && <Badge color="red">Not published</Badge>}
              {t.resolved && t.status === 'approved' && <Badge color="green">Resolved</Badge>}
            </div>
          </div>
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">{t.body}</p>
          <p className="mt-1 text-xs text-surface-400">{t.author?.name} · {new Date(t.createdAt).toLocaleString()}</p>
          {t.status === 'pending' && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Only you and your teacher can see this until it is approved.
            </p>
          )}
          {t.status === 'rejected' && (
            <p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              Your teacher did not publish this question{t.rejectionReason ? `: ${t.rejectionReason}` : '.'}
            </p>
          )}
          {t.replies.map((r) => (
            <div key={r._id} className="mt-2 rounded-lg bg-surface-50 p-3 dark:bg-surface-700/40">
              <p className="text-sm text-surface-700 dark:text-surface-200">{r.body}</p>
              <p className="mt-1 text-xs text-surface-400">
                {r.author?.name} {r.author?.role !== 'student' && <Badge color="primary" className="ml-1">{r.author?.role}</Badge>}
              </p>
            </div>
          ))}
          {t.status === 'approved' && (
            <div className="mt-2 flex gap-2">
              <Input placeholder="Reply…" value={reply[t._id] || ''} onChange={(e) => setReply((r) => ({ ...r, [t._id]: e.target.value }))} />
              <Button size="sm" variant="outline" onClick={() => sendReply(t._id)} aria-label="Send reply"><MessageSquareText size={14} /></Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const SECTIONS = [
    { key: 'quizzes', label: 'Quizzes', count: quizzes.length, render: renderQuizzes },
    { key: 'assignments', label: 'Assignments', count: assignments.length, render: renderAssignments },
    { key: 'announcements', label: 'Announcements', count: announcements.length, render: renderAnnouncements },
    { key: 'qa', label: 'Q&A', count: threads.length, render: renderQA },
  ];

  const renderCurriculum = () => (
    <div>
      <div className="border-b border-surface-200 px-4 py-3 dark:border-surface-700">
        <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Course content</p>
        <p className="text-xs text-surface-400">{totalLessons} lessons · {enrollment?.progressPercent || 0}% complete</p>
      </div>
      {curriculum.map((sec) => (
        <div key={sec._id} className="border-b border-surface-100 last:border-0 dark:border-surface-700/50">
          <button onClick={() => setOpenSections((o) => ({ ...o, [sec._id]: !o[sec._id] }))}
            aria-expanded={!!openSections[sec._id]}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-700/40">
            {sec.title}
            <ChevronDown size={15} className={`transition-transform ${openSections[sec._id] ? 'rotate-180' : ''}`} />
          </button>
          {openSections[sec._id] && sec.lessons.map((l) => {
            const Icon = LESSON_ICONS[l.type] || AlignLeft;
            const state = lessonState(l);
            const { Icon: StateIcon, className: stateClass, label: stateLabel } = STATE_ICON[state];
            const active = lesson?._id === l._id;
            return (
              <button key={l._id} onClick={() => openLesson(l._id)}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                  active ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300'
                    : 'text-surface-600 hover:bg-surface-50 dark:text-surface-300 dark:hover:bg-surface-700/40'}`}>
                <StateIcon size={15} className={`shrink-0 ${stateClass}`} aria-label={stateLabel} />
                <Icon size={15} className="shrink-0 text-surface-400" />
                <span className="flex-1 truncate">{l.title}</span>
                {l.durationMinutes > 0 && <span className="text-[11px] text-surface-400">{l.durationMinutes}m</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="pb-20 lg:pb-0">
      {/* Sticky lesson bar: where you are, how far along, and the way forward. */}
      <div className="sticky top-[57px] z-10 -mx-4 mb-4 border-b border-surface-200/80 bg-surface-50/95 px-4 py-2.5 backdrop-blur dark:border-surface-800 dark:bg-surface-950/95 md:-mx-6 md:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSheetOpen(true)} aria-label="Open course content"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800 lg:hidden">
            <ListTree size={16} /> Contents
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-surface-400">
              {course.title}{currentSection && <> · {currentSection.title}</>}
            </p>
            <p className="truncate font-display text-sm font-bold text-surface-900 dark:text-white">{lesson?.title || 'Select a lesson'}</p>
          </div>
          <button onClick={toggleFavorite} aria-label={enrollment?.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            className="rounded-lg p-1.5 hover:bg-surface-100 dark:hover:bg-surface-800">
            <Star size={17} className={enrollment?.isFavorite ? 'fill-gold-400 text-gold-400' : 'text-surface-300'} />
          </button>
          <div className="hidden items-center gap-1 sm:flex">
            <Button size="sm" variant="ghost" onClick={() => goRelative(-1)} disabled={!prevLesson} aria-label="Previous lesson"><ChevronLeft size={16} /></Button>
            <Button size="sm" variant="ghost" onClick={() => goRelative(1)} disabled={!nextLesson} aria-label="Next lesson"><ChevronRight size={16} /></Button>
          </div>
        </div>
        <ProgressBar value={enrollment?.progressPercent || 0} className="mt-2 h-1" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {renderLessonBody()}

          {/* Course sections sit below the lesson — the lesson is never surrounded by chrome. */}
          <div id="course-sections" className="mt-6 space-y-3">
            {SECTIONS.map(({ key, label, count, render }) => (
              <Card key={key}>
                <button type="button" onClick={() => setSection((s) => (s === key ? null : key))}
                  aria-expanded={section === key}
                  className="flex w-full items-center justify-between px-4 py-3 text-left">
                  <span className="font-display text-sm font-bold text-surface-900 dark:text-white">
                    {label}<span className="ml-2 text-xs font-semibold text-surface-400">{count}</span>
                  </span>
                  <ChevronDown size={16} className={`text-surface-400 transition-transform ${section === key ? 'rotate-180' : ''}`} />
                </button>
                {section === key && <div className="border-t border-surface-100 p-4 dark:border-surface-700/60">{render()}</div>}
              </Card>
            ))}
          </div>
        </div>

        <Card className="hidden h-fit max-h-[80vh] overflow-y-auto lg:block">{renderCurriculum()}</Card>
      </div>

      {/* Mobile: curriculum as a bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div role="dialog" aria-label="Course content"
            className="pb-safe absolute inset-x-0 bottom-0 max-h-[75vh] animate-slide-up overflow-y-auto rounded-t-2xl bg-white shadow-float dark:bg-surface-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-surface-200 bg-white px-4 py-3 dark:border-surface-700 dark:bg-surface-900">
              <p className="font-display text-sm font-bold text-surface-900 dark:text-white">Course content</p>
              <button onClick={() => setSheetOpen(false)} aria-label="Close course content"
                className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"><X size={17} /></button>
            </div>
            {renderCurriculum()}
          </div>
        </div>
      )}

      {/* Mobile: the actions you need while studying, always in reach */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-surface-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-surface-800 dark:bg-surface-900/95 lg:hidden"
        style={{ ['--pb-safe-extra']: '0.5rem' }}>
        <Button size="sm" variant="ghost" onClick={() => goRelative(-1)} disabled={!prevLesson} aria-label="Previous lesson"><ChevronLeft size={16} /></Button>
        <Button size="sm" variant="ghost" onClick={() => setBookmarkModal(true)} aria-label="Bookmark this lesson"><Bookmark size={16} /></Button>
        {lesson && lesson.type !== 'quiz' && (
          <Button size="sm" variant="ghost" onClick={markComplete} aria-label="Mark lesson complete"><CheckCircle2 size={16} /></Button>
        )}
        <Button size="sm" variant="ghost" aria-label="Ask a question"
          onClick={() => { setSection('qa'); document.getElementById('course-sections')?.scrollIntoView({ behavior: 'smooth' }); }}>
          <MessageSquareText size={16} />
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => goRelative(1)} disabled={!nextLesson}>Next <ChevronRight size={16} /></Button>
      </div>

      <Modal open={bookmarkModal} onClose={() => setBookmarkModal(false)} title="Bookmark lesson">
        <div className="space-y-4">
          <p className="text-sm text-surface-500">{lesson?.title}</p>
          <Textarea label="Note (optional)" value={bookmarkNote} onChange={(e) => setBookmarkNote(e.target.value)} />
          <Button className="w-full" onClick={addBookmark}>Save bookmark</Button>
        </div>
      </Modal>

      <Modal open={!!submitModal} onClose={() => setSubmitModal(null)} title={`Submit: ${submitModal?.title || ''}`}>
        <div className="space-y-4">
          <Textarea label="Answer text" value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} />
          <div>
            <span className="mb-1 block text-sm font-medium text-surface-700 dark:text-surface-200">Attachment (optional)</span>
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.txt,.png,.jpg,.jpeg"
              onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
              aria-label="Attachment" className="text-sm text-surface-500" />
          </div>
          <Button className="w-full" loading={busy} onClick={submitAssignment}>Submit assignment</Button>
        </div>
      </Modal>
    </div>
  );
}
