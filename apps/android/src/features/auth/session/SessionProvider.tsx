import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { acceptCurrentLegalDocuments, logout, loginWithPassword } from '../api/authApi';
import {
  sessionStore,
  type AuthSession,
  type SessionUser,
} from '../../../infrastructure/storage/sessionStore';
import { clearPrivateChatMediaCache } from '../../chats/media/mediaClient';
import { unregisterMobilePushTokens } from '../../notifications/api/mobilePushApi';

type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionContextValue {
  session: AuthSession | null;
  status: SessionStatus;
  signIn(identifier: string, password: string): Promise<void>;
  saveSession(session: AuthSession): Promise<void>;
  updateSessionUser(user: SessionUser): Promise<void>;
  acceptLegalDocuments(): Promise<void>;
  signOut(): Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    const unsubscribe = sessionStore.subscribe(nextSession => {
      setSession(nextSession);
      setStatus(nextSession ? 'signedIn' : 'signedOut');
      if (!nextSession) {
        clearPrivateChatMediaCache().catch(() => undefined);
      }
    });

    sessionStore
      .loadSession()
      .then(storedSession => {
        setSession(storedSession);
        setStatus(storedSession ? 'signedIn' : 'signedOut');
        if (!storedSession) {
          clearPrivateChatMediaCache().catch(() => undefined);
        }
      })
      .catch(() => {
        setSession(null);
        setStatus('signedOut');
        clearPrivateChatMediaCache().catch(() => undefined);
      });

    return unsubscribe;
  }, []);

  const saveSession = useCallback(async (nextSession: AuthSession) => {
    const currentSession = await sessionStore.loadSession();
    if (currentSession?.user.id !== nextSession.user.id) {
      await clearPrivateChatMediaCache();
    }
    await sessionStore.saveSession(nextSession);
  }, []);

  const updateSessionUser = useCallback(async (user: SessionUser) => {
    const currentSession = await sessionStore.loadSession();

    if (!currentSession || currentSession.user.id !== user.id) {
      throw new Error('Активная сессия больше не соответствует обновлённому профилю.');
    }

    await sessionStore.saveSession({ ...currentSession, user });
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const deviceId = await sessionStore.getDeviceId();
    const nextSession = await loginWithPassword(identifier, password, deviceId);
    await sessionStore
      .markNotificationPermissionRequest(nextSession.user.id)
      .catch(() => undefined);
    await saveSession(nextSession);
  }, [saveSession]);

  const acceptLegalDocuments = useCallback(async () => {
    const currentSession = await sessionStore.loadSession();

    if (!currentSession) {
      throw new Error('No active session.');
    }

    const user = await acceptCurrentLegalDocuments();
    await updateSessionUser(user);
  }, [updateSessionUser]);

  const signOut = useCallback(async () => {
    const currentSession = await sessionStore.loadSession();

    try {
      if (currentSession) {
        await (async () => {
          const deviceId = await sessionStore.getDeviceId();
          await unregisterMobilePushTokens(deviceId);
        })().catch(() => undefined);
        await logout(currentSession.refreshToken);
      }
    } finally {
      if (currentSession) {
        await sessionStore.clearSessionIfCurrent(currentSession);
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      status,
      signIn,
      saveSession,
      updateSessionUser,
      acceptLegalDocuments,
      signOut,
    }),
    [
      session,
      status,
      signIn,
      saveSession,
      updateSessionUser,
      acceptLegalDocuments,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
