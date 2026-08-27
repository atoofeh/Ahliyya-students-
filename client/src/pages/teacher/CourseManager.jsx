import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, Spinner, Badge, Tabs, Toggle, Input, Textarea, Select, ConfirmButton } from '../../components/ui';
import CurriculumTab from './tabs/CurriculumTab';
import VideosTab from './tabs/VideosTab';
import QuestionBankTab from './tabs/QuestionBankTab';
import QuizzesTab from './tabs/QuizzesTab';
import StudentsTab from './tabs/StudentsTab';
import AssignmentsTab from './tabs/AssignmentsTab';
import InsightsTab from './tabs/InsightsTab';

const TABS = [
  { key: 'curriculum', label: 'Curriculum' },
  { key: 'videos', label: 'Videos' },
  { key: 'questions', label: 'Question bank' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'students', label: 'Students & codes' },
  { key: 'insights', label: 'Insights' },
  { key: 'settings', label: 'Settings' },
];

export default function CourseManager() {
  const { courseId, tab = 'curriculum' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get(`/courses/${courseId}`);
    setDetail(data);
    const c = data.course;
    setSettings({
      title: c.title, description: c.description || '', category: c.category || 'General',
      difficulty: c.difficulty, language: c.language, visibility: c.visibility,
      isPublished: c.isPublished, certificateEnabled: c.certificateEnabled,
      completionThreshold: c.completionThreshold, enrollmentLimit: c.enrollmentLimit || 0,
      price: c.price || 0,
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
    });
    return data;
  }, [courseId]);

  useEffect(() => {
    const t = setTimeout(() => load().catch((err) => toast.error(apiError(err))), 0);
    return () => clearTimeout(t);
  }, [load, toast]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.put(`/courses/${courseId}`, {
        ...settings,
        enrollmentLimit: Number(settings.enrollmentLimit) || 0,
        price: Number(settings.price) || 0,
        completionThreshold: Number(settings.completionThreshold) || 80,
        expiresAt: settings.expiresAt ? new Date(settings.expiresAt) : null,
      });
      toast.success('Course updated');
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const deleteCourse = async () => {
    try {
      await api.delete(`/courses/${courseId}`);
      toast.success('Course deleted');
      navigate('/teacher/courses');
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!detail || !settings) return <Spinner full />;
  const { course, curriculum } = detail;
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/teacher/courses')} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
        <ArrowLeft size={15} /> All courses
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">{course.title}</h1>
          <p className="text-sm text-surface-500">
            {course.enrollmentCount} students · {course.lessonCount} lessons · {course.quizCount} quizzes
          </p>
        </div>
        <Badge color={course.isPublished ? 'green' : 'gray'}>{course.isPublished ? 'Published' : 'Draft'}</Badge>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={(t) => navigate(`/teacher/courses/${courseId}/${t}`)} />

      <div className="pt-1">
        {tab === 'curriculum' && <CurriculumTab courseId={courseId} curriculum={curriculum} reload={load} />}
        {tab === 'videos' && <VideosTab courseId={courseId} />}
        {tab === 'questions' && <QuestionBankTab courseId={courseId} />}
        {tab === 'quizzes' && <QuizzesTab courseId={courseId} />}
        {tab === 'assignments' && <AssignmentsTab courseId={courseId} />}
        {tab === 'students' && <StudentsTab courseId={courseId} />}
        {tab === 'insights' && <InsightsTab courseId={courseId} />}

        {tab === 'settings' && (
          <Card className="max-w-2xl space-y-4 p-5">
            <Input label="Title" value={settings.title} onChange={set('title')} />
            <Textarea label="Description" value={settings.description} onChange={set('description')} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Category" value={settings.category} onChange={set('category')} />
              <Select label="Difficulty" value={settings.difficulty} onChange={set('difficulty')}
                options={['beginner', 'intermediate', 'advanced', 'expert'].map((d) => ({ value: d, label: d }))} />
              <Input label="Language" value={settings.language} onChange={set('language')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Visibility" value={settings.visibility} onChange={set('visibility')}
                options={[{ value: 'private', label: 'Private' }, { value: 'public', label: 'Public' }, { value: 'hidden', label: 'Hidden' }]} />
              <Input label="Enrollment limit (0 = unlimited)" type="number" min="0" value={settings.enrollmentLimit} onChange={set('enrollmentLimit')} />
              <Input label="Course end date" type="date" value={settings.expiresAt} onChange={set('expiresAt')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Price (future payments)" type="number" min="0" value={settings.price} onChange={set('price')} />
              <Input label="Certificate threshold %" type="number" min="0" max="100" value={settings.completionThreshold} onChange={set('completionThreshold')} />
            </div>
            <Toggle label="Published" hint="Students can only see published courses"
              checked={settings.isPublished} onChange={(v) => setSettings((s) => ({ ...s, isPublished: v }))} />
            <Toggle label="Completion certificates" hint="Issue certificates when students reach the threshold"
              checked={settings.certificateEnabled} onChange={(v) => setSettings((s) => ({ ...s, certificateEnabled: v }))} />
            <div className="flex items-center justify-between border-t border-surface-200 dark:border-surface-700 pt-4">
              <ConfirmButton onConfirm={deleteCourse} message="Delete this course? Students lose access immediately.">
                <Trash2 size={14} /> Delete course
              </ConfirmButton>
              <Button loading={busy} onClick={saveSettings}>Save changes</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
