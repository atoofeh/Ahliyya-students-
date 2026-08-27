import { useEffect, useState, useCallback } from 'react';
import { MonitorSmartphone, LogOut } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../hooks/useToast';
import { Card, Button, Badge, Spinner, Pagination, EmptyState } from '../../components/ui';

export default function AdminSessions() {
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api.get('/admin/sessions', { params: { page, limit: 25 } }).then(({ data }) => setResult(data)).catch(() => {});
  }, [page]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const terminate = async (session) => {
    try {
      await api.post(`/admin/sessions/${session._id}/terminate`);
      toast.success(`Session for ${session.user?.name} terminated`);
      load();
    } catch (err) { toast.error(apiError(err)); }
  };

  if (!result) return <Spinner full />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Active sessions</h1>
        <p className="text-sm text-surface-500">
          One session per account is enforced platform-wide. Terminating a session logs the device out on its next request.
        </p>
      </div>

      <Card className="overflow-x-auto">
        {result.items.length === 0 ? <EmptyState icon={<MonitorSmartphone size={24} />} title="No active sessions" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700 text-left text-xs uppercase tracking-wide text-surface-400">
                <th className="px-4 py-3">User</th><th className="px-4 py-3">Device</th><th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Signed in</th><th className="px-4 py-3">Last activity</th><th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {result.items.map((s) => (
                <tr key={s._id} className="border-b border-surface-100 dark:border-surface-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-surface-800 dark:text-surface-100">{s.user?.name}</p>
                    <p className="text-xs text-surface-400">@{s.user?.username} · <Badge color="primary">{s.user?.role}</Badge></p>
                  </td>
                  <td className="px-4 py-3 text-surface-600 dark:text-surface-300">
                    {s.browser || 'Unknown browser'}<br />
                    <span className="text-xs text-surface-400">{s.os} · {s.deviceType}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-surface-500">{s.ip}</td>
                  <td className="px-4 py-3 text-surface-400">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-surface-400">{new Date(s.lastActivityAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="danger" onClick={() => terminate(s)}><LogOut size={13} /> Force logout</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pagination meta={result.meta} onPage={setPage} />
    </div>
  );
}
