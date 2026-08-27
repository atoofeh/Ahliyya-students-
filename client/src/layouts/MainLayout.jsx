import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, GraduationCap, Award, Bookmark, Megaphone,
  Users, MonitorSmartphone, Settings, ScrollText, ShieldAlert, LogOut,
  Sun, Moon, Laptop, Menu, Library,
} from 'lucide-react';
import { Avatar } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationsBell from '../components/NotificationsBell';
import GlobalSearch from '../components/GlobalSearch';
import { LogoMark } from '../components/Logo';
import { isAdminRole, ROLE_LABEL } from '../utils/roles';

const NAV = {
  student: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/catalog', label: 'Course Catalog', icon: Library },
    { to: '/student/grades', label: 'My Grades', icon: GraduationCap },
    { to: '/student/certificates', label: 'Certificates', icon: Award },
    { to: '/student/bookmarks', label: 'Bookmarks', icon: Bookmark },
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/teacher/courses', label: 'My Courses', icon: BookOpen },
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen },
    { to: '/admin/sessions', label: 'Active Sessions', icon: MonitorSmartphone },
    { to: '/admin/anticheat', label: 'Cheat Reports', icon: ShieldAlert },
    { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
};

const THEME_ICON = { light: Sun, dark: Moon, system: Laptop };

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { theme, cycle } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const ThemeIcon = THEME_ICON[theme] || Laptop;
  const nav = NAV[isAdminRole(user?.role) ? 'admin' : user?.role] || [];

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebar = (
    <div className="relative flex h-full flex-col bg-brand-gradient text-white">
      <div className="pointer-events-none absolute inset-0 bg-brand-radial opacity-60" />

      {/* Brand */}
      <div className="relative flex items-center gap-3 px-5 pb-6 pt-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 shadow-inner-top ring-1 ring-white/15">
          <LogoMark size={30} tone="white" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[13.5px] font-extrabold tracking-wide">
            STUDENTS<span className="text-gold-400">_</span>ALAHLIYYA
          </div>
          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.3em] text-gold-400/90">
            Rise to Excellence
          </div>
        </div>
      </div>

      {/* Role chip */}
      <div className="relative px-5 pb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-brand-100 ring-1 ring-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
          {ROLE_LABEL[user?.role]} Portal
        </span>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-white/12 text-white shadow-inner-top ring-1 ring-white/10'
                  : 'text-brand-100/75 hover:bg-white/[0.07] hover:text-white'
              }`}>
            {({ isActive }) => (
              <>
                <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
                <Icon size={17} className={isActive ? 'text-gold-300' : 'text-brand-200/70 group-hover:text-brand-100'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Profile */}
      <div className="relative border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/10">
          <Avatar name={user?.name || ''} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
            <p className="truncate text-[11px] text-brand-200/70">{user?.email || `@${user?.username}`}</p>
          </div>
          <button onClick={doLogout} title="Sign out"
            className="rounded-lg p-2 text-brand-200/70 transition-colors hover:bg-white/10 hover:text-rose-300">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950">
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 shadow-float animate-slide-in">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] lg:block">
        {sidebar}
      </aside>

      <div className="lg:pl-[268px]">
        <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-surface-200/70 px-4 py-2.5 dark:border-surface-800">
          <button className="rounded-xl p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 lg:hidden"
            onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <button onClick={cycle} title={`Theme: ${theme}`}
              className="rounded-xl p-2 text-surface-500 transition-colors hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800">
              <ThemeIcon size={18} />
            </button>
            <NotificationsBell />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6 lg:p-7 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
