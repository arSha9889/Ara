import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';

import { refreshDesktopSession } from '../features/auth/authApi.js';
import {
  clearStoredRefreshToken,
  loadStoredRefreshToken,
  saveStoredRefreshToken,
} from '../shared/session/secureSession.js';

const ACCESS_REFRESH_SKEW_MS = 60 * 1000;

function accessTokenExpiresAt(accessToken) {
  if (!accessToken) return null;

  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return null;
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = JSON.parse(window.atob(normalizedPayload));
    return typeof decodedPayload.exp === 'number' ? decodedPayload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState({ accessToken: null, user: null });
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const isPersistentRef = useRef(false);
  const refreshTokenRef = useRef(null);
  const restorePromiseRef = useRef(null);

  const saveSession = useCallback(async (nextSession, { remember = true } = {}) => {
    if (remember && isTauri()) {
      await saveStoredRefreshToken(nextSession.refresh_token);
      isPersistentRef.current = true;
      refreshTokenRef.current = null;
    } else {
      await clearStoredRefreshToken();
      isPersistentRef.current = false;
      refreshTokenRef.current = nextSession.refresh_token;
    }

    setSession({
      accessToken: nextSession.access_token,
      user: nextSession.user,
    });
  }, []);

  const clearSession = useCallback(async () => {
    isPersistentRef.current = false;
    refreshTokenRef.current = null;
    setSession({ accessToken: null, user: null });
    await clearStoredRefreshToken().catch(() => undefined);
  }, []);

  const getRefreshToken = useCallback(async () => (isPersistentRef.current
    ? loadStoredRefreshToken()
    : refreshTokenRef.current), []);

  const updateSessionUser = useCallback((user) => {
    setSession((current) => ({ ...current, user }));
  }, []);

  useEffect(() => {
    let isCurrent = true;

    if (!restorePromiseRef.current) {
      restorePromiseRef.current = (async () => {
        const refreshToken = await loadStoredRefreshToken();
        if (!refreshToken) return null;

        const refreshedSession = await refreshDesktopSession(refreshToken);
        try {
          await saveStoredRefreshToken(refreshedSession.refresh_token);
          return { session: refreshedSession, isPersistent: true, refreshToken: null };
        } catch {
          return { session: refreshedSession, isPersistent: false, refreshToken: refreshedSession.refresh_token };
        }
      })();
    }

    restorePromiseRef.current
      .then((restored) => {
        if (!isCurrent || !restored) return;
        isPersistentRef.current = restored.isPersistent;
        refreshTokenRef.current = restored.refreshToken;
        setSession({
          accessToken: restored.session.access_token,
          user: restored.session.user,
        });
      })
      .catch(async () => {
        await clearStoredRefreshToken().catch(() => undefined);
      })
      .finally(() => {
        if (isCurrent) setIsSessionLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (isSessionLoading || !session.accessToken) return undefined;

    let isCurrent = true;
    const expiresAt = accessTokenExpiresAt(session.accessToken);
    const delay = expiresAt ? Math.max(expiresAt - Date.now() - ACCESS_REFRESH_SKEW_MS, 5000) : 5000;
    const timer = window.setTimeout(async () => {
      try {
        const refreshToken = isPersistentRef.current
          ? await loadStoredRefreshToken()
          : refreshTokenRef.current;
        if (!refreshToken) throw new Error('Missing refresh token');

        const refreshedSession = await refreshDesktopSession(refreshToken);
        if (!isCurrent) return;

        setSession({
          accessToken: refreshedSession.access_token,
          user: refreshedSession.user,
        });

        if (isPersistentRef.current) {
          try {
            await saveStoredRefreshToken(refreshedSession.refresh_token);
          } catch {
            isPersistentRef.current = false;
            refreshTokenRef.current = refreshedSession.refresh_token;
          }
        } else {
          refreshTokenRef.current = refreshedSession.refresh_token;
        }
      } catch {
        if (isCurrent) await clearSession();
      }
    }, delay);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [clearSession, isSessionLoading, session.accessToken]);

  return { clearSession, getRefreshToken, isSessionLoading, saveSession, session, updateSessionUser };
}
