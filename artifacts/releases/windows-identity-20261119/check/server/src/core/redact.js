const SENSITIVE_QUERY_KEYS = ['token', 'code', 'refreshToken'];

/** Strip secret-bearing query values from a URL before it reaches a log line. */
const redactUrl = (url = '') => {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const base = url.slice(0, q);
  const params = url.slice(q + 1).split('&').map((pair) => {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    return SENSITIVE_QUERY_KEYS.includes(key) ? `${key}=[redacted]` : pair;
  });
  return `${base}?${params.join('&')}`;
};

module.exports = { redactUrl, SENSITIVE_QUERY_KEYS };
