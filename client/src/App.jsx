import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/auth/LoginPage';
import OnboardingPage from './pages/auth/OnboardingPage';

import StudentDashboard from './pages/student/StudentDashboard';
import CourseCatalog from './pages/student/CourseCatalog';
import CoursePlayer from './pages/student/CoursePlayer';
import QuizRunner from './pages/student/QuizRunner';
import AttemptResult from './pages/student/AttemptResult';
import GradesPage from './pages/student/GradesPage';
import CertificatesPage from './pages/student/CertificatesPage';
import BookmarksPage from './pages/student/BookmarksPage';

import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherCourses from './pages/teacher/TeacherCourses';
import CourseManager from './pages/teacher/CourseManager';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminCourses from './pages/admin/AdminCourses';
import AdminSessions from './pages/admin/AdminSessions';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAudit from './pages/admin/AdminAudit';
import AdminAntiCheat from './pages/admin/AdminAntiCheat';
import AdminAnnouncements from './pages/admin/AdminAnnouncements';
import AnnouncementsPage from './pages/AnnouncementsPage';
import { Spinner } from './components/ui';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner full /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/onboarding" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/onboarding" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/student'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />

              {/* Quiz runner is fullscreen — outside the main chrome */}
              <Route path="/student/courses/:courseId/quiz/:quizId" element={
                <Protected roles={['student']}><QuizRunner /></Protected>} />

              <Route element={<Protected><MainLayout /></Protected>}>
                {/* Student */}
                <Route path="/student" element={<Protected roles={['student']}><StudentDashboard /></Protected>} />
                <Route path="/student/catalog" element={<Protected roles={['student']}><CourseCatalog /></Protected>} />
                <Route path="/student/courses/:courseId" element={<Protected roles={['student']}><CoursePlayer /></Protected>} />
                <Route path="/student/attempts/:attemptId" element={<Protected roles={['student']}><AttemptResult /></Protected>} />
                <Route path="/student/grades" element={<Protected roles={['student']}><GradesPage /></Protected>} />
                <Route path="/student/certificates" element={<Protected roles={['student']}><CertificatesPage /></Protected>} />
                <Route path="/student/bookmarks" element={<Protected roles={['student']}><BookmarksPage /></Protected>} />

                {/* Teacher */}
                <Route path="/teacher" element={<Protected roles={['teacher']}><TeacherDashboard /></Protected>} />
                <Route path="/teacher/courses" element={<Protected roles={['teacher']}><TeacherCourses /></Protected>} />
                <Route path="/teacher/courses/:courseId" element={<Protected roles={['teacher', 'admin']}><CourseManager /></Protected>} />
                <Route path="/teacher/courses/:courseId/:tab" element={<Protected roles={['teacher', 'admin']}><CourseManager /></Protected>} />

                {/* Admin */}
                <Route path="/admin" element={<Protected roles={['admin']}><AdminDashboard /></Protected>} />
                <Route path="/admin/users" element={<Protected roles={['admin']}><AdminUsers /></Protected>} />
                <Route path="/admin/courses" element={<Protected roles={['admin']}><AdminCourses /></Protected>} />
                <Route path="/admin/sessions" element={<Protected roles={['admin']}><AdminSessions /></Protected>} />
                <Route path="/admin/settings" element={<Protected roles={['admin']}><AdminSettings /></Protected>} />
                <Route path="/admin/audit" element={<Protected roles={['admin']}><AdminAudit /></Protected>} />
                <Route path="/admin/anticheat" element={<Protected roles={['admin']}><AdminAntiCheat /></Protected>} />
                <Route path="/admin/announcements" element={<Protected roles={['admin']}><AdminAnnouncements /></Protected>} />

                {/* Shared */}
                <Route path="/announcements" element={<AnnouncementsPage />} />
              </Route>

              <Route path="/" element={<HomeRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
