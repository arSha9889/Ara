import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { sessionStore } from '../../infrastructure/storage/sessionStore';
import { useSession } from '../auth/session/useSession';
import { registerMobilePushToken, type MobilePushToken } from './api/mobilePushApi';
import {
  getMobilePushTokens,
  getNotificationPermissionStatus,
  pushClientIsAvailable,
  requestNotificationPermission,
  subscribeToMobilePushToken,
} from './pushClient';

type MobilePushStatus = 'unsupported' | 'disabled' | 'enabled' | 'denied';

interface MobilePushContextValue {
  status: MobilePushStatus;
  enableNotifications(): Promise<void>;
}

const MobilePushContext = createContext<MobilePushContextValue | null>(null);

export function MobilePushProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const canUsePush = Boolean(session?.user.legalDocumentsCurrent);
  const [status, setStatus] = useState<MobilePushStatus>(() =>
    pushClientIsAvailable() ? 'disabled' : 'unsupported',
  );
  const permissionStatusRequest = useRef(0);

  const registerToken = useCallback(async (token: MobilePushToken) => {
    const deviceId = await sessionStore.getDeviceId();
    await registerMobilePushToken(deviceId, token);
  }, []);

  const syncTokens = useCallback(() => {
    getMobilePushTokens()
      .then(tokens => Promise.all(tokens.map(registerToken)))
      .catch(() => undefined);
  }, [registerToken]);

  useEffect(() => {
    if (!canUsePush || !pushClientIsAvailable()) {
      return;
    }

    let active = true;
    const request = ++permissionStatusRequest.current;
    getNotificationPermissionStatus()
      .then(permission => {
        if (!active || request !== permissionStatusRequest.current) {
          return;
        }
        setStatus(permission === 'granted' ? 'enabled' : 'disabled');
        if (permission === 'granted') {
          syncTokens();
        }
      })
      .catch(() => {
        if (active && request === permissionStatusRequest.current) {
          setStatus('disabled');
        }
      });

    return () => {
      active = false;
    };
  }, [canUsePush, syncTokens]);

  useEffect(() => {
    if (!canUsePush || status !== 'enabled') {
      return;
    }

    return subscribeToMobilePushToken(token => {
      registerToken(token).catch(() => undefined);
    });
  }, [canUsePush, registerToken, status]);

  const enableNotifications = useCallback(async () => {
    if (!pushClientIsAvailable()) {
      setStatus('unsupported');
      return;
    }

    ++permissionStatusRequest.current;
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return;
    }

    setStatus('enabled');
    syncTokens();
  }, [syncTokens]);

  const value = useMemo(
    () => ({ status, enableNotifications }),
    [enableNotifications, status],
  );

  return <MobilePushContext.Provider value={value}>{children}</MobilePushContext.Provider>;
}

export function useMobilePush(): MobilePushContextValue {
  const context = useContext(MobilePushContext);
  if (!context) {
    throw new Error('useMobilePush must be used within MobilePushProvider.');
  }
  return context;
}
