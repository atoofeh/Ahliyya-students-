import { useEffect, useState } from 'react';
import { Users, BookOpen, MonitorSmartphone, LogIn, FileWarning, HardDrive } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, AreaChart, Area } from 'recharts';
import api from '../../api/axios';
import { useTheme } from '../../hooks/useTheme';
import { Card, StatCard, EmptyState, Badge, PageIntro, SectionTitle } from '../../components/ui';
import { SkeletonCard } from '../../components/Skeletons';

/* Chart series colors — CVD-validated pairs (dataviz six-checks) per surface. */
const CHART = {
  light: { success: '#3A68AF', failed: '#E15E6E', grid: '#DFE7F0', axis: '#94A6BC', bar: '#3A68AF' },
  dark: { success: '#5C89C9', failed: '#D9556D', grid: '#2E4160', axis: '#647892', bar: '#5C89C9' },
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-surface-200/80 bg-white/95 px-3.5 py-2.5 text-xs shadow-float backdrop-blur dark:border-surface-700 dark:bg-surface-900/95">
      <p className="mb-1.5 font-bold text-surface-900 dark:text-white">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 py-0.5 text-surface-600 dark:text-surface-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="capitalize">{p.name}</span>
          <span className="ms-auto ps-4 font-bold text-surface-900 dark:text-white">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function ChartLegend({ items }) {
  return (
    <div className="mb-1 flex items-center gap-4 text-xs text-surface-500 dark:text-surface-400">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const { isDark } = useTheme();
  const C = CHART[isDark ? 'dark' : 'light'];

  useEffect(() => {
    api.get('/analytics/admin').then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return <SkeletonCard />;
  const { users, courses, activity, storage, popularCourses, loginTrend, deviceStats } = data;

  // Build login trend series: day → { success, failed }
  const trendByDay = {};
  for (const row of loginTrend || []) {
    const day = row._id.day.slice(5);
    trendByDay[day] = trendByDay[day] || { day, success: 0, failed: 0 };
    trendByDay[day][row._id.success ? 'success' : 'failed'] = row.count;
  }
  const trend = Object.values(trendByDay);

  const storageTotal = (storage || []).reduce((s, x) => s + (x.bytes || 0), 0);

  return (
    <div className="space-y-6">
      <PageIntro title="Platform overview" subtitle="Live operational metrics across Students_Alahliyya." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard icon={<Users size={20} />} label="Users" value={users.total}
          sub={`${users.byRole.student || 0} students · ${users.byRole.teacher || 0} teachers`} />
        <StatCard icon={<BookOpen size={20} />} label="Courses" value={courses.total} sub={`${courses.published} published`} color="green" />
        <StatCard icon={<MonitorSmartphone size={20} />} label="Active sessions" value={activity.activeSessions} color="sky" />
        <StatCard icon={<LogIn size={20} />} label="Logins (7d)" value={activity.logins7d} color="primary" />
        <StatCard icon={<FileWarning size={20} />} label="Cheat events (7d)" value={activity.cheat7d} color="rose" />
        <StatCard icon={<HardDrive size={20} />} label="Storage" value={`${(storageTotal / 1073741824).toFixed(2)} GB`} color="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Login activity" subtitle="Last 14 days"
            action={<ChartLegend items={[['Successful', C.success], ['Failed', C.failed]]} />} />
          {trend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.success} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.failed} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={C.failed} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: C.axis }} dy={6} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: C.axis }} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: C.axis, strokeDasharray: '4 4', strokeOpacity: 0.5 }} />
                <Area type="monotone" dataKey="success" name="successful" stroke={C.success} strokeWidth={2}
                  fill="url(#gradSuccess)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? '#101F38' : '#fff' }} />
                <Area type="monotone" dataKey="failed" name="failed" stroke={C.failed} strokeWidth={2}
                  fill="url(#gradFailed)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? '#101F38' : '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No login data yet" />}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Devices" subtitle="30-day sessions by OS" />
          {deviceStats?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deviceStats.map((d) => ({ os: d._id || 'Unknown', sessions: d.count }))}
                margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke={C.grid} strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="os" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: C.axis }} dy={6} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: C.axis }} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: C.grid, fillOpacity: 0.35 }} />
                <Bar dataKey="sessions" fill={C.bar} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No session data yet" />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Most popular courses" subtitle="By enrollment" />
          {popularCourses?.length ? popularCourses.map((c, i) => (
            <div key={c._id} className="flex items-center gap-3 border-b border-surface-100 py-2.5 last:border-0 dark:border-surface-700">
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-extrabold ${
                i === 0 ? 'bg-gold-gradient text-brand-950'
                : i === 1 ? 'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-200'
                : 'bg-surface-100 text-surface-400 dark:bg-surface-800'}`}>
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-surface-700 dark:text-surface-200">{c.title}</span>
              <Badge color="primary">{c.students} students</Badge>
            </div>
          )) : <EmptyState title="No enrollments yet" />}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Account health" subtitle="Roles and account states" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[['Admins', users.byRole.admin || 0, 'text-brand-600 dark:text-brand-300'],
              ['Teachers', users.byRole.teacher || 0, 'text-sky-600 dark:text-sky-300'],
              ['Students', users.byRole.student || 0, 'text-emerald-600 dark:text-emerald-300'],
              ['Suspended', users.suspended, 'text-amber-600 dark:text-amber-300'],
              ['Banned', users.banned, 'text-rose-600 dark:text-rose-300'],
              ['Attempts (7d)', activity.attempts7d, 'text-surface-700 dark:text-surface-200']].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-surface-100 bg-surface-50 p-3 dark:border-surface-700/60 dark:bg-surface-800/60">
                <p className={`font-display text-xl font-extrabold ${tone}`}>{value}</p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-surface-400">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
