import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PlayCircle, ShieldCheck, Award, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api, { apiError } from '../../api/axios';
import { Button, Input } from '../../components/ui';
import Logo, { LogoMark } from '../../components/Logo';
import { homeFor } from '../../utils/roles';

const MODES = { LOGIN: 'login', FORGOT: 'forgot', RESET: 'reset' };

const FEATURES = [
  { icon: PlayCircle, title: 'HD lectures, protected', text: 'Encrypted streaming with resume — your lessons, anywhere.' },
  { icon: BarChart3, title: 'Smart quizzes & analytics', text: 'Instant grading, explanations, and progress you can see.' },
  { icon: Award, title: 'Verified certificates', text: 'Earn certificates with publicly verifiable serials.' },
  { icon: ShieldCheck, title: 'One authorized device', text: 'Your account is linked to one authorized device — nobody else can sign in as you.' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState(MODES.LOGIN);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '', code: '', rememberMe: false });
  const [logoutReason, setLogoutReason] = useState(null);
  const [deviceBlocked, setDeviceBlocked] = useState(false);

  useEffect(() => {
    const reason = sessionStorage.getItem('lms_logout_reason');
    if (reason) {
      setLogoutReason(reason);
      sessionStorage.removeItem('lms_logout_reason');
    }
  }, []);

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
        toast.info('If that email exists, a reset code was sent.');
        setMode(MODES.RESET);
      } else if (mode === MODES.RESET) {
        await api.post('/auth/reset-password', { email: form.email, code: form.code, password: form.password });
        toast.success('Password reset — sign in with your new password.');
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
    [MODES.LOGIN]: ['Welcome back', 'Sign in to continue your journey.'],
    [MODES.FORGOT]: ['Reset your password', "Enter your email and we'll send a reset code."],
    [MODES.RESET]: ['Enter reset code', 'Check your inbox for the 6-digit code.'],
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
              <LogoMark size={112} tone="white" className="drop-shadow-[0_12px_30px_rgba(0,0,0,0.35)]" />
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.15] text-white">
              Rise to <span className="text-gold-gradient">Excellence</span>
            </h1>
            <p dir="rtl" className="mt-2 font-sans text-2xl font-medium text-brand-100/90">ارتقِ نحو القمة</p>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-brand-100/80">
              The learning platform of Al Ahliyya students — lectures, quizzes,
              assignments and certificates, in one beautiful place.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <Icon size={20} className="mb-2 text-gold-400" />
                  <p className="text-[13px] font-bold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand-100/70">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-brand-200/50">© {new Date().getFullYear()} Students_Alahliyya · All rights reserved</p>
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] animate-slide-up">
          {/* Mobile brand header */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" />
          </div>

          <h2 className="font-display text-[26px] font-extrabold text-surface-900 dark:text-white">{heading[0]}</h2>
          <p className="mt-1 text-sm text-surface-500">{heading[1]}</p>

          {logoutReason && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {logoutReason}
            </div>
          )}

          {deviceBlocked && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>This account is already linked to another device.</strong> Contact an administrator or request a device reset.
              </span>
            </div>
          )}

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === MODES.LOGIN && (
              <Input label="Username" value={form.username} onChange={set('username')} required minLength={3}
                placeholder="your.username" autoComplete="username" />
            )}
            {(mode === MODES.FORGOT || mode === MODES.RESET) && (
              <Input label="Email" type="email" value={form.email} onChange={set('email')} required placeholder="you@university.edu" />
            )}
            {mode === MODES.RESET && (
              <Input label="Reset code" value={form.code} onChange={set('code')} required minLength={6} maxLength={6} placeholder="6-digit code" />
            )}
            {mode !== MODES.FORGOT && (
              <Input label={mode === MODES.RESET ? 'New password' : 'Password'} type="password" value={form.password}
                onChange={set('password')} required minLength={mode === MODES.LOGIN ? 1 : 8} placeholder="••••••••"
                autoComplete={mode === MODES.LOGIN ? 'current-password' : 'new-password'}
                hint={mode !== MODES.LOGIN ? '8+ characters with uppercase, lowercase and a digit' : undefined} />
            )}
            {mode === MODES.LOGIN && (
              <div className="flex items-center justify-between text-[13px]">
                <label className="flex cursor-pointer items-center gap-2 text-surface-600 dark:text-surface-300">
                  <input type="checkbox" checked={form.rememberMe} onChange={set('rememberMe')}
                    className="h-3.5 w-3.5 rounded accent-brand-600" />
                  Remember me
                </label>
                <button type="button" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300" onClick={() => setMode(MODES.FORGOT)}>
                  Forgot password?
                </button>
              </div>
            )}
            <Button type="submit" loading={busy} className="w-full" size="lg">
              {mode === MODES.LOGIN ? 'Sign in' : mode === MODES.FORGOT ? 'Send reset code' : 'Reset password'}
            </Button>
          </form>

          {mode !== MODES.LOGIN && (
            <div className="mt-6 text-center text-[13px] text-surface-500">
              <button className="font-bold text-brand-600 hover:text-brand-700 dark:text-brand-300" onClick={() => setMode(MODES.LOGIN)}>
                ← Back to sign in
              </button>
            </div>
          )}

          <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-surface-400">
            <ShieldCheck size={13} className="text-gold-500" />
            One authorized device per account · Protected content · Encrypted media
          </div>
        </div>
      </div>
    </div>
  );
}
