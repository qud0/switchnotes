import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAuthToken, getAuthToken } from '../api';

const AuthContext = createContext(null);

const DEFAULT_CREDENTIALS = {
  admin: { username: 'admin', password: 'admin123' },
  engineer: { username: 'engineer', password: 'engineer123' },
  viewer: { username: 'viewer', password: 'viewer123' }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Инициализация при загрузке страницы: проверяем сохраненный токен
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const token = getAuthToken();
        if (token) {
          const res = await api.getMe();
          if (res && res.authenticated && res.user && isMounted) {
            setUser(res.user);
            setLoading(false);
            return;
          }
        }

        // Если токена нет или сессия устарела — автоматически авторизуемся под admin по умолчанию,
        // чтобы приложение было готово к работе без необходимости обязательного ввода пароля при первом открытии
        try {
          const auto = await api.login(DEFAULT_CREDENTIALS.admin.username, DEFAULT_CREDENTIALS.admin.password);
          if (auto && auto.user && isMounted) {
            setUser(auto.user);
          }
        } catch {
          // Если сервер оффлайн или пароль изменен, остаемся гостем
          if (isMounted) setUser(null);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    const handleUnauthorized = () => {
      setAuthToken(null);
      setUser(null);
    };
    window.addEventListener('switchbook:unauthorized', handleUnauthorized);

    return () => {
      isMounted = false;
      window.removeEventListener('switchbook:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    setError(null);
    try {
      const data = await api.login(username, password);
      if (data && data.user) {
        setUser(data.user);
        return data.user;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    setUser(null);
  }, []);

  // Быстрое переключение ролей для тестирования и демонстрации
  const switchRoleQuickly = useCallback(async (targetRole) => {
    const creds = DEFAULT_CREDENTIALS[targetRole];
    if (!creds) return;
    try {
      setLoading(true);
      const data = await api.login(creds.username, creds.password);
      if (data && data.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.error(`Ошибка переключения на роль ${targetRole}:`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      if (res && res.authenticated && res.user) {
        setUser(res.user);
      }
    } catch {}
  }, []);

  const role = user?.role || 'viewer';
  const isAdmin = role === 'admin';
  const isEngineer = role === 'engineer' || role === 'admin';
  const isViewer = role === 'viewer';
  const canEdit = isEngineer;
  const canAdmin = isAdmin;

  const value = {
    user,
    role,
    loading,
    error,
    login,
    logout,
    switchRoleQuickly,
    refreshUser,
    isAdmin,
    isEngineer,
    isViewer,
    canEdit,
    canAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
