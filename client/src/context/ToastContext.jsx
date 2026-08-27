import { useState, useCallback, useMemo, useRef } from 'react';
import { ToastContext } from '../hooks/useToast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';



const ICONS = {
  success: <CheckCircle2 size={18} className="text-emerald-500" />,
  error: <AlertCircle size={18} className="text-rose-500" />,
  info: <Info size={18} className="text-sky-500" />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-4), { id, message, type }]);
    if (duration) setTimeout(() => remove(id), duration);
  }, [remove]);

  // Memoised: consumers keep it in effect dependency lists (NativeShell installs
  // the Android back-button handler once), and every consumer re-rendered on each
  // provider render without it.
  const value = useMemo(() => ({
    toast,
    success: (m) => toast(m, 'success'),
    error: (m) => toast(m, 'error', 6000),
    info: (m) => toast(m, 'info'),
  }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id}
            className="flex items-start gap-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-lg px-4 py-3 text-sm text-surface-800 dark:text-surface-100 animate-slide-up">
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-surface-400 hover:text-surface-600">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

