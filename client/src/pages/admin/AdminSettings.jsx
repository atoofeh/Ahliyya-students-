import { useEffect, useState } from 'react';
import { Save, ShieldCheck, Timer, Video, Wrench, Lock } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { Card, Button, Input, Select, Toggle } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

export default function AdminSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const isOwner = user?.role === 'super_admin';
  const [settings, setSettings] = useState(null);
  const [ownerOnly, setOwnerOnly] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      setSettings(data.settings);
      setOwnerOnly(data.ownerOnlyKeys || []);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...settings,
        sessionTimeoutMinutes: Number(settings.sessionTimeoutMinutes),
        maxLoginAttempts: Number(settings.maxLoginAttempts),
        lockoutMinutes: Number(settings.lockoutMinutes),
        maxUploadMb: Number(settings.maxUploadMb),
        storageQuotaGb: Number(settings.storageQuotaGb),
        defaultQuizRetakeLimit: Number(settings.defaultQuizRetakeLimit),
        maxVideoViews: Number(settings.maxVideoViews) || 0,
      };
      // Owner-only keys are rejected server-side for admins; never send them.
      if (!isOwner) for (const k of ownerOnly) delete payload[k];
      const { data } = await api.put('/admin/settings', payload);
      setSettings(data.settings);
      toast.success(t('set.saved'));
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  if (!settings) return <SkeletonCard />;
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }));
  const lock = (k) => !isOwner && ownerOnly.includes(k);
  const ownerTag = isOwner ? null : (
    <span className="ms-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">
      <Lock size={10} /> {t('set.ownerSetting')}
    </span>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('set.title')}</h1>
          <p className="text-sm text-surface-500">{t('set.subtitle')}</p>
        </div>
        <Button loading={busy} onClick={save}><Save size={15} /> {t('set.saveAll')}</Button>
      </div>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Wrench size={16} /> {t('set.general')}</p>
        <Input label={t('set.platformName')} dir="auto" value={settings.platformName} onChange={set('platformName')} />
        <Toggle label={t('set.maintenanceMode')} hint={t('set.maintenanceHint')}
          checked={!!settings.maintenanceMode} onChange={setBool('maintenanceMode')} />
        <Input label={t('set.maintenanceMessage')} dir="auto" value={settings.maintenanceMessage} onChange={set('maintenanceMessage')} />
        <Toggle label={t('set.openEnrollment')} hint={t('set.openEnrollmentHint')}
          checked={!!settings.enrollmentOpen} onChange={setBool('enrollmentOpen')} />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100">
          <Timer size={16} /> {t('set.sessions')} {ownerTag}
        </p>
        <Select label={t('set.inactivityTimeout')} value={String(settings.sessionTimeoutMinutes)} onChange={set('sessionTimeoutMinutes')}
          disabled={lock('sessionTimeoutMinutes')}
          options={[15, 30, 60, 120].map((m) => ({ value: String(m), label: t('set.minutesValue', { n: m }) }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('set.maxFailedLogins')} type="number" min="3" max="20" disabled={lock('maxLoginAttempts')}
            value={settings.maxLoginAttempts} onChange={set('maxLoginAttempts')} />
          <Input label={t('set.lockoutDuration')} type="number" min="1" max="1440" disabled={lock('lockoutMinutes')}
            value={settings.lockoutMinutes} onChange={set('lockoutMinutes')} />
        </div>
        <Toggle label={t('set.requireEmail')} checked={!!settings.requireEmailVerification}
          onChange={lock('requireEmailVerification') ? () => {} : setBool('requireEmailVerification')} />
        <Toggle label={t('set.oneDevice')}
          hint={t('set.oneDeviceHint')}
          checked={!!settings.deviceBindingEnabled}
          onChange={lock('deviceBindingEnabled') ? () => {} : setBool('deviceBindingEnabled')} />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Video size={16} /> {t('set.contentProtection')}</p>
        <Toggle label={t('set.recordingProtection')} hint={t('set.recordingHint')}
          checked={!!settings.recordingProtection} onChange={setBool('recordingProtection')} />
        <Toggle label={t('set.screenshotProtection')} hint={t('set.screenshotHint')}
          checked={!!settings.screenshotProtection} onChange={setBool('screenshotProtection')} />
        <Toggle label={t('set.watermark')} hint={t('set.watermarkHint')}
          checked={!!settings.watermarkEnabled} onChange={setBool('watermarkEnabled')} />
        <Toggle label={t('set.watermarkIp')} checked={!!settings.watermarkShowIp}
          onChange={setBool('watermarkShowIp')} />
        {/* The allowance the server enforces. It had no control here at all,
            so the only way to change it was to edit the database by hand. */}
        <Select label={t('set.watchLimit')} hint={t('set.watchLimitHint')}
          value={String(settings.maxVideoViews ?? 4)} onChange={set('maxVideoViews')}
          options={[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({
            value: String(n),
            label: n === 0 ? t('set.watchLimitOff') : t('set.watchLimitValue', { n }),
          }))} />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><ShieldCheck size={16} /> {t('set.anticheatStorage')}</p>
        <Toggle label={t('set.anticheatSystem')} checked={!!settings.antiCheatEnabled} onChange={setBool('antiCheatEnabled')} />
        <Select label={t('set.strictness')} value={settings.antiCheatStrictness} onChange={set('antiCheatStrictness')}
          options={[{ value: 'low', label: t('set.strictLow') }, { value: 'medium', label: t('set.strictMedium') }, { value: 'high', label: t('set.strictHigh') }]} />
        <div className="grid grid-cols-3 gap-3">
          <Input label={t('set.maxUpload')} type="number" min="10" value={settings.maxUploadMb} onChange={set('maxUploadMb')} />
          <Input label={t('set.storageQuota')} type="number" min="1" value={settings.storageQuotaGb} onChange={set('storageQuotaGb')} />
          <Input label={t('set.defaultRetakes')} type="number" min="0" value={settings.defaultQuizRetakeLimit} onChange={set('defaultQuizRetakeLimit')} />
        </div>
      </Card>
    </div>
  );
}
