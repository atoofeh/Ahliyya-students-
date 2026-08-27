/**
 * Stable device identity for the single-session policy.
 * - deviceId: random UUID persisted in localStorage (per browser profile)
 * - fingerprint: hash of browser characteristics, sent with every request so
 *   the server can flag token theft across differing environments.
 */
export function getDeviceId() {
  let id = localStorage.getItem('lms_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('lms_device_id', id);
  }
  return id;
}

let cachedFingerprint = null;

export async function getFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;
  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency,
    screen.width, screen.height, screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.platform || '',
    navigator.maxTouchPoints,
  ];

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('lms-fingerprint', 2, 15);
    parts.push(canvas.toDataURL());
  } catch { /* canvas blocked — fingerprint still works from other signals */ }

  const data = new TextEncoder().encode(parts.join('||'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  cachedFingerprint = Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return cachedFingerprint;
}
