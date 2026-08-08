import { apiRequest } from '../../../shared/api/httpClient.js';

export function completeRegistration(payload) {
  return apiRequest('/api/auth/register/complete', {
    method: 'POST',
    body: payload,
  });
}

export function startEmailVerification(payload) {
  return apiRequest('/api/auth/email-verification/start', {
    method: 'POST',
    body: payload,
  });
}

export function confirmEmailVerification(payload) {
  return apiRequest('/api/auth/email-verification/confirm', {
    method: 'POST',
    body: payload,
  });
}

export function loginWithPassword(payload) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export function startPasswordChange(accessToken, payload) {
  return apiRequest('/api/auth/password/change/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: payload,
  });
}

export function confirmPasswordChange(accessToken, payload) {
  return apiRequest('/api/auth/password/change/confirm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: payload,
  });
}

export function startPasswordReset(payload) {
  return apiRequest('/api/auth/password/reset/start', {
    method: 'POST',
    body: payload,
  });
}

export function confirmPasswordReset(payload) {
  return apiRequest('/api/auth/password/reset/confirm', {
    method: 'POST',
    body: payload,
  });
}

export function startEmailChange(accessToken, payload) {
  return apiRequest('/api/auth/email/change/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: payload,
  });
}

export function confirmEmailChange(accessToken, payload) {
  return apiRequest('/api/auth/email/change/confirm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: payload,
  });
}

export function startOAuth(provider, payload, accessToken = null) {
  return apiRequest(`/api/auth/oauth/${provider}${accessToken ? '/link' : ''}/start`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: payload,
  });
}

export function completeOAuthLogin(resultToken, deviceId) {
  return apiRequest('/api/auth/oauth/login/complete', {
    method: 'POST',
    body: { result_token: resultToken, device_id: deviceId },
  });
}

export function completeOAuthLink(accessToken, resultToken, deviceId) {
  return apiRequest('/api/auth/oauth/link/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { result_token: resultToken, device_id: deviceId },
  });
}

export function loginWithPin(payload) {
  return apiRequest('/api/security/pin/login', {
    method: 'POST',
    body: payload,
  });
}

export function createPin(accessToken, payload) {
  return apiRequest('/api/security/pin/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: payload,
  });
}

export function resetPin(accessToken, payload) {
  return apiRequest('/api/security/pin/reset', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: payload,
  });
}

export function revokePinDevice(accessToken, deviceId) {
  return apiRequest(`/api/security/pin/devices/${deviceId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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

export function acceptCurrentLegalDocuments(accessToken) {
  return apiRequest('/api/auth/legal-documents/accept', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      accepted_terms: true,
      accepted_privacy_policy: true,
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

export function logoutSession(refreshToken) {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

export function deleteAccount(accessToken) {
  return apiRequest('/api/auth/account', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
