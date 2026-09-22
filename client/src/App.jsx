import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import MainLayout from './layouts/MainLayout';
import NativeShell from './components/NativeShell';
import LoginPage from './pages/auth/LoginPage';
import OnboardingPage from './pages/auth/OnboardingPage';

const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const CourseCatalog = lazy(() => import('./pages/student/CourseCatalog'));
const CoursePreview = lazy(() => import('./pages/student/CoursePreview'));
const CoursePlayer = lazy(() => import('./pages/student/CoursePlayer'));
const QuizRunner = lazy(() => import('./pages/student/QuizRunner'));
const AttemptResult = lazy(() => import('./pages/student/AttemptResult'));
const GradesPage = lazy(() => import('./pages/student/GradesPage'));
const CertificatesPage = lazy(() => import('./pages/student/CertificatesPage'));
const BookmarksPage = lazy(() => import('./pages/student/BookmarksPage'));

const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const TeacherCourses = lazy(() => import('./pages/teacher/TeacherCourses'));
const TeacherInvitations = lazy(() => import('./pages/teacher/TeacherInvitations'));
const CourseManager = lazy(() => import('./pages/teacher/CourseManager'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminCourses = lazy(() => import('./pages/admin/AdminCourses'));
const AdminSessions = lazy(() => import('./pages/admin/AdminSessions'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminAntiCheat = lazy(() => import('./pages/admin/AdminAntiCheat'));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'));
const AdminSecurity = lazy(() => import('./pages/admin/AdminSecurity'));
const AdminAdmins = lazy(() => import('./pages/admin/AdminAdmins'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const PastPapersPage = lazy(() => import('./pages/PastPapersPage'));
import { Spinner } from './components/ui';
import { SkeletonPage } from './components/Skeletons';
import { roleMatches, homeFor } from './utils/roles';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner full /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/onboarding" replace />;
  if (roles && !roleMatches(user.role, roles)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/onboarding" replace />;
  return <Navigate to={homeFor(user.role)} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
      <ToastProvider>
        <NativeShell />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div className="p-6"><SkeletonPage /></div>}>
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
                <Route path="/student/catalog/:courseId" element={<Protected roles={['student']}><CoursePreview /></Protected>} />
                <Route path="/student/courses/:courseId" element={<Protected roles={['student']}><CoursePlayer /></Protected>} />
                <Route path="/student/attempts/:attemptId" element={<Protected roles={['student']}><AttemptResult /></Protected>} />
                <Route path="/student/grades" element={<Protected roles={['student']}><GradesPage /></Protected>} />
                <Route path="/student/certificates" element={<Protected roles={['student']}><CertificatesPage /></Protected>} />
                <Route path="/student/bookmarks" element={<Protected roles={['student']}><BookmarksPage /></Protected>} />

                {/* Teacher */}
                <Route path="/teacher" element={<Protected roles={['teacher']}><TeacherDashboard /></Protected>} />
                <Route path="/teacher/courses" element={<Protected roles={['teacher']}><TeacherCourses /></Protected>} />
                <Route path="/teacher/invitations" element={<Protected roles={['teacher']}><TeacherInvitations /></Protected>} />
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
                {/* Owner only — 'admin' is deliberately absent so roleMatches() does not admit administrators */}
                <Route path="/admin/security" element={<Protected roles={['super_admin']}><AdminSecurity /></Protected>} />
                <Route path="/admin/security/:tab" element={<Protected roles={['super_admin']}><AdminSecurity /></Protected>} />
                <Route path="/admin/admins" element={<Protected roles={['super_admin']}><AdminAdmins /></Protected>} />

                {/* Shared */}
                <Route path="/announcements" element={<AnnouncementsPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/past-papers" element={<PastPapersPage />} />
              </Route>

              <Route path="/" element={<HomeRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
