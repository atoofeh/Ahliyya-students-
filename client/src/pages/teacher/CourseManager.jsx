import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, Badge, Tabs, Toggle, Input, Textarea, Select, ConfirmButton } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';
import CurriculumTab from './tabs/CurriculumTab';
import VideosTab from './tabs/VideosTab';
import QuestionBankTab from './tabs/QuestionBankTab';
import QuizzesTab from './tabs/QuizzesTab';
import StudentsTab from './tabs/StudentsTab';
import AssignmentsTab from './tabs/AssignmentsTab';
import InsightsTab from './tabs/InsightsTab';
import QaTab from './tabs/QaTab';
import TeachersTab from './tabs/TeachersTab';

const TAB_KEYS = ['curriculum', 'videos', 'questions', 'quizzes', 'assignments', 'students', 'teachers', 'qa', 'insights', 'settings'];

export default function CourseManager() {
  const { courseId, tab = 'curriculum' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useLanguage();
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
      toast.success(t('crs.updated'));
      load();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const deleteCourse = async () => {
    try {
      await api.delete(`/courses/${courseId}`);
      toast.success(t('crs.deleted'));
      navigate('/teacher/courses');
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!detail || !settings) return <SkeletonCard lines={5} />;
  const { course, curriculum } = detail;
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/teacher/courses')} className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
        <ArrowLeft size={15} className="rtl:rotate-180" /> {t('crs.allCourses')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 dir="auto" className="text-xl font-bold text-surface-900 dark:text-white">{course.title}</h1>
          <p className="text-sm text-surface-500">
            {t('crs.headerCounts', { students: course.enrollmentCount, lessons: course.lessonCount, quizzes: course.quizCount })}
          </p>
        </div>
        <Badge color={course.isPublished ? 'green' : 'gray'}>{t(course.isPublished ? 'ac2.publishedBadge' : 'ac2.draftBadge')}</Badge>
      </div>

      <Tabs tabs={TAB_KEYS.map((k) => ({ key: k, label: t(`tab.${k}`) }))} active={tab}
        onChange={(next) => navigate(`/teacher/courses/${courseId}/${next}`)} />

      <div className="pt-1">
        {tab === 'curriculum' && <CurriculumTab courseId={courseId} curriculum={curriculum} reload={load} />}
        {tab === 'videos' && <VideosTab courseId={courseId} />}
        {tab === 'questions' && <QuestionBankTab courseId={courseId} />}
        {tab === 'quizzes' && <QuizzesTab courseId={courseId} />}
        {tab === 'assignments' && <AssignmentsTab courseId={courseId} />}
        {tab === 'students' && <StudentsTab courseId={courseId} currency={course.currency} />}
        {tab === 'teachers' && <TeachersTab courseId={courseId} />}
        {tab === 'qa' && <QaTab courseId={courseId} />}
        {tab === 'insights' && <InsightsTab courseId={courseId} />}

        {tab === 'settings' && (
          <Card className="max-w-2xl space-y-4 p-5">
            <Input label={t('crs.title')} dir="auto" value={settings.title} onChange={set('title')} />
            <Textarea label={t('crs.description')} dir="auto" value={settings.description} onChange={set('description')} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label={t('crs.category')} dir="auto" value={settings.category} onChange={set('category')} />
              <Select label={t('crs.difficulty')} value={settings.difficulty} onChange={set('difficulty')}
                options={['beginner', 'intermediate', 'advanced', 'expert'].map((d) => ({ value: d, label: t(`diff.${d}`) }))} />
              <Input label={t('crs.language')} value={settings.language} onChange={set('language')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label={t('crs.visibility')} value={settings.visibility} onChange={set('visibility')}
                options={[{ value: 'hidden', label: t('crs.hidden') }, { value: 'listed', label: t('crs.listed') }]} />
              <Input label={t('crs.enrollmentLimit')} type="number" min="0" value={settings.enrollmentLimit} onChange={set('enrollmentLimit')} />
              <Input label={t('crs.endDate')} type="date" value={settings.expiresAt} onChange={set('expiresAt')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('crs.price')} type="number" min="0" value={settings.price} onChange={set('price')} />
              <Input label={t('crs.certThreshold')} type="number" min="0" max="100" value={settings.completionThreshold} onChange={set('completionThreshold')} />
            </div>
            <Toggle label={t('crs.publishedToggle')} hint={t('crs.publishedHint')}
              checked={settings.isPublished} onChange={(v) => setSettings((s) => ({ ...s, isPublished: v }))} />
            <Toggle label={t('crs.certToggle')} hint={t('crs.certHint')}
              checked={settings.certificateEnabled} onChange={(v) => setSettings((s) => ({ ...s, certificateEnabled: v }))} />
            <div className="flex items-center justify-between border-t border-surface-200 dark:border-surface-700 pt-4">
              <ConfirmButton onConfirm={deleteCourse} message={t('crs.confirmDelete')}>
                <Trash2 size={14} /> {t('crs.deleteCourse')}
              </ConfirmButton>
              <Button loading={busy} onClick={saveSettings}>{t('crs.saveChanges')}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
