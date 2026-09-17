import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MailCheck, KeyRound, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useLanguage } from '../../hooks/useLanguage';
import LanguageToggle from '../../components/LanguageToggle';
import PoweredByVortex from '../../components/PoweredByVortex';
import { Button, Input, Card } from '../../components/ui';
import Logo from '../../components/Logo';
import { homeFor } from '../../utils/roles';

/**
 * First-login flow for admin-created accounts:
 * 1) confirm/verify email  2) set a new password → full access.
 */
export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState(user?.emailVerified ? 2 : 0);
  const [email, setEmail] = useState(user?.email || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    await api.post('/auth/resend-verification', { email });
    toast.success(t('onboard.codeSent'));
    setStep(1);
  });

  const verify = () => run(async () => {
    await api.post('/auth/verify-email', { code });
    toast.success(t('onboard.emailVerified'));
    setStep(2);
  });

  const setNewPassword = () => run(async () => {
    await api.post('/auth/set-password', { password });
    const profile = await refreshProfile();
    toast.success(t('onboard.allSet'));
    navigate(homeFor(profile.role));
  });

  const steps = [
    { icon: <MailCheck size={19} />, label: 'onboard.stepEmail' },
    { icon: <KeyRound size={19} />, label: 'onboard.stepVerify' },
    { icon: <ShieldCheck size={19} />, label: 'onboard.stepPassword' },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-gradient p-4">
      <div className="absolute inset-0 bg-brand-radial" />
      <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full border border-white/[0.07]" />
      <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full border border-gold-400/10" />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <Logo tone="white" size="md" />
          <LanguageToggle />
        </div>

        <Card className="p-7">
          <h1 className="font-display text-lg font-extrabold text-surface-900 dark:text-white">{t('onboard.title')}</h1>
          <p className="mb-6 mt-0.5 text-sm text-surface-500">{t('onboard.greeting', { name: user?.name || '' })}</p>

          <div className="mb-7 flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300 ${
                  i < step ? 'bg-gold-gradient text-brand-950'
                    : i === step ? 'bg-brand-gradient text-white shadow-glow'
                    : 'bg-surface-100 text-surface-400 dark:bg-surface-800'}`}>
                  {s.icon}
                </div>
                <span className={`text-[10.5px] font-bold uppercase tracking-wider ${i <= step ? 'text-brand-700 dark:text-brand-300' : 'text-surface-400'}`}>
                  {t(s.label)}
                </span>
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <Input label={t('onboard.yourEmail')} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Button className="w-full" size="lg" loading={busy} onClick={sendCode}>{t('onboard.sendCode')}</Button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <Input label={t('onboard.codeLabel')} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="——————" />
              <Button className="w-full" size="lg" loading={busy} onClick={verify}>{t('onboard.verifyEmail')}</Button>
              <button className="w-full text-center text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300" onClick={sendCode}>
                {t('onboard.resend')}
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <Input label={t('onboard.choosePassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                hint={t('auth.passwordRule')} />
              <Button className="w-full" size="lg" variant="gold" loading={busy} onClick={setNewPassword}>
                {t('onboard.setAndContinue')}
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-5 text-center text-[11px] uppercase tracking-[0.3em] text-gold-400/80">Rise to Excellence</p>
      </div>
      <PoweredByVortex />
    </div>
  );
}
