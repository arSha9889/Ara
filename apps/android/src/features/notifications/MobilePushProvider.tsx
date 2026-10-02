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
}

const MobilePushContext = createContext<MobilePushContextValue | null>(null);

export function MobilePushProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const canUsePush = Boolean(session?.user.legalDocumentsCurrent);
  const userId = session?.user.id;
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
    if (!canUsePush || !userId || !pushClientIsAvailable()) {
      return;
    }

    let active = true;
    const request = ++permissionStatusRequest.current;
    (async () => {
      try {
        const permission = await getNotificationPermissionStatus();
        const shouldRequestPermission = await sessionStore.consumeNotificationPermissionRequest(userId);

        if (!active || request !== permissionStatusRequest.current) {
          return;
        }

        setStatus(permission === 'granted' ? 'enabled' : 'disabled');
        if (permission === 'granted') {
          syncTokens();
          return;
        }

        if (!shouldRequestPermission) {
          return;
        }

        const requestedPermission = await requestNotificationPermission();
        if (active && request === permissionStatusRequest.current) {
          if (requestedPermission === 'granted') {
            setStatus('enabled');
            syncTokens();
          } else {
            setStatus('denied');
          }
        }
      } catch {
        if (active && request === permissionStatusRequest.current) {
          setStatus('disabled');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [canUsePush, syncTokens, userId]);

  useEffect(() => {
    if (!canUsePush || status !== 'enabled') {
      return;
    }

    return subscribeToMobilePushToken(token => {
      registerToken(token).catch(() => undefined);
    });
  }, [canUsePush, registerToken, status]);

  const value = useMemo(() => ({ status }), [status]);

  return <MobilePushContext.Provider value={value}>{children}</MobilePushContext.Provider>;
}

export function useMobilePush(): MobilePushContextValue {
  const context = useContext(MobilePushContext);
  if (!context) {
    throw new Error('useMobilePush must be used within MobilePushProvider.');
  }
  return context;
}
