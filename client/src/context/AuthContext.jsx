import { useState, useEffect, useCallback } from 'react';
import { AuthContext } from '../hooks/useAuth';
import api, { bootstrapSession } from '../api/axios';
import { setAccessToken, clearAccessToken, saveRefreshToken, clearRefreshToken } from '../api/token';
import { resolveDeviceId, getFingerprint } from '../api/fingerprint';



const readCachedUser = () => {
  try { return JSON.parse(localStorage.getItem('lms_user')) || null; } catch { return null; }
};

export function AuthProvider({ children }) {
  // Cached profile paints immediately; the cookie refresh below re-validates it.
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bootstrapSession()
      .then((u) => {
        setUser(u);
        if (u) localStorage.setItem('lms_user', JSON.stringify(u));
        else localStorage.removeItem('lms_user');
      })
      .finally(() => setLoading(false));
  }, []);

  // On native the server also returns the refresh token in the body; it goes
  // straight into the Keystore. On web the field is absent — there the refresh
  // token is an httpOnly cookie the page never sees.
  const applyAuth = useCallback(async (data) => {
    setAccessToken(data.accessToken);
    if (data.refreshToken) await saveRefreshToken(data.refreshToken);
    localStorage.setItem('lms_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (username, password, rememberMe) => {
    const [deviceId, fingerprint] = await Promise.all([resolveDeviceId(), getFingerprint()]);
    const { data } = await api.post('/auth/login', {
      username, password, rememberMe, deviceId, fingerprint,
    });
    return applyAuth(data);
  }, [applyAuth]);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data);
    localStorage.setItem('lms_user', JSON.stringify(data));
    return data;
  }, []);

  const logout = useCallback(async ({ forgetDevice = false } = {}) => {
    try { await api.post('/auth/logout', { forgetDevice }); } catch { /* session may already be gone */ }
    clearAccessToken();
    await clearRefreshToken();
    localStorage.removeItem('lms_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, refreshProfile, applyAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

