import { getApiBaseUrl } from '../../config/runtimeConfig';

export function toWebSocketUrl(apiBaseUrl: string): string {
  const url = new URL('/ws', apiBaseUrl);
  return url.toString().replace(/^https:/, 'wss:');
}

export function getWebSocketUrl(): string {
  return toWebSocketUrl(getApiBaseUrl());
}
