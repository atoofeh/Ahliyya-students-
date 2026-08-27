/**
 * Authenticated file downloads.
 *
 * `GET /files/:id/content` is behind `authenticate`, which reads the Bearer
 * header only — a plain `<a href>` sends no Authorization header and the refresh
 * cookie is path-scoped to /api/v1/auth, so anchor links to that route always
 * came back 401. Everything goes through axios instead.
 *
 * Web:    blob -> object URL -> a[download] -> revoke.
 * Native: blob -> base64 -> Filesystem cache -> system viewer via LmsNative.
 */
import api from './axios';
import { isNative, openFile } from './native';

/** Strips characters Android and Windows reject in filenames. */
const safeName = (name, fallback = 'download') => {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || fallback;
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the downloaded file'));
    // result is "data:<mime>;base64,<payload>" — Filesystem wants only the payload.
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });

/**
 * Download a file asset and hand it to the user.
 * @param {string} fileId  FileAsset id
 * @param {string} filename  suggested name, e.g. "week-3-notes.pdf"
 * @returns {Promise<void>} rejects with the axios error so callers can use apiError()
 */
export async function downloadFile(fileId, filename) {
  const { data: blob } = await api.get(`/files/${fileId}/content?download=1`, { responseType: 'blob' });
  const name = safeName(filename);

  if (!isNative) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next task so the navigation has started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }

  // Imported here, not at module scope, so the web bundle never carries it.
  const { Directory, Filesystem } = await import('@capacitor/filesystem');
  const base64 = await blobToBase64(blob);
  // Cache, not Documents: course material stays inside the app sandbox, and the
  // OS reclaims it. The FileProvider grants the viewer read access for one intent.
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  await openFile(uri, blob.type || 'application/octet-stream');
}
