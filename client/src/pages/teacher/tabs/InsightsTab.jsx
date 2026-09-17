import { useEffect, useState, useCallback } from 'react';
import { Megaphone, ShieldAlert, Send } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import api, { apiError } from '../../../api/axios';
import { useToast } from '../../../hooks/useToast';
import { Card, Button, Input, Textarea, Badge, EmptyState, Tabs } from '../../../components/ui';
import { SkeletonCard } from '../../../components/Skeletons';
import QaTab from './QaTab';
import PaymentsTab from './PaymentsTab';
import { useAuth } from '../../../hooks/useAuth';
import { useLanguage } from '../../../hooks/useLanguage';
import { isAdminRole } from '../../../utils/roles';

export default function InsightsTab({ courseId }) {
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  // Payments are the institution's business, not the teaching staff's. The
  // server refuses the endpoint to a teacher either way; this just keeps a tab
  // they cannot use out of their way.
  const canSeePayments = isAdminRole(user?.role);
  const [sub, setSub] = useState('analytics');
  const [analytics, setAnalytics] = useState(null);
  const [cheat, setCheat] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [annForm, setAnnForm] = useState({ title: '', body: '' });

  const loadAll = useCallback(() => {
    api.get(`/analytics/courses/${courseId}`).then(({ data }) => setAnalytics(data)).catch(() => setAnalytics({}));
    api.get(`/anticheat/courses/${courseId}`).then(({ data }) => setCheat(data)).catch(() => setCheat({}));
    api.get(`/announcements/courses/${courseId}`).then(({ data }) => setAnnouncements(data.items)).catch(() => setAnnouncements([]));
  }, [courseId]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const postAnnouncement = async () => {
    try {
      await api.post(`/announcements/courses/${courseId}`, annForm);
      toast.success(t('ins.announcementSent'));
      setAnnForm({ title: '', body: '' });
      loadAll();
    } catch (err) { toast.error(apiError(err)); }
  };

  return (
    <div className="space-y-4">
      <Tabs active={sub} onChange={setSub} tabs={[
        { key: 'analytics', label: t('ins.analytics') },
        { key: 'anticheat', label: t('ins.anticheat') },
        { key: 'announcements', label: t('ins.announcements') },
        { key: 'qa', label: t('tab.qa') },
        ...(canSeePayments ? [{ key: 'payments', label: t('ins.payments') }] : []),
      ]} />

      {sub === 'analytics' && (!analytics ? <SkeletonCard lines={6} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ins.progressDist')}</p>
            {analytics.progressDist?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.progressDist.map((b, i) => ({
                  name: ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'][i] || String(b._id), count: b.count,
                }))}>
                  <XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip /><Bar dataKey="count" fill="#3A68AF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title={t('ins.noEnrollmentData')} />}
          </Card>
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ins.dailyActive')}</p>
            {analytics.engagementByDay?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analytics.engagementByDay.map((d) => ({ day: d._id.slice(5), students: d.activeStudents }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip /><Line type="monotone" dataKey="students" stroke="#3A68AF" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState title={t('ins.noActivity')} />}
          </Card>
          <Card className="p-4 lg:col-span-2">
            <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ins.quizPerformance')}</p>
            {analytics.quizPerf?.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-start text-xs uppercase text-surface-400">
                  <th className="py-2">{t('ins.quiz')}</th><th>{t('ins.attempts')}</th><th>{t('ins.average')}</th><th>{t('ins.passRate')}</th></tr></thead>
                <tbody>
                  {analytics.quizPerf.map((q) => (
                    <tr key={q._id} className="border-t border-surface-100 dark:border-surface-700">
                      <td dir="auto" className="py-2 font-medium text-surface-800 dark:text-surface-100">{q.title}</td>
                      <td>{q.attempts}</td>
                      <td>{Math.round(q.avgPercent * 10) / 10}%</td>
                      <td>{Math.round(q.passRate * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState title={t('ins.noAttempts')} />}
          </Card>
        </div>
      ))}

      {sub === 'anticheat' && (!cheat ? <SkeletonCard lines={6} /> : (
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-surface-800 dark:text-surface-100">
              <ShieldAlert size={16} className="text-rose-500" /> {t('ins.flagged')}
            </p>
            {cheat.flagged?.length ? (
              <div className="divide-y divide-surface-100 dark:divide-surface-700">
                {cheat.flagged.map((a) => (
                  <div key={a._id} className="flex items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                        {a.student?.name} — {a.quiz?.title}
                      </p>
                      <p className="text-xs text-surface-400">{t('ins.violations', { violations: a.violationCount, percent: a.percent })}</p>
                    </div>
                    <Badge color={a.riskScore >= 50 ? 'red' : 'amber'}>{t('ins.risk', { n: a.riskScore })}</Badge>
                  </div>
                ))}
              </div>
            ) : <EmptyState title={t('ins.noFlagged')} subtitle={t('ins.noFlaggedHint')} />}
          </Card>
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('ins.recentEvents')}</p>
            {cheat.recentEvents?.items?.length ? (
              <div className="max-h-96 space-y-1 overflow-y-auto text-sm">
                {cheat.recentEvents.items.map((e) => (
                  <div key={e._id} className="flex items-center gap-2 rounded px-2 py-1.5 odd:bg-surface-50 dark:odd:bg-surface-700/30">
                    <Badge color="red"><span dir="ltr">{e.type.replace(/_/g, ' ')}</span></Badge>
                    <span className="text-surface-600 dark:text-surface-300">{e.student?.name}</span>
                    <span className="text-xs text-surface-400">{e.quiz?.title}</span>
                    <span className="ms-auto text-xs text-surface-400">{new Date(e.occurredAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState title={t('ins.noEvents')} />}
          </Card>
        </div>
      ))}

      {sub === 'announcements' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-surface-800 dark:text-surface-100">
              <Megaphone size={16} /> {t('ins.newAnnouncement')}
            </p>
            <Input label={t('ann.titleField')} dir="auto" value={annForm.title} onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))} />
            <Textarea label={t('ann.message')} dir="auto" value={annForm.body} onChange={(e) => setAnnForm((f) => ({ ...f, body: e.target.value }))} />
            <Button onClick={postAnnouncement} disabled={!annForm.title.trim() || !annForm.body.trim()}>
              <Send size={14} /> {t('ins.publishNotify')}
            </Button>
          </Card>
          <div className="space-y-3">
            {!announcements ? <SkeletonCard /> : announcements.length === 0 ? (
              <Card><EmptyState title={t('ins.noAnnouncements')} /></Card>
            ) : announcements.map((a) => (
              <Card key={a._id} className="p-4">
                <p dir="auto" className="font-medium text-surface-900 dark:text-white">{a.title}</p>
                <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm text-surface-500">{a.body}</p>
                <p className="mt-2 text-xs text-surface-400">{new Date(a.publishedAt).toLocaleString()}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {sub === 'qa' && <QaTab courseId={courseId} />}
      {sub === 'payments' && canSeePayments && <PaymentsTab courseId={courseId} />}
    </div>
  );
}
