import { apiRequest } from '../../../shared/api/httpClient.js';

export function completeRegistration(payload) {
  return apiRequest('/api/auth/register/complete', {
    method: 'POST',
    body: payload,
  });
}

export function createDevRegistrationProof(telegramId) {
  return apiRequest('/api/auth/dev/registration-proof', {
    method: 'POST',
    body: { telegram_id: telegramId },
  });
}

export function startPhoneVerification(payload) {
  return apiRequest('/api/auth/phone-verification/start', {
    method: 'POST',
    body: payload,
  });
}

export function confirmPhoneVerification(payload) {
  return apiRequest('/api/auth/phone-verification/confirm', {
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

export function getCurrentUser(accessToken) {
  return apiRequest('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function refreshSession(refreshToken) {
  return apiRequest('/api/auth/refresh', {
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

export function verifyRecoveryCode(payload) {
  return apiRequest('/api/recovery/code/verify', {
    method: 'POST',
    body: payload,
  });
}

export function resetPasswordWithRecoveryCode(payload) {
  return apiRequest('/api/recovery/password/reset', {
    method: 'POST',
    body: payload,
  });
}

export function regenerateRecoveryCode(accessToken, currentPassword) {
  return apiRequest('/api/recovery/code/regenerate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: { current_password: currentPassword },
  });
}
