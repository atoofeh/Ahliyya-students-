import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  PlayCircle, FileText, HelpCircle, ClipboardList, AlignLeft, CheckCircle2,
  Circle, Bookmark, ChevronDown, Megaphone, MessageSquareText, Send, Star, Lock,
} from 'lucide-react';
import api, { API_BASE, apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import VideoPlayer from '../../components/VideoPlayer';
import { Card, Button, Spinner, Badge, ProgressBar, Tabs, EmptyState, Textarea, Input, Modal } from '../../components/ui';

const LESSON_ICONS = {
  video: PlayCircle, pdf: FileText, document: FileText, quiz: HelpCircle,
  assignment: ClipboardList, text: AlignLeft,
};

export default function CoursePlayer() {
  const { courseId } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [lesson, setLesson] = useState(null); // full lesson doc
  const [tab, setTab] = useState('content');
  const [quizzes, setQuizzes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [threads, setThreads] = useState([]);
  const [qaForm, setQaForm] = useState({ title: '', body: '' });
  const [reply, setReply] = useState({});
  const [bookmarkModal, setBookmarkModal] = useState(false);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [openSections, setOpenSections] = useState({});
  const [submitModal, setSubmitModal] = useState(null); // assignment being submitted
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get(`/courses/${courseId}`);
    setDetail(data);
    const open = {};
    data.curriculum.forEach((s) => { open[s._id] = true; });
    setOpenSections(open);
    return data;
  }, [courseId]);

  useEffect(() => {
    load().then((data) => {
      const lessonId = params.get('lesson');
      const all = data.curriculum.flatMap((s) => s.lessons);
      const target = (lessonId && all.find((l) => l._id === lessonId)) || all.find((l) => !l.progress?.completed) || all[0];
      if (target) openLesson(target._id);
    }).catch((err) => toast.error(apiError(err)));
    api.get(`/quizzes/courses/${courseId}`).then(({ data }) => setQuizzes(data)).catch(() => {});
    api.get(`/assignments/courses/${courseId}`).then(({ data }) => setAssignments(data)).catch(() => {});
    api.get(`/announcements/courses/${courseId}`).then(({ data }) => setAnnouncements(data.items)).catch(() => {});
    loadQA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadQA = () => api.get(`/qa/courses/${courseId}`).then(({ data }) => setThreads(data.items)).catch(() => {});

  const openLesson = async (lessonId) => {
    try {
      const { data } = await api.get(`/courses/${courseId}/lessons/${lessonId}`);
      setLesson(data);
      setTab('content');
      setParams({ lesson: lessonId }, { replace: true });
    } catch (err) { toast.error(apiError(err)); }
  };

  const markComplete = async () => {
    try {
      await api.post(`/enrollments/courses/${courseId}/lessons/${lesson._id}/complete`);
      toast.success('Lesson completed!');
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
      toast.success('Question posted');
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

  if (!detail) return <Spinner full />;
  const { course, curriculum, enrollment } = detail;
  const totalLessons = curriculum.reduce((s, sec) => s + sec.lessons.length, 0);

  const renderLessonBody = () => {
    if (!lesson) return <Card><EmptyState title="Select a lesson to begin" /></Card>;
    return (
      <div className="space-y-4">
        {lesson.type === 'video' && lesson.video && (
          lesson.video.status === 'ready'
            ? <VideoPlayer videoId={lesson.video._id} lessonId={lesson._id}
                startAt={curriculum.flatMap((s) => s.lessons).find((l) => l._id === lesson._id)?.progress?.positionSeconds || 0}
                onProgress={() => {}} />
            : <Card className="p-6 text-center text-sm text-surface-500">Video is still processing — check back shortly.</Card>
        )}
        {(lesson.type === 'pdf' || lesson.type === 'document') && lesson.fileAsset && (
          <Card className="overflow-hidden">
            {lesson.fileAsset.mimeType === 'application/pdf' ? (
              <iframe
                title={lesson.title}
                src={`${API_BASE}/files/${lesson.fileAsset._id}/content#toolbar=0`}
                className="h-[75vh] w-full"
              />
            ) : (
              <div className="p-6 text-center">
                <FileText size={36} className="mx-auto mb-2 text-surface-400" />
                <p className="mb-3 text-sm text-surface-500">{lesson.fileAsset.originalName}</p>
                <a href={`${API_BASE}/files/${lesson.fileAsset._id}/content?download=1`} target="_blank" rel="noreferrer">
                  <Button variant="outline">Open document</Button>
                </a>
              </div>
            )}
          </Card>
        )}
        {lesson.type === 'text' && (
          <Card className="prose prose-sm dark:prose-invert max-w-none p-6 whitespace-pre-wrap text-surface-700 dark:text-surface-200">
            {lesson.content}
          </Card>
        )}
        {lesson.type === 'quiz' && lesson.quiz && (
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-surface-900 dark:text-white">{lesson.quiz.title}</h3>
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
            <h3 className="font-semibold text-surface-900 dark:text-white">{lesson.assignment.title}</h3>
            <p className="mt-1 text-sm text-surface-500">
              {lesson.assignment.dueAt ? `Due ${new Date(lesson.assignment.dueAt).toLocaleString()}` : 'No due date'} · {lesson.assignment.maxPoints} points
            </p>
            <Button className="mt-3" onClick={() => setTab('assignments')}>View in assignments</Button>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setBookmarkModal(true)}><Bookmark size={15} /> Bookmark</Button>
          {lesson.type !== 'quiz' && (
            <Button size="sm" onClick={markComplete}><CheckCircle2 size={15} /> Mark as complete</Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">{course.title}</h1>
          <p className="text-sm text-surface-500">By {course.teacher?.name} · {course.category}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleFavorite} title="Toggle favorite">
            <Star size={20} className={enrollment?.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-surface-300'} />
          </button>
          <div className="w-40">
            <ProgressBar value={enrollment?.progressPercent || 0} />
            <p className="mt-1 text-right text-xs text-surface-400">{enrollment?.progressPercent || 0}% of {totalLessons} lessons</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Tabs active={tab} onChange={setTab} tabs={[
            { key: 'content', label: 'Lesson' },
            { key: 'quizzes', label: `Quizzes (${quizzes.length})` },
            { key: 'assignments', label: `Assignments (${assignments.length})` },
            { key: 'announcements', label: 'Announcements' },
            { key: 'qa', label: 'Q&A' },
          ]} />
          <div className="mt-4">
            {tab === 'content' && renderLessonBody()}

            {tab === 'quizzes' && (
              <div className="space-y-3">
                {quizzes.length === 0 ? <Card><EmptyState title="No quizzes yet" /></Card> : quizzes.map((q) => {
                  const best = q.myAttempts?.filter((a) => a.percent != null).sort((a, b) => b.percent - a.percent)[0];
                  const used = q.myAttempts?.filter((a) => a.status !== 'in_progress').length || 0;
                  const exhausted = q.maxAttempts > 0 && used >= q.maxAttempts;
                  return (
                    <Card key={q._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-surface-900 dark:text-white">{q.title}</p>
                        <p className="text-xs text-surface-400">
                          {q.timeLimitMinutes ? `${q.timeLimitMinutes} min · ` : ''}Pass {q.passingScore}% ·
                          Attempts {used}/{q.maxAttempts || '∞'}
                          {q.availableUntil && ` · closes ${new Date(q.availableUntil).toLocaleString()}`}
                        </p>
                        {best && (
                          <p className="mt-1 text-xs">
                            Best: <Badge color={best.passed ? 'green' : 'red'}>{best.percent}%</Badge>
                          </p>
                        )}
                      </div>
                      {q.isLocked ? <Badge color="red"><Lock size={12} className="mr-1" /> Locked</Badge>
                        : exhausted ? <Badge color="amber">No attempts left</Badge>
                        : <Button size="sm" onClick={() => navigate(`/student/courses/${courseId}/quiz/${q._id}`)}>
                            {used > 0 ? 'Retake' : 'Start'}
                          </Button>}
                    </Card>
                  );
                })}
              </div>
            )}

            {tab === 'assignments' && (
              <div className="space-y-3">
                {assignments.length === 0 ? <Card><EmptyState title="No assignments" /></Card> : assignments.map((a) => (
                  <Card key={a._id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-surface-900 dark:text-white">{a.title}</p>
                        <p className="text-xs text-surface-400">
                          {a.dueAt ? `Due ${new Date(a.dueAt).toLocaleString()}` : 'No due date'} · {a.maxPoints} pts
                        </p>
                        {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">{a.instructions}</p>}
                        {a.attachment && (
                          <a className="mt-1 inline-block text-xs text-primary-600 hover:underline"
                            href={`${API_BASE}/files/${a.attachment._id || a.attachment}/content?download=1`} target="_blank" rel="noreferrer">
                            Download attachment
                          </a>
                        )}
                      </div>
                      <div className="text-right">
                        {a.mySubmission ? (
                          a.mySubmission.status === 'graded'
                            ? <Badge color="green">{a.mySubmission.pointsAwarded}/{a.maxPoints} pts</Badge>
                            : <Badge color="blue">Submitted{a.mySubmission.isLate ? ' (late)' : ''}</Badge>
                        ) : (
                          <Button size="sm" onClick={() => setSubmitModal(a)}>Submit</Button>
                        )}
                        {a.mySubmission?.feedback && (
                          <p className="mt-1 max-w-[200px] text-xs text-surface-400">“{a.mySubmission.feedback}”</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === 'announcements' && (
              <div className="space-y-3">
                {announcements.length === 0 ? <Card><EmptyState icon={<Megaphone size={26} />} title="No announcements" /></Card>
                  : announcements.map((an) => (
                    <Card key={an._id} className="p-4">
                      <div className="flex items-center gap-2">
                        {an.pinned && <Badge color="amber">Pinned</Badge>}
                        <p className="font-medium text-surface-900 dark:text-white">{an.title}</p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">{an.body}</p>
                      <p className="mt-2 text-xs text-surface-400">{an.author?.name} · {new Date(an.publishedAt).toLocaleString()}</p>
                    </Card>
                  ))}
              </div>
            )}

            {tab === 'qa' && (
              <div className="space-y-4">
                <Card className="space-y-3 p-4">
                  <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Ask a question</p>
                  <Input placeholder="Question title" value={qaForm.title} onChange={(e) => setQaForm((f) => ({ ...f, title: e.target.value }))} />
                  <Textarea placeholder="Describe your question..." value={qaForm.body} onChange={(e) => setQaForm((f) => ({ ...f, body: e.target.value }))} />
                  <Button size="sm" onClick={askQuestion}><Send size={14} /> Post question</Button>
                </Card>
                {threads.map((t) => (
                  <Card key={t._id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-surface-900 dark:text-white">{t.title}</p>
                      {t.resolved && <Badge color="green">Resolved</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">{t.body}</p>
                    <p className="mt-1 text-xs text-surface-400">{t.author?.name} · {new Date(t.createdAt).toLocaleString()}</p>
                    {t.replies.map((r) => (
                      <div key={r._id} className="mt-2 rounded-lg bg-surface-50 dark:bg-surface-700/40 p-3">
                        <p className="text-sm text-surface-700 dark:text-surface-200">{r.body}</p>
                        <p className="mt-1 text-xs text-surface-400">
                          {r.author?.name} {r.author?.role !== 'student' && <Badge color="primary" className="ml-1">{r.author?.role}</Badge>}
                        </p>
                      </div>
                    ))}
                    <div className="mt-2 flex gap-2">
                      <Input placeholder="Reply..." value={reply[t._id] || ''} onChange={(e) => setReply((r) => ({ ...r, [t._id]: e.target.value }))} />
                      <Button size="sm" variant="outline" onClick={() => sendReply(t._id)}><MessageSquareText size={14} /></Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Curriculum sidebar */}
        <Card className="h-fit max-h-[80vh] overflow-y-auto">
          <div className="border-b border-surface-200 dark:border-surface-700 px-4 py-3">
            <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Course content</p>
          </div>
          {curriculum.map((section) => (
            <div key={section._id} className="border-b border-surface-100 dark:border-surface-700/50 last:border-0">
              <button onClick={() => setOpenSections((o) => ({ ...o, [section._id]: !o[section._id] }))}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/40">
                {section.title}
                <ChevronDown size={15} className={`transition-transform ${openSections[section._id] ? 'rotate-180' : ''}`} />
              </button>
              {openSections[section._id] && section.lessons.map((l) => {
                const Icon = LESSON_ICONS[l.type] || AlignLeft;
                const active = lesson?._id === l._id;
                return (
                  <button key={l._id} onClick={() => openLesson(l._id)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                        : 'text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/40'}`}>
                    {l.progress?.completed
                      ? <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                      : <Circle size={15} className="shrink-0 text-surface-300" />}
                    <Icon size={15} className="shrink-0 text-surface-400" />
                    <span className="flex-1 truncate">{l.title}</span>
                    {l.durationMinutes > 0 && <span className="text-[11px] text-surface-400">{l.durationMinutes}m</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </Card>
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
              className="text-sm text-surface-500" />
          </div>
          <Button className="w-full" loading={busy} onClick={submitAssignment}>Submit assignment</Button>
        </div>
      </Modal>
    </div>
  );
}
