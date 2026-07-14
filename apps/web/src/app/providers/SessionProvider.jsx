import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useI18n } from './I18nProvider.jsx';
import { useTheme } from './ThemeProvider.jsx';
import { getCurrentUser, refreshSession } from '../../features/auth/api/authApi.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const { setLanguage } = useI18n();
  const { setTheme } = useTheme();
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [session, setSession] = useState(() => {
    const accessToken = localStorage.getItem('nexus_access_token');
    const refreshToken = localStorage.getItem('nexus_refresh_token');
    return { accessToken, refreshToken, user: null };
  });

  function saveSession(nextSession) {
    if (nextSession.accessToken) {
      localStorage.setItem('nexus_access_token', nextSession.accessToken);
    }
    if (nextSession.refreshToken) {
      localStorage.setItem('nexus_refresh_token', nextSession.refreshToken);
    }
    syncPreferences(nextSession.user);
    setSession(nextSession);
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
    localStorage.removeItem('nexus_access_token');
    localStorage.removeItem('nexus_refresh_token');
    setSession({ accessToken: null, refreshToken: null, user: null });
  }

  useEffect(() => {
    async function restoreSession() {
      if (!session.accessToken && !session.refreshToken) {
        setIsSessionLoading(false);
        return;
      }
      try {
        if (session.accessToken) {
          try {
            const user = await getCurrentUser(session.accessToken);
            syncPreferences(user);
            setSession((current) => ({ ...current, user }));
            return;
          } catch (err) {
            if (!session.refreshToken) {
              throw err;
            }
          }
        }
        const refreshed = await refreshSession(session.refreshToken);
        saveSession({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, user: refreshed.user });
      } catch {
        clearSession();
      } finally {
        setIsSessionLoading(false);
      }
    }

    restoreSession();
    // restore once on app boot only
  }, []);

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
