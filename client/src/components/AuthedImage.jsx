import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { Skeleton } from './ui';

/**
 * An image held in the file store.
 *
 * `GET /files/:id/content` sits behind `authenticate`, and a plain `<img src>`
 * sends neither the Authorization header nor `x-device-id` — it only ever loads
 * a 401, which is why question images never appeared. Fetch the bytes through
 * the API client and render them from an object URL, the same way
 * DocumentViewer does for PDFs.
 */
export default function AuthedImage({ fileId, alt = '', className = '' }) {
  // Keyed by fileId so a change never shows the previous question's picture.
  const [loaded, setLoaded] = useState({ id: null, src: null, failed: false });

  const load = useCallback(async () => {
    if (!fileId) return undefined;
    let url = null;
    try {
      const { data: blob } = await api.get(`/files/${fileId}/content`, { responseType: 'blob' });
      url = URL.createObjectURL(blob);
      setLoaded({ id: fileId, src: url, failed: false });
    } catch {
      setLoaded({ id: fileId, src: null, failed: true });
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [fileId]);

  useEffect(() => {
    let revoke;
    const t = setTimeout(() => { load().then((fn) => { revoke = fn; }); }, 0);
    return () => { clearTimeout(t); if (revoke) revoke(); };
  }, [load]);

  if (!fileId) return null;
  const current = loaded.id === fileId ? loaded : { src: null, failed: false };
  if (current.failed) {
    return <p className={`text-xs text-surface-400 ${className}`}>Image unavailable</p>;
  }
  if (!current.src) return <Skeleton className={className || 'h-24 w-32'} />;
  return <img src={current.src} alt={alt} className={className} />;
}
