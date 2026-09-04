import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, CheckCheck, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import {
  notifyOnDevice, onNotificationTap, notificationState,
  requestNotificationPermission, openSystemNotificationSettings,
} from '../api/deviceNotifications';
import { Button, EmptyState, Spinner } from './ui';

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/**
 * Remembering which notifications already reached the phone, per account, so a
 * reload does not replay yesterday's alerts. A per-viewer convenience only —
 * losing it costs at most one repeated notification.
 */
const SEEN_KEY = (userId) => `lms.notified.${userId}`;
const readSeen = (userId) => {
  try { return localStorage.getItem(SEEN_KEY(userId)) || null; } catch { return null; }
};
const writeSeen = (userId, iso) => {
  try { localStorage.setItem(SEEN_KEY(userId), iso); } catch { /* private mode — alerts may repeat */ }
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const lastCount = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  // 'unsupported' on the web; 'granted' | 'prompt' | 'denied' on a phone.
  const [phone, setPhone] = useState('unsupported');

  /**
   * Raise a phone notification for anything unread that arrived since the last
   * one we announced. Runs only when the unread count actually grew, so the
   * poll costs one request as before in the common case.
   *
   * The marker only advances when the phone actually accepted the alerts. If
   * permission is still missing, these items stay unannounced and go out on the
   * poll after the user turns notifications on — rather than being marked as
   * announced and lost, which is what made the feature look broken.
   */
  const announceNew = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get('/notifications', { params: { limit: 10, unreadOnly: true } });
      const seen = readSeen(userId);
      const fresh = data.items.filter((n) => !seen || new Date(n.createdAt) > new Date(seen));
      if (fresh.length === 0) return;
      if (await notifyOnDevice(fresh)) writeSeen(userId, fresh[0].createdAt);
    } catch { /* the bell still works without the phone alert */ }
  }, [userId]);

  const loadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setCount(data.count);
      const grew = lastCount.current !== null && data.count > lastCount.current;
      lastCount.current = data.count;
      if (grew) await announceNew();
    } catch { /* offline — the next tick tries again */ }
  }, [announceNew]);

  useEffect(() => {
    const first = setTimeout(loadCount, 0);
    const interval = setInterval(loadCount, 30000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [loadCount]);

  // Tapping a phone notification opens the thing it is about.
  useEffect(() => {
    let dispose;
    onNotificationTap(navigate).then((fn) => { dispose = fn; });
    return () => { if (dispose) dispose(); };
  }, [navigate]);

  // Whether this phone will show notifications. Re-checked whenever the panel
  // opens, so returning from the system settings updates the card.
  useEffect(() => {
    const t = setTimeout(() => { notificationState().then(setPhone); }, 0);
    return () => clearTimeout(t);
  }, []);

  const turnOnPhoneAlerts = async () => {
    // Android only shows its dialog while it still has one to give; after a
    // refusal the settings screen is the only route.
    const next = phone === 'denied'
      ? (await openSystemNotificationSettings(), await notificationState())
      : await requestNotificationPermission();
    setPhone(next);
  };

  // The moment the phone will accept notifications, deliver whatever was held
  // back while it would not — whether permission was granted from the card
  // above or from the system settings.
  useEffect(() => {
    if (phone !== 'granted') return undefined;
    const t = setTimeout(announceNew, 0);
    return () => clearTimeout(t);
  }, [phone, announceNew]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openPanel = async () => {
    setOpen((o) => !o);
    if (!open) {
      notificationState().then(setPhone); // may have changed in the system settings
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
    lastCount.current = 0;
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

          {/* Asking here, where the user came looking for notifications, instead
              of throwing the system dialog at them mid-task. */}
          {(phone === 'prompt' || phone === 'denied') && (
            <div className="border-b border-surface-200 bg-brand-50/60 px-4 py-3 dark:border-surface-700 dark:bg-brand-900/20">
              <p className="flex items-center gap-2 text-sm font-semibold text-surface-800 dark:text-surface-100">
                <Smartphone size={15} /> Alerts on this phone are off
              </p>
              <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                {phone === 'denied'
                  ? 'Notifications were turned off for this app. Android will not ask again, so turn them back on in settings.'
                  : 'Turn them on and this phone will alert you when a student asks a question, while the app is running.'}
              </p>
              <Button size="sm" className="mt-2" onClick={turnOnPhoneAlerts}>
                {phone === 'denied' ? 'Open notification settings' : 'Turn on phone alerts'}
              </Button>
            </div>
          )}
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
