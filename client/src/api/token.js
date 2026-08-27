/**
 * The access token lives only in memory. A page reload gets a new one from
 * the httpOnly refresh cookie (see bootstrapSession in axios.js). Nothing
 * token-related is ever written to localStorage.
 */
let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };

// Remove tokens persisted by earlier versions of the client.
try {
  localStorage.removeItem('lms_access_token');
  localStorage.removeItem('lms_refresh_token');
} catch { /* storage unavailable */ }
