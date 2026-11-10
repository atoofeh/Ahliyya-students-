import { useCallback, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmContext } from '../hooks/useConfirm';
import { useLanguage } from '../hooks/useLanguage';
import { Button, Modal } from '../components/ui';

/**
 * The one "are you sure?" dialog, for every destructive action in the app.
 *
 * A promise is held open while the dialog is on screen and settled by whichever
 * way it closes, so a caller reads top to bottom:
 *
 *   if (!(await confirm(t('cur.confirmDeleteSection')))) return;
 *   await api.delete(...);
 */
export function ConfirmProvider({ children }) {
  const { t } = useLanguage();
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    const next = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      // A second call while one is open answers the first with "no" rather than
      // leaving its promise hanging for the life of the page.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setRequest(next);
    });
  }, []);

  const settle = useCallback((answer) => {
    setRequest(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(answer);
  }, []);

  const tone = request?.tone || 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!request}
        onClose={() => settle(false)}
        title={request?.title || t('confirm.title')}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            {tone === 'danger' && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertTriangle size={18} aria-hidden="true" />
              </span>
            )}
            <p dir="auto" className="text-sm leading-relaxed text-surface-600 dark:text-surface-300">
              {request?.message}
            </p>
          </div>
          {/* The confirming button sits last so the thumb does not rest on it,
              and cancelling takes the focus the dialog opens with. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => settle(false)} autoFocus>
              {request?.cancelLabel || t('common.cancel')}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {request?.confirmLabel || t('confirm.ok')}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
