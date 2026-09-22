export const ROLE_LABEL = { student: 'Student', teacher: 'Instructor', admin: 'Administrator', super_admin: 'Owner' };

export const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

/** Mirrors the server's authorize(): the owner satisfies any 'admin' check. */
export const roleMatches = (role, roles) => roles.includes(role) || (role === 'super_admin' && roles.includes('admin'));

export const homeFor = (role) => (isAdminRole(role) ? '/admin' : role === 'teacher' ? '/teacher' : '/student');

/**
 * Sidebar entries. `icon` names a lucide icon resolved in MainLayout.
 *
 * `key` is the translation key; `label` is the English wording it falls back
 * to, so a nav entry still reads sensibly if a dictionary entry goes missing.
 */
export const STUDENT_NAV = [
  { to: '/student', label: 'Dashboard', key: 'nav.dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/student/catalog', label: 'Course Catalog', key: 'nav.catalog', icon: 'Library' },
  { to: '/past-papers', label: 'Past questions', key: 'nav.pastPapers', icon: 'BookOpenCheck' },
  { to: '/news', label: 'News', key: 'nav.news', icon: 'Newspaper' },
  { to: '/student/grades', label: 'My Grades', key: 'nav.grades', icon: 'GraduationCap' },
  { to: '/student/certificates', label: 'Certificates', key: 'nav.certificates', icon: 'Award' },
  { to: '/student/bookmarks', label: 'Bookmarks', key: 'nav.bookmarks', icon: 'Bookmark' },
  { to: '/announcements', label: 'Announcements', key: 'nav.announcements', icon: 'Megaphone' },
];
export const TEACHER_NAV = [
  { to: '/teacher', label: 'Dashboard', key: 'nav.dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/teacher/courses', label: 'My Courses', key: 'nav.myCourses', icon: 'BookOpen' },
  { to: '/teacher/invitations', label: 'Invitations', key: 'nav.invitations', icon: 'Handshake' },
  { to: '/past-papers', label: 'Past questions', key: 'nav.pastPapers', icon: 'BookOpenCheck' },
  { to: '/news', label: 'News', key: 'nav.news', icon: 'Newspaper' },
  { to: '/announcements', label: 'Announcements', key: 'nav.announcements', icon: 'Megaphone' },
];
export const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', key: 'nav.overview', icon: 'LayoutDashboard', end: true },
  { to: '/admin/users', label: 'Users', key: 'nav.users', icon: 'Users' },
  { to: '/admin/courses', label: 'Courses', key: 'nav.courses', icon: 'BookOpen' },
  { to: '/news', label: 'News', key: 'nav.news', icon: 'Newspaper' },
  { to: '/past-papers', label: 'Past questions', key: 'nav.pastPapers', icon: 'BookOpenCheck' },
  { to: '/admin/sessions', label: 'Sessions', key: 'nav.sessions', icon: 'MonitorSmartphone' },
  { to: '/admin/anticheat', label: 'Cheat Reports', key: 'nav.cheatReports', icon: 'ShieldAlert' },
  { to: '/admin/announcements', label: 'Announcements', key: 'nav.announcements', icon: 'Megaphone' },
  { to: '/admin/audit', label: 'Audit', key: 'nav.audit', icon: 'ScrollText' },
  { to: '/admin/settings', label: 'Settings', key: 'nav.settings', icon: 'Settings' },
];
/** Owner-only entries, inserted before Settings. */
export const OWNER_NAV = [
  { to: '/admin/security', label: 'Security', key: 'nav.security', icon: 'ShieldCheck' },
  { to: '/admin/admins', label: 'Admins', key: 'nav.admins', icon: 'UserCog' },
];

export const navFor = (role) => {
  if (role === 'super_admin') return [...ADMIN_NAV.slice(0, -1), ...OWNER_NAV, ADMIN_NAV[ADMIN_NAV.length - 1]];
  if (role === 'admin') return ADMIN_NAV;
  if (role === 'teacher') return TEACHER_NAV;
  return STUDENT_NAV;
};
