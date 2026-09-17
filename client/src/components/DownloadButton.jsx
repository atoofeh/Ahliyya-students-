import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { downloadFile } from '../api/download';
import { apiError } from '../api/axios';
import { useToast } from '../hooks/useToast';

/**
 * Downloads a protected file asset. Always a button, never a link: the route
 * needs an Authorization header, which an anchor cannot send — see api/download.js.
 *
 * `as` lets a caller render it as the design-system Button while keeping this
 * component's fetch, busy state and error handling.
 */
export default function DownloadButton({
  fileId, filename, as: Component = 'button',
  showIcon = true, className = '', children, ...rest
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await downloadFile(fileId, filename);
    } catch (err) {
      toast.error(apiError(err, 'That file could not be downloaded'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Component type="button" onClick={run} disabled={busy} className={className} {...rest}>
      {showIcon && (busy
        ? <Loader2 size={13} className="me-1 inline animate-spin" aria-hidden="true" />
        : <Download size={13} className="me-1 inline" aria-hidden="true" />)}
      {children}
    </Component>
  );
}
