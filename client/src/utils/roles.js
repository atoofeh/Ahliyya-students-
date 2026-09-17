export const ROLE_LABEL = { student: 'Student', teacher: 'Instructor', admin: 'Administrator', super_admin: 'Owner' };

export const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

/** Mirrors the server's authorize(): the owner satisfies any 'admin' check. */
export const roleMatches = (role, roles) => roles.includes(role) || (role === 'super_admin' && roles.includes('admin'));

export const homeFor = (role) => (isAdminRole(role) ? '/admin' : role === 'teacher' ? '/teacher' : '/student');

/**
 * Sidebar entries. `icon` names a lucide icon resolved in MainLayout.
 *
 * `key` is a translation key, present only on the entries a student can
 * reach — those are the screens that exist in Arabic. An entry without one
 * keeps its English `label`, which is what the teacher and administrator
 * consoles want.
 */
export const STUDENT_NAV = [
  { to: '/student', label: 'Dashboard', key: 'nav.dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/student/catalog', label: 'Course Catalog', key: 'nav.catalog', icon: 'Library' },
  { to: '/news', label: 'News', key: 'nav.news', icon: 'Newspaper' },
  { to: '/student/grades', label: 'My Grades', key: 'nav.grades', icon: 'GraduationCap' },
  { to: '/student/certificates', label: 'Certificates', key: 'nav.certificates', icon: 'Award' },
  { to: '/student/bookmarks', label: 'Bookmarks', key: 'nav.bookmarks', icon: 'Bookmark' },
  { to: '/announcements', label: 'Announcements', key: 'nav.announcements', icon: 'Megaphone' },
];
export const TEACHER_NAV = [
  { to: '/teacher', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/teacher/courses', label: 'My Courses', icon: 'BookOpen' },
  { to: '/teacher/invitations', label: 'Invitations', icon: 'Handshake' },
  { to: '/news', label: 'News', icon: 'Newspaper' },
  { to: '/announcements', label: 'Announcements', icon: 'Megaphone' },
];
export const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: 'LayoutDashboard', end: true },
  { to: '/admin/users', label: 'Users', icon: 'Users' },
  { to: '/admin/courses', label: 'Courses', icon: 'BookOpen' },
  { to: '/news', label: 'News', icon: 'Newspaper' },
  { to: '/admin/sessions', label: 'Sessions', icon: 'MonitorSmartphone' },
  { to: '/admin/anticheat', label: 'Cheat Reports', icon: 'ShieldAlert' },
  { to: '/admin/announcements', label: 'Announcements', icon: 'Megaphone' },
  { to: '/admin/audit', label: 'Audit', icon: 'ScrollText' },
  { to: '/admin/settings', label: 'Settings', icon: 'Settings' },
];
/** Owner-only entries, inserted before Settings. */
export const OWNER_NAV = [
  { to: '/admin/security', label: 'Security', icon: 'ShieldCheck' },
  { to: '/admin/admins', label: 'Admins', icon: 'UserCog' },
];

export const navFor = (role) => {
  if (role === 'super_admin') return [...ADMIN_NAV.slice(0, -1), ...OWNER_NAV, ADMIN_NAV[ADMIN_NAV.length - 1]];
  if (role === 'admin') return ADMIN_NAV;
  if (role === 'teacher') return TEACHER_NAV;
  return STUDENT_NAV;
};
