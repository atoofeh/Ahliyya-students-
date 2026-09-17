import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PlayCircle, ShieldCheck, Award, BarChart3, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import LanguageToggle from '../../components/LanguageToggle';
import PoweredByVortex from '../../components/PoweredByVortex';
import api, { apiError } from '../../api/axios';
import { Button, Input } from '../../components/ui';
import Logo, { LogoMark } from '../../components/Logo';
import { homeFor } from '../../utils/roles';

const MODES = { LOGIN: 'login', FORGOT: 'forgot', RESET: 'reset' };

const FEATURES = [
  { icon: PlayCircle, key: 'f1' },
  { icon: BarChart3, key: 'f2' },
  { icon: Award, key: 'f3' },
  { icon: ShieldCheck, key: 'f4' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [mode, setMode] = useState(MODES.LOGIN);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '', code: '', rememberMe: false });
  // Why the previous session ended (set by the axios interceptor); read once, then cleared.
  const [logoutReason] = useState(() => {
    const reason = sessionStorage.getItem('lms_logout_reason');
    if (reason) sessionStorage.removeItem('lms_logout_reason');
    return reason;
  });
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetNote, setResetNote] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const sendResetRequest = async () => {
    setResetBusy(true);
    try {
      await api.post('/auth/device/reset-request', { username: form.username, note: resetNote });
      setResetSent(true);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setResetBusy(false);
    }
  };

  useEffect(() => {
    if (user) navigate(homeFor(user.role), { replace: true });
  }, [user, navigate]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setDeviceBlocked(false);
    try {
      if (mode === MODES.LOGIN) {
        const u = await login(form.username, form.password, form.rememberMe);
        if (u.mustChangePassword) navigate('/onboarding');
      } else if (mode === MODES.FORGOT) {
        await api.post('/auth/forgot-password', { email: form.email });
        toast.info(t('auth.resetCodeSent'));
        setMode(MODES.RESET);
      } else if (mode === MODES.RESET) {
        await api.post('/auth/reset-password', { email: form.email, code: form.code, password: form.password });
        toast.success(t('auth.passwordResetDone'));
        setMode(MODES.LOGIN);
      }
    } catch (err) {
      if (err.response?.data?.code === 'DEVICE_NOT_AUTHORIZED') {
        setDeviceBlocked(true);
      } else {
        toast.error(apiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const heading = {
    [MODES.LOGIN]: [t('auth.welcome'), t('auth.subtitle')],
    [MODES.FORGOT]: [t('auth.forgotTitle'), t('auth.forgotSubtitle')],
    [MODES.RESET]: [t('auth.resetTitle'), t('auth.resetSubtitle')],
  }[mode];

  return (
    <div className="flex min-h-screen bg-surface-50 dark:bg-surface-950">
      {/* ── Brand panel ─────────────────────────────────────────── */}
      <div className="relative hidden w-[46%] overflow-hidden bg-brand-gradient lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-brand-radial" />
        {/* Decorative rings */}
        <div className="absolute -left-28 -top-28 h-96 w-96 rounded-full border border-white/[0.06]" />
        <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full border border-white/[0.08]" />
        <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full border border-gold-400/10" />
        <div className="absolute -bottom-28 -right-12 h-80 w-80 rounded-full border border-gold-400/15" />

        <div className="relative z-10 flex flex-1 flex-col justify-between p-12">
          <Logo tone="white" size="md" />

          <div>
            <div className="mb-8 animate-float-slow">
              <LogoMark size={168} tone="white" className="drop-shadow-[0_12px_30px_rgba(0,0,0,0.35)]" />
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.15] text-white">
              Rise to <span className="text-gold-gradient">Excellence</span>
            </h1>
            <p dir="rtl" className="mt-2 font-sans text-2xl font-medium text-brand-100/90">ارتقِ نحو القمة</p>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-brand-100/80">
              {t('auth.blurb')}
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4">
              {FEATURES.map(({ icon: Icon, key }) => (
                <div key={key} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <Icon size={20} className="mb-2 text-gold-400" />
                  <p className="text-[13px] font-bold text-white">{t(`auth.${key}Title`)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand-100/70">{t(`auth.${key}Text`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-brand-200/50">{t('auth.rights', { year: new Date().getFullYear() })}</p>
            <PoweredByVortex tone="dark" />
          </div>
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] animate-slide-up">
          {/* The switch sits above the form: a student who cannot read the
              English labels is exactly the person who has to find it. */}
          {/* Wraps rather than shrinks: the wordmark sets its own width, and
              at phone size the two would otherwise sit on top of each other. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:justify-end">
            <Logo size="md" className="lg:hidden" />
            <LanguageToggle />
          </div>

          <h2 className="font-display text-[26px] font-extrabold text-surface-900 dark:text-white">{heading[0]}</h2>
          <p className="mt-1 text-sm text-surface-500">{heading[1]}</p>

          {logoutReason && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {logoutReason}
            </div>
          )}

          {deviceBlocked && (
            <div className="mt-5 rounded-xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{t('auth.deviceLinked')}</strong> {t('auth.deviceLinkedHint')}
                </span>
              </div>
              {resetSent ? (
                <p className="mt-2 ps-[26px] font-semibold">{t('auth.requestSent')}</p>
              ) : !resetOpen ? (
                <button type="button" className="mt-2 ps-[26px] font-semibold underline-offset-2 hover:underline" onClick={() => setResetOpen(true)}>
                  {t('auth.requestReset')}
                </button>
              ) : (
                <div className="mt-3 space-y-2 ps-[26px]">
                  <Input label={t('auth.noteForAdmin')} value={resetNote} onChange={(e) => setResetNote(e.target.value)} maxLength={300}
                    placeholder={t('auth.notePlaceholder')} />
                  <Button type="button" size="sm" loading={resetBusy} onClick={sendResetRequest} disabled={form.username.length < 3}>{t('auth.sendRequest')}</Button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === MODES.LOGIN && (
              <Input label={t('auth.username')} value={form.username} onChange={set('username')} required minLength={3}
                placeholder={t('auth.usernamePlaceholder')} autoComplete="username" />
            )}
            {(mode === MODES.FORGOT || mode === MODES.RESET) && (
              <Input label={t('auth.email')} type="email" value={form.email} onChange={set('email')} required placeholder="you@university.edu" />
            )}
            {mode === MODES.RESET && (
              <Input label={t('auth.resetCode')} value={form.code} onChange={set('code')} required minLength={6} maxLength={6} placeholder={t('auth.resetCodePlaceholder')} />
            )}
            {mode !== MODES.FORGOT && (
              <Input label={mode === MODES.RESET ? t('auth.newPassword') : t('auth.password')} type="password" value={form.password}
                onChange={set('password')} required minLength={mode === MODES.LOGIN ? 1 : 8} placeholder="••••••••"
                autoComplete={mode === MODES.LOGIN ? 'current-password' : 'new-password'}
                hint={mode !== MODES.LOGIN ? t('auth.passwordRule') : undefined} />
            )}
            {mode === MODES.LOGIN && (
              <>
                <div className="-my-1.5 flex flex-wrap items-center justify-between gap-x-4 text-[13px]">
                  {/* 44px is the smallest reliable touch target; the negative
                      margin above keeps the visual spacing as it was. */}
                  <label className="flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 py-2 text-surface-600 dark:text-surface-300">
                    <input type="checkbox" checked={form.rememberMe} onChange={set('rememberMe')}
                      className="h-[18px] w-[18px] rounded accent-brand-600" />
                    {t('auth.keepSignedIn')}
                  </label>
                  <button type="button" className="min-h-[44px] py-2 font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300" onClick={() => setMode(MODES.FORGOT)}>
                    {t('auth.forgot')}
                  </button>
                </div>
                {/* The consequence is easy to miss and matters most on a phone:
                    signed out means no notifications. */}
                <p className="-mt-1 text-[12.5px] leading-relaxed text-surface-400">
                  {t(form.rememberMe ? 'auth.keepHintOn' : 'auth.keepHintOff')}
                </p>
              </>
            )}
            <Button type="submit" loading={busy} className="w-full" size="lg">
              {mode === MODES.LOGIN ? t('auth.signIn') : mode === MODES.FORGOT ? t('auth.sendResetCode') : t('auth.resetPassword')}
            </Button>
          </form>

          {mode !== MODES.LOGIN && (
            <div className="mt-6 text-center text-[13px] text-surface-500">
              <button className="inline-flex items-center gap-1.5 font-bold text-brand-600 hover:text-brand-700 dark:text-brand-300" onClick={() => setMode(MODES.LOGIN)}>
                {/* The arrow points back the way the language reads. */}
                <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden="true" />
                {t('auth.backToSignIn')}
              </button>
            </div>
          )}

          <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-surface-400">
            <ShieldCheck size={13} className="text-gold-500" />
            {t('auth.footer')}
          </div>
        </div>
      </div>
      <PoweredByVortex className="lg:hidden" />
    </div>
  );
}
