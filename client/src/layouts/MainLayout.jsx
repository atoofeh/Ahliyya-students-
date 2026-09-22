import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, GraduationCap, Award, Bookmark, Megaphone,
  Users, MonitorSmartphone, Settings, ScrollText, ShieldAlert, ShieldCheck, UserCog, LogOut,
  Sun, Moon, Laptop, Menu, Library, Handshake, Newspaper, BookOpenCheck, HelpCircle,
} from 'lucide-react';
import { Avatar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import LanguageToggle from '../components/LanguageToggle';
import PoweredByVortex from '../components/PoweredByVortex';
import SocialLinks from '../components/SocialLinks';
import StudentTour from '../components/StudentTour';
import NotificationsBell from '../components/NotificationsBell';
import GlobalSearch from '../components/GlobalSearch';
import { LogoMark } from '../components/Logo';
import OfflineBanner from '../components/OfflineBanner';
import { navFor } from '../utils/roles';

const ICONS = {
  LayoutDashboard, BookOpen, GraduationCap, Award, Bookmark, Megaphone,
  Users, MonitorSmartphone, Settings, ScrollText, ShieldAlert, ShieldCheck, UserCog, Library, Handshake, Newspaper,
  BookOpenCheck,
};

const THEME_ICON = { light: Sun, dark: Moon, system: Laptop };

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { theme, cycle } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The welcome tour: asked once, automatically, of a student who has never
  // answered it; replayable from the help button at any time after.
  const isStudent = user?.role === 'student';
  const [tourAsked, setTourAsked] = useState(false);
  const [tourReplay, setTourReplay] = useState(false);
  const tourMode = tourReplay ? 'replay' : (isStudent && !user?.tourCompletedAt && !tourAsked ? 'ask' : null);
  const ThemeIcon = THEME_ICON[theme] || Laptop;
  const nav = navFor(user?.role).map((item) => ({
    ...item,
    label: item.key ? t(item.key) : item.label,
    icon: ICONS[item.icon] || LayoutDashboard,
  }));

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebar = (
    <div className="pt-safe pb-safe relative flex h-full flex-col bg-brand-gradient text-white">
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
          {user?.role === 'student'
            ? t('nav.studentPortal')
            : t('nav.portal', { role: t(`role.${user?.role}`) })}
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
                <span className={`absolute start-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-e-full bg-gold-400 transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
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
          <button onClick={doLogout} title={t('nav.signOut')} aria-label={t('nav.signOut')}
            className="rounded-lg p-2 text-brand-200/70 transition-colors hover:bg-white/10 hover:text-rose-300">
            <LogOut size={16} />
          </button>
        </div>
        <div className="mt-1 flex justify-center">
          <PoweredByVortex tone="dark" />
        </div>
      </div>
    </div>
  );

  return (
    // Side insets sit here, once, so no px-* utility anywhere below has to fight them.
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950"
      style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}>
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute start-0 top-0 h-full w-72 shadow-float animate-slide-in">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[268px] lg:block">
        {sidebar}
      </aside>

      <div className="lg:ps-[268px]">
        <OfflineBanner />
        <header className="glass pt-safe sticky top-0 z-20 flex items-center gap-3 border-b border-surface-200/70 px-4 py-2.5 dark:border-surface-800"
          style={{ ['--pt-safe-extra']: '0.625rem' }}>
          <button className="rounded-xl p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 lg:hidden"
            onClick={() => setSidebarOpen(true)} aria-label={t('nav.openNavigation')}>
            <Menu size={20} />
          </button>
          <GlobalSearch />
          <div className="ms-auto flex items-center gap-1">
            <LanguageToggle className="me-1" />
            {isStudent && (
              <button onClick={() => setTourReplay(true)} title={t('tour.replay')} aria-label={t('tour.replay')}
                className="rounded-xl p-2 text-surface-500 transition-colors hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800">
                <HelpCircle size={18} />
              </button>
            )}
            <button onClick={cycle} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}. Change theme`}
              className="rounded-xl p-2 text-surface-500 transition-colors hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800">
              <ThemeIcon size={18} />
            </button>
            <NotificationsBell />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6 lg:p-7 animate-fade-in">
          <Outlet />
          {/* The institute's accounts, at the foot of every page. */}
          <footer className="mt-12 flex flex-wrap items-start justify-between gap-3 border-t border-surface-200/80 pt-5 dark:border-surface-800">
            <div>
              <p className="text-sm font-semibold text-surface-700 dark:text-surface-200">{t('social.followUs')}</p>
              <p className="text-xs text-surface-400">{t('social.followHint')}</p>
            </div>
            {/* The maker's mark sits under the accounts, on the end edge. On a
                phone the accounts wrap under the heading at the start, so the
                column spans the row and the mark still reaches the end. */}
            <div className="flex w-full flex-col items-end gap-2.5 sm:w-auto">
              <SocialLinks className="max-sm:self-start" />
              <PoweredByVortex size="sm" floating={false} />
            </div>
          </footer>
          {/* Clears the Android gesture bar without fighting the responsive padding above. */}
          <div aria-hidden="true" style={{ height: 'var(--safe-bottom)' }} />
        </main>
      </div>
      {tourMode && (
        <StudentTour
          key={tourMode}
          mode={tourMode}
          onClose={() => { setTourAsked(true); setTourReplay(false); }}
        />
      )}
    </div>
  );
}
