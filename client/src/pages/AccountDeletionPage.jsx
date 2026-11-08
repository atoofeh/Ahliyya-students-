import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Trash2 } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { useToast } from '../hooks/useToast';
import { useLanguage } from '../hooks/useLanguage';
import { Card, Button, Textarea, Modal, Badge } from '../components/ui';

export default function AccountDeletionPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [request, setRequest] = useState(null);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/account/deletion-request');
      setRequest(data.request);
      setError('');
    } catch (err) {
      setError(apiError(err));
    }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/account/deletion-request', { reason: reason.trim() || undefined });
      setRequest(data.request);
      setConfirmOpen(false);
      toast.success(t('account.deleteRequestSent'));
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('account.deleteTitle')}</h1>
        <p className="mt-1 text-sm text-surface-500">{t('account.deleteIntro')}</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="space-y-2 text-sm text-surface-600 dark:text-surface-300">
            <p>{t('account.deleteConsequence')}</p>
            <p>{t('account.deleteManual')}</p>
          </div>
        </div>

        {request?.status === 'open' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-center gap-2">
              <Badge color="amber"><Clock3 size={12} className="me-1 inline" />{t('account.deletePending')}</Badge>
              <span className="text-xs text-surface-500">{new Date(request.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-2 text-sm text-surface-700 dark:text-surface-200">{t('account.deletePendingHint')}</p>
          </div>
        ) : request?.status === 'completed' ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle2 size={16} className="me-1 inline" />{t('account.deleteCompleted')}
          </div>
        ) : (
          <>
            {request?.status === 'dismissed' && (
              <p className="rounded-xl bg-surface-100 p-3 text-sm text-surface-600 dark:bg-surface-800 dark:text-surface-300">
                {t('account.deleteDismissed', { note: request.resolutionNote || '' })}
              </p>
            )}
            <Textarea
              label={t('account.deleteReason')}
              dir="auto"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('account.deleteReasonHint')}
            />
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={15} /> {t('account.requestDelete')}
            </Button>
          </>
        )}
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('account.confirmDeleteTitle')}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-surface-600 dark:text-surface-300">{t('account.confirmDeleteText')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={busy} onClick={submit}>{t('account.requestDelete')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
