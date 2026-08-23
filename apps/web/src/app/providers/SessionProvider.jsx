import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { ACCESS_TOKEN_STORAGE_KEY, configureAuthSessionHandlers, REFRESH_TOKEN_STORAGE_KEY } from '../../shared/api/httpClient.js';
import { getCurrentUser, refreshSession } from '../../features/auth/api/authApi.js';
import { useI18n } from './I18nProvider.jsx';
import { useTheme } from './ThemeProvider.jsx';

const SessionContext = createContext(null);
const ACCESS_REFRESH_SKEW_MS = 60 * 1000;
const SESSION_RESTORE_TIMEOUT_MS = 12 * 1000;

function accessTokenExpiresAt(accessToken) {
  if (!accessToken) return null;
  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(window.atob(normalized));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function shouldRefreshAccessToken(accessToken) {
  const expiresAt = accessTokenExpiresAt(accessToken);
  return !expiresAt || expiresAt - Date.now() <= ACCESS_REFRESH_SKEW_MS;
}

export function SessionProvider({ children }) {
  const { setLanguage } = useI18n();
  const { setTheme } = useTheme();
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [session, setSession] = useState(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    return { accessToken, refreshToken, user: null };
  });

  function saveSession(nextSession) {
    if (nextSession.accessToken) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, nextSession.accessToken);
    }
    if (nextSession.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, nextSession.refreshToken);
    }
    syncPreferences(nextSession.user);
    setSession(nextSession);
    setIsSessionLoading(false);
  }

  function syncPreferences(user) {
    if (user?.profile?.language) {
      setLanguage(user.profile.language);
    }
    if (user?.profile?.design_theme) {
      setTheme(user.profile.design_theme);
    }
  }

  function clearSession() {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    setSession({ accessToken: null, refreshToken: null, user: null });
  }

  useEffect(() => {
    configureAuthSessionHandlers({
      onRefresh: (nextSession) => {
        syncPreferences(nextSession.user);
        setSession(nextSession);
      },
      onExpire: () => {
        setSession({ accessToken: null, refreshToken: null, user: null });
      },
    });

    return () => configureAuthSessionHandlers(null);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_RESTORE_TIMEOUT_MS);
    const initialAccessToken = session.accessToken;
    const initialRefreshToken = session.refreshToken;

    async function restoreSession() {
      try {
        if (!initialAccessToken && !initialRefreshToken) {
          return;
        }
        if (initialAccessToken) {
          try {
            const user = await getCurrentUser(initialAccessToken, { signal: controller.signal });
            if (!active || localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) !== initialAccessToken) return;
            syncPreferences(user);
            setSession((current) => current.accessToken === initialAccessToken ? { ...current, user } : current);
            return;
          } catch (err) {
            if (!initialRefreshToken || controller.signal.aborted) {
              throw err;
            }
          }
        }
        const refreshed = await refreshSession(initialRefreshToken, { signal: controller.signal });
        if (!active || localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) !== initialRefreshToken) return;
        saveSession({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, user: refreshed.user });
      } catch {
        if (active && localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) === initialRefreshToken) clearSession();
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setIsSessionLoading(false);
      }
    }

    restoreSession();
    // restore once on app boot only
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (isSessionLoading || !session.refreshToken) return undefined;

    async function refreshNow() {
      const refreshToken = session.refreshToken;
      try {
        const refreshed = await refreshSession(refreshToken);
        if (localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) !== refreshToken) return;
        saveSession({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, user: refreshed.user });
      } catch {
        if (localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) === refreshToken) clearSession();
      }
    }

    const expiresAt = accessTokenExpiresAt(session.accessToken);
    const delay = expiresAt ? Math.max(expiresAt - Date.now() - ACCESS_REFRESH_SKEW_MS, 5000) : 5000;
    const timer = window.setTimeout(refreshNow, delay);

    function refreshWhenVisible() {
      if (document.visibilityState !== 'visible') return;
      if (shouldRefreshAccessToken(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY))) {
        refreshNow();
      }
    }

    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [isSessionLoading, session.accessToken, session.refreshToken]);

  const value = useMemo(() => ({ session, saveSession, clearSession, isSessionLoading }), [session, isSessionLoading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
