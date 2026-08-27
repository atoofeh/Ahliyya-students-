import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Users, ClipboardCheck, ShieldAlert, Video, Eye } from 'lucide-react';
import api from '../../api/axios';
import { Card, StatCard, Spinner, EmptyState, Badge, Button, ProgressBar, PageHeader, SectionTitle } from '../../components/ui';
import CourseCover from '../../components/CourseCover';

export default function TeacherDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/analytics/teacher').then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return <Spinner full />;
  const { stats, courses } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instructor dashboard"
        subtitle="Your courses, students and performance at a glance."
        actions={<Link to="/teacher/courses"><Button variant="gold">Manage courses</Button></Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard icon={<BookOpen size={20} />} label="Courses" value={stats.courses} sub={`${stats.publishedCourses} published`} />
        <StatCard icon={<Users size={20} />} label="Students" value={stats.totalStudents} color="sky" />
        <StatCard icon={<ClipboardCheck size={20} />} label="To grade" value={stats.pendingGrading} color="amber" />
        <StatCard icon={<ShieldAlert size={20} />} label="Cheat events (7d)" value={stats.cheatEventsThisWeek} color="rose" />
        <StatCard icon={<Video size={20} />} label="Videos" value={stats.totalVideos} color="green" />
        <StatCard icon={<Eye size={20} />} label="Video views" value={stats.totalVideoViews} color="primary" />
      </div>

      <div>
        <SectionTitle title="Course performance" subtitle="Students, attempts and progress per course" />
        {courses.length === 0 ? (
          <Card><EmptyState title="No courses yet" subtitle="Create your first course to start teaching."
            action={<Link to="/teacher/courses"><Button>Create course</Button></Link>} /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <Link key={c._id} to={`/teacher/courses/${c._id}`}>
                <Card hover className="h-full overflow-hidden">
                  <CourseCover title={c.title} category={c.category} className="h-20">
                    <span className="absolute right-3 top-3">
                      <Badge color={c.isPublished ? 'green' : 'gray'}>{c.isPublished ? 'Live' : 'Draft'}</Badge>
                    </span>
                  </CourseCover>
                  <div className="p-4">
                    <h3 className="mb-3 font-display font-bold text-surface-900 line-clamp-1 dark:text-white">{c.title}</h3>
                    <div className="grid grid-cols-3 divide-x divide-surface-100 rounded-xl bg-surface-50 py-2.5 text-center text-[11px] text-surface-400 dark:divide-surface-700 dark:bg-surface-800/60">
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.students}</p>students</div>
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.quizAttempts}</p>attempts</div>
                      <div><p className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{c.avgQuizScore || 0}%</p>avg score</div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-surface-400">
                        <span>Avg progress</span><span className="font-semibold text-surface-600 dark:text-surface-300">{c.avgProgress}%</span>
                      </div>
                      <ProgressBar value={c.avgProgress} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
