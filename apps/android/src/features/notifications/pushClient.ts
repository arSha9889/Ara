import { NativeEventEmitter, NativeModules } from 'react-native';

import type { MobilePushProvider, MobilePushToken } from './api/mobilePushApi';

type NotificationPermissionStatus = 'granted' | 'denied';

interface NativePushToken {
  provider?: unknown;
  token?: unknown;
}

interface NativePushModule {
  addListener(eventName: string): void;
  clearMessageNotificationsForChat?: (chatId: string) => void;
  getPendingNotificationOpen?: () => Promise<unknown>;
  getTokens?: () => Promise<Record<string, unknown>>;
  getNotificationPermissionStatus?: () => Promise<NotificationPermissionStatus>;
  removeListeners(count: number): void;
  requestNotificationPermission?: () => Promise<NotificationPermissionStatus>;
  setNotificationOpenListenerActive?: (active: boolean) => void;
}

const PUSH_PROVIDER_BY_SDK_KEY: Record<string, MobilePushProvider> = {
  rustore: 'rustore',
  firebase: 'fcm',
};
const NOTIFICATION_OPEN_EVENT = 'AraChatNotificationOpen';

const nativePush = NativeModules.AraChatPush as NativePushModule | undefined;
const nativePushEvents = nativePush ? new NativeEventEmitter(nativePush) : null;

function toMobilePushToken(value: NativePushToken): MobilePushToken | null {
  if (typeof value.provider !== 'string' || typeof value.token !== 'string' || value.token.length < 16) {
    return null;
  }

  const provider = PUSH_PROVIDER_BY_SDK_KEY[value.provider];
  return provider ? { provider, token: value.token } : null;
}

export function pushClientIsAvailable(): boolean {
  return Boolean(nativePush?.getTokens && nativePush?.getNotificationPermissionStatus && nativePush?.requestNotificationPermission);
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!nativePush?.getNotificationPermissionStatus) {
    return 'denied';
  }

  return nativePush.getNotificationPermissionStatus();
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!nativePush?.requestNotificationPermission) {
    return 'denied';
  }

  return nativePush.requestNotificationPermission();
}

export async function getMobilePushTokens(): Promise<MobilePushToken[]> {
  if (!nativePush?.getTokens) {
    return [];
  }

  const tokens = await nativePush.getTokens();
  return Object.entries(tokens)
    .map(([provider, token]) => toMobilePushToken({ provider, token }))
    .filter((token): token is MobilePushToken => token !== null);
}

export function subscribeToMobilePushToken(listener: (token: MobilePushToken) => void): () => void {
  if (!nativePushEvents) {
    return () => undefined;
  }

  const subscription = nativePushEvents.addListener('AraChatPushToken', (event: NativePushToken) => {
    const token = toMobilePushToken(event);
    if (token) {
      listener(token);
    }
  });
  return () => subscription.remove();
}

export async function getPendingMobilePushOpen(): Promise<unknown | null> {
  if (!nativePush?.getPendingNotificationOpen) {
    return null;
  }

  return nativePush.getPendingNotificationOpen();
}

export function clearMessageNotificationsForChat(chatId: string): void {
  nativePush?.clearMessageNotificationsForChat?.(chatId);
}

export function subscribeToMobilePushOpen(listener: (open: unknown) => void): () => void {
  if (!nativePushEvents) {
    return () => undefined;
  }

  const subscription = nativePushEvents.addListener(NOTIFICATION_OPEN_EVENT, listener);
  nativePush?.setNotificationOpenListenerActive?.(true);
  return () => {
    nativePush?.setNotificationOpenListenerActive?.(false);
    subscription.remove();
  };
}
