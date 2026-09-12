import { NativeModules } from 'react-native';

import { apiClient } from '../../../infrastructure/http/apiClient';

export type MobilePushProvider = 'rustore' | 'fcm';

export interface MobilePushToken {
  provider: MobilePushProvider;
  token: string;
}

interface MobilePushTokenResponse {
  active: boolean;
}

interface AppConfigModule {
  appVersion?: unknown;
}

function appVersion(): string | undefined {
  const version = (NativeModules.AppConfig as AppConfigModule | undefined)?.appVersion;
  return typeof version === 'string' && version.length <= 64 ? version : undefined;
}

export async function registerMobilePushToken(
  deviceId: string,
  token: MobilePushToken,
): Promise<void> {
  await apiClient.request<MobilePushTokenResponse>('/api/notifications/mobile-tokens', {
    method: 'PUT',
    body: {
      device_id: deviceId,
      provider: token.provider,
      package_name: 'arachat.messenger',
      app_version: appVersion(),
      token: token.token,
    },
  });
}

export async function unregisterMobilePushTokens(deviceId: string): Promise<void> {
  await apiClient.request('/api/notifications/mobile-tokens', {
    method: 'DELETE',
    body: { device_id: deviceId },
    skipRefresh: true,
  });
}

export async function markMobileNotificationsRead(notificationIds: string[]): Promise<void> {
  if (!notificationIds.length) {
    return;
  }

  await apiClient.request<{ ok: boolean }>('/api/notifications/read', {
    method: 'POST',
    body: notificationIds,
  });
}
