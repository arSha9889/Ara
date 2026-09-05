import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { acceptCurrentLegalDocuments, logout, loginWithPassword } from '../api/authApi';
import {
  sessionStore,
  type AuthSession,
} from '../../../infrastructure/storage/sessionStore';
import { unregisterMobilePushTokens } from '../../notifications/api/mobilePushApi';

type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionContextValue {
  session: AuthSession | null;
  status: SessionStatus;
  signIn(identifier: string, password: string): Promise<void>;
  saveSession(session: AuthSession): Promise<void>;
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
    });

    sessionStore
      .loadSession()
      .then(storedSession => {
        setSession(storedSession);
        setStatus(storedSession ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        setSession(null);
        setStatus('signedOut');
      });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const deviceId = await sessionStore.getDeviceId();
    const nextSession = await loginWithPassword(identifier, password, deviceId);
    await sessionStore.saveSession(nextSession);
  }, []);

  const saveSession = useCallback(async (nextSession: AuthSession) => {
    await sessionStore.saveSession(nextSession);
  }, []);

  const acceptLegalDocuments = useCallback(async () => {
    const currentSession = await sessionStore.loadSession();

    if (!currentSession) {
      throw new Error('No active session.');
    }

    const user = await acceptCurrentLegalDocuments();
    await sessionStore.saveSession({ ...currentSession, user });
  }, []);

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
      await sessionStore.clearSession();
    }
  }, []);

  const value = useMemo(
    () => ({ session, status, signIn, saveSession, acceptLegalDocuments, signOut }),
    [session, status, signIn, saveSession, acceptLegalDocuments, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
