import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Button, EmptyState, Spinner } from './ui';

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();

  const loadCount = useCallback(() => {
    api.get('/notifications/unread-count').then(({ data }) => setCount(data.count)).catch(() => {});
  }, []);

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, [loadCount]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openPanel = async () => {
    setOpen((o) => !o);
    if (!open) {
      const { data } = await api.get('/notifications?limit=15');
      setItems(data.items);
    }
  };

  const clickItem = async (n) => {
    if (!n.readAt) {
      await api.post(`/notifications/${n._id}/read`).catch(() => {});
      loadCount();
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    setItems((it) => it?.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setCount(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={openPanel} aria-label="Notifications"
        className="relative rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:text-surface-300">
        <Bell size={19} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 px-4 py-2.5">
            <span className="text-sm font-semibold text-surface-800 dark:text-surface-100">Notifications</span>
            <Button size="sm" variant="ghost" onClick={markAll}><CheckCheck size={14} /> Mark all read</Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!items ? <div className="p-6 text-center"><Spinner /></div>
              : items.length === 0 ? <EmptyState title="No notifications yet" />
              : items.map((n) => (
                <button key={n._id} onClick={() => clickItem(n)}
                  className={`block w-full border-b border-surface-100 dark:border-surface-700/50 px-4 py-3 text-left hover:bg-surface-50 dark:hover:bg-surface-700/50 ${!n.readAt ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{n.title}</p>
                    {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-surface-500">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-surface-400">{timeAgo(n.createdAt)}</p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
