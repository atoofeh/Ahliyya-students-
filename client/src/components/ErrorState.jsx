import { RefreshCw } from 'lucide-react';
import { Button, Card } from './ui';
import { errorCopy } from './errorCopy';
import { useLanguage } from '../hooks/useLanguage';

/** Failure state for a page or panel: what happened, in the user's words, plus one way forward. */
export default function ErrorState({ code, message, onRetry, compact = false }) {
  const { t } = useLanguage();
  const { icon: Icon, title, body } = errorCopy(code, message, t);
  const content = (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6' : 'py-14'}`}>
      <span className="mb-3 rounded-full bg-rose-50 p-3.5 text-rose-500 dark:bg-rose-900/30 dark:text-rose-300">
        <Icon size={compact ? 20 : 26} />
      </span>
      <p className="font-display font-semibold text-surface-800 dark:text-surface-100">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-surface-500">{body}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw size={14} /> {t('common.retry')}</Button>}
    </div>
  );
  return compact ? content : <Card>{content}</Card>;
}
