import { useEffect, useState, useCallback } from 'react';
import { Wallet, Users, TriangleAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api, { apiError } from '../../../api/axios';
import { useLanguage } from '../../../hooks/useLanguage';
import { packageOf, money } from '../../../utils/packages';
import { Card, Badge, EmptyState } from '../../../components/ui';
import { SkeletonCard } from '../../../components/Skeletons';
import ErrorState from '../../../components/ErrorState';

/**
 * What this course has taken in, split by what students bought.
 *
 * Administrators and the owner only. The server refuses this endpoint to a
 * teacher, so a teacher reaching the tab by URL sees the refusal rather than
 * the numbers — the tab being hidden is convenience, not the control.
 */
export default function PaymentsTab({ courseId }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/enrollments/courses/${courseId}/revenue`);
      setError(null);
      setData(res.data);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err) });
    }
  }, [courseId]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;
  if (!data) return <SkeletonCard lines={6} />;

  const { totals, byPackage, monthly, course } = data;
  const cur = course.currency;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-surface-400">
            <Wallet size={13} /> Collected
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-surface-900 dark:text-white">
            {money(totals.collected, cur)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-surface-400">
            <Users size={13} /> Students
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-surface-900 dark:text-white">{totals.students}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-400">{t('pay.avgPerStudent')}</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-surface-900 dark:text-white">
            {money(totals.average, cur)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-surface-400">
            <TriangleAlert size={13} className={totals.unrecorded ? 'text-amber-500' : ''} /> Nothing recorded
          </p>
          <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${totals.unrecorded ? 'text-amber-600 dark:text-amber-400' : 'text-surface-900 dark:text-white'}`}>
            {totals.unrecorded}
          </p>
          {totals.unrecorded > 0 && (
            <p className="mt-1 text-xs text-surface-400">
              {totals.unrecorded === 1 ? 'One student has' : `${totals.unrecorded} students have`} no amount against their name.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('pay.byPackage')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs uppercase text-surface-400">
                <th className="py-2">{t('pay.package')}</th>
                <th className="py-2 text-end">{t('pay.students')}</th>
                <th className="py-2 text-end">{t('pay.collected')}</th>
                <th className="py-2 text-end">{t('pay.average')}</th>
              </tr>
            </thead>
            <tbody>
              {byPackage.map((row) => {
                const pkg = packageOf(row.package);
                return (
                  <tr key={row.package} className="border-t border-surface-100 dark:border-surface-700">
                    <td className="py-2.5"><Badge color={pkg.color}>{t(pkg.key)}</Badge></td>
                    <td className="py-2.5 text-end tabular-nums text-surface-700 dark:text-surface-200">{row.students}</td>
                    <td className="py-2.5 text-end tabular-nums font-semibold text-surface-800 dark:text-surface-100">{money(row.collected, cur)}</td>
                    <td className="py-2.5 text-end tabular-nums text-surface-500">{row.students ? money(row.average, cur) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-surface-200 dark:border-surface-600">
                <td className="py-2.5 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('pay.total')}</td>
                <td className="py-2.5 text-end tabular-nums font-semibold text-surface-800 dark:text-surface-100">{totals.students}</td>
                <td className="py-2.5 text-end tabular-nums font-semibold text-surface-900 dark:text-white">{money(totals.collected, cur)}</td>
                <td className="py-2.5 text-end tabular-nums text-surface-500">{money(totals.average, cur)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-surface-800 dark:text-surface-100">{t('pay.byMonth')}</p>
        {monthly.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly.map((m) => ({ month: m.month.slice(2), collected: m.collected, students: m.students }))}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v, name) => (name === 'collected' ? money(v, cur) : v)} />
              <Bar dataKey="collected" fill="#3A68AF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState title={t('pay.noEnrolments')} />}
      </Card>

      <p className="text-xs text-surface-400">
        Students who were removed still count towards what was collected — the money was taken — but not towards the head count.
        Teachers never see any of this; they see only which package each student took.
      </p>
    </div>
  );
}
