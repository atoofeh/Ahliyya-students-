import { useEffect, useState } from 'react';
import { Save, ShieldCheck, Timer, Video, Wrench, Lock } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Input, Select, Toggle, Spinner } from '../../components/ui';

export default function AdminSettings() {
  const toast = useToast();
  const { user } = useAuth();
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
      };
      // Owner-only keys are rejected server-side for admins; never send them.
      if (!isOwner) for (const k of ownerOnly) delete payload[k];
      const { data } = await api.put('/admin/settings', payload);
      setSettings(data.settings);
      toast.success('Settings saved — applied platform-wide within seconds');
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  if (!settings) return <Spinner full />;
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }));
  const lock = (k) => !isOwner && ownerOnly.includes(k);
  const ownerTag = isOwner ? null : (
    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">
      <Lock size={10} /> Owner setting
    </span>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Platform settings</h1>
          <p className="text-sm text-surface-500">Changes apply to all users within ~15 seconds (settings cache TTL).</p>
        </div>
        <Button loading={busy} onClick={save}><Save size={15} /> Save all</Button>
      </div>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Wrench size={16} /> General</p>
        <Input label="Platform name" value={settings.platformName} onChange={set('platformName')} />
        <Toggle label="Maintenance mode" hint="Blocks all non-admin access immediately"
          checked={!!settings.maintenanceMode} onChange={setBool('maintenanceMode')} />
        <Input label="Maintenance message" value={settings.maintenanceMessage} onChange={set('maintenanceMessage')} />
        <Toggle label="Open enrollment" hint="Allow students to enroll in courses (codes still work when off... admins can always assign)"
          checked={!!settings.enrollmentOpen} onChange={setBool('enrollmentOpen')} />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100">
          <Timer size={16} /> Sessions & authentication {ownerTag}
        </p>
        <Select label="Inactivity timeout" value={String(settings.sessionTimeoutMinutes)} onChange={set('sessionTimeoutMinutes')}
          disabled={lock('sessionTimeoutMinutes')}
          options={[15, 30, 60, 120].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Max failed logins before lockout" type="number" min="3" max="20" disabled={lock('maxLoginAttempts')}
            value={settings.maxLoginAttempts} onChange={set('maxLoginAttempts')} />
          <Input label="Lockout duration (minutes)" type="number" min="1" max="1440" disabled={lock('lockoutMinutes')}
            value={settings.lockoutMinutes} onChange={set('lockoutMinutes')} />
        </div>
        <Toggle label="Require email verification" checked={!!settings.requireEmailVerification}
          onChange={lock('requireEmailVerification') ? () => {} : setBool('requireEmailVerification')} />
        <Toggle label="One authorized device per account"
          hint="A second device is refused until an administrator revokes the first one. Sessions stay pinned to their device either way."
          checked={!!settings.deviceBindingEnabled}
          onChange={lock('deviceBindingEnabled') ? () => {} : setBool('deviceBindingEnabled')} />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Video size={16} /> Content protection</p>
        <Toggle label="Recording protection" hint="Player-level deterrents: pause on tab-hide, PiP & download disabled"
          checked={!!settings.recordingProtection} onChange={setBool('recordingProtection')} />
        <Toggle label="Screenshot protection" hint="Blocks PrintScreen shortcut & clipboard during quizzes (best-effort — see security docs)"
          checked={!!settings.screenshotProtection} onChange={setBool('screenshotProtection')} />
        <Toggle label="Dynamic video watermark" hint="Overlays student name & ID on every video"
          checked={!!settings.watermarkEnabled} onChange={setBool('watermarkEnabled')} />
        <Toggle label="Include IP address in watermark" checked={!!settings.watermarkShowIp}
          onChange={setBool('watermarkShowIp')} />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><ShieldCheck size={16} /> Anti-cheat & storage</p>
        <Toggle label="Anti-cheat system" checked={!!settings.antiCheatEnabled} onChange={setBool('antiCheatEnabled')} />
        <Select label="Anti-cheat strictness" value={settings.antiCheatStrictness} onChange={set('antiCheatStrictness')}
          options={[{ value: 'low', label: 'Low (0.5× weights)' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High (1.5× weights)' }]} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Max upload (MB)" type="number" min="10" value={settings.maxUploadMb} onChange={set('maxUploadMb')} />
          <Input label="Storage quota (GB)" type="number" min="1" value={settings.storageQuotaGb} onChange={set('storageQuotaGb')} />
          <Input label="Default quiz retakes" type="number" min="0" value={settings.defaultQuizRetakeLimit} onChange={set('defaultQuizRetakeLimit')} />
        </div>
      </Card>
    </div>
  );
}
