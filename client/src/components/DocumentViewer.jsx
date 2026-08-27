import { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import api, { apiError } from '../api/axios';
import { isNative } from '../api/native';
import { Card, Button, Skeleton } from './ui';
import ErrorState from './ErrorState';
import DownloadButton from './DownloadButton';

/**
 * Renders a lesson document.
 *
 * PDFs are fetched with the access token and shown from an object URL — the
 * previous `<iframe src="…/files/:id/content">` sent no Authorization header, so
 * it only ever loaded a 401 page. Android WebViews have no inline PDF renderer
 * at all, so on native every document opens in the system viewer instead.
 */
export default function DocumentViewer({ fileAsset, title }) {
  const isPdf = fileAsset.mimeType === 'application/pdf';
  const inlinePdf = isPdf && !isNative;

  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!inlinePdf) return undefined;
    setError(null);
    let url = null;
    try {
      const { data: blob } = await api.get(`/files/${fileAsset._id}/content`, { responseType: 'blob' });
      url = URL.createObjectURL(blob);
      setSrc(url);
    } catch (err) {
      setError({ code: err.response?.data?.code, message: apiError(err, 'This document could not be loaded') });
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [inlinePdf, fileAsset._id]);

  useEffect(() => {
    let revoke;
    const t = setTimeout(() => { load().then((fn) => { revoke = fn; }); }, 0);
    return () => { clearTimeout(t); if (revoke) revoke(); };
  }, [load]);

  if (!inlinePdf) {
    return (
      <Card>
        <div className="p-6 text-center">
          <FileText size={36} className="mx-auto mb-2 text-surface-400" />
          <p className="mb-3 text-sm text-surface-500">{fileAsset.originalName}</p>
          <DownloadButton as={Button} variant="outline" showIcon={false}
            fileId={fileAsset._id} filename={fileAsset.originalName}>
            Open document
          </DownloadButton>
        </div>
      </Card>
    );
  }

  if (error) return <ErrorState code={error.code} message={error.message} onRetry={load} />;

  return (
    <Card className="overflow-hidden">
      {src
        ? <iframe title={title} src={`${src}#toolbar=0`} className="h-[60vh] w-full lg:h-[75vh]" />
        : <Skeleton className="h-[60vh] w-full lg:h-[75vh]" />}
    </Card>
  );
}
