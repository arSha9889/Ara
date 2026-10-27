import { apiRequest } from '../../../shared/api/httpClient.js';

export function loginWithPassword(payload) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export function getCurrentUser(accessToken, options = {}) {
  return apiRequest('/api/auth/me', {
    ...options,
    skipAuthRefresh: true,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function refreshSession(refreshToken, options = {}) {
  return apiRequest('/api/auth/refresh', {
    ...options,
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}
