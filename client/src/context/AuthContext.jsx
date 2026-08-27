import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { bootstrapSession } from '../api/axios';
import { setAccessToken, clearAccessToken } from '../api/token';
import { getDeviceId, getFingerprint } from '../api/fingerprint';

const AuthContext = createContext(null);

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

  const applyAuth = useCallback((data) => {
    setAccessToken(data.accessToken);
    localStorage.setItem('lms_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (username, password, rememberMe) => {
    const fingerprint = await getFingerprint();
    const { data } = await api.post('/auth/login', {
      username, password, rememberMe, deviceId: getDeviceId(), fingerprint,
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
    localStorage.removeItem('lms_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, refreshProfile, applyAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
