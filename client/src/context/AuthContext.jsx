import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { getDeviceId, getFingerprint } from '../api/fingerprint';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lms_user')) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('lms_access_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data);
        localStorage.setItem('lms_user', JSON.stringify(data));
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem('lms_user');
        localStorage.removeItem('lms_access_token');
        localStorage.removeItem('lms_refresh_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = useCallback((data) => {
    localStorage.setItem('lms_access_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('lms_refresh_token', data.refreshToken);
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

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* session may already be gone */ }
    localStorage.removeItem('lms_access_token');
    localStorage.removeItem('lms_refresh_token');
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
