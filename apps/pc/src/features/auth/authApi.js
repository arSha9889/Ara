import { apiRequest } from '../../shared/api/apiClient.js';
import { registrationRequestBody } from './registrationRequestBody.js';

export function loginWithEmail({ email, password, deviceId }) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password, device_id: deviceId },
  });
}

export function startEmailVerification({ email, deviceId, language }) {
  return apiRequest('/api/auth/email-verification/start', {
    method: 'POST',
    body: { email, device_id: deviceId, language },
  });
}

export function confirmEmailVerification({ verificationId, code }) {
  return apiRequest('/api/auth/email-verification/confirm', {
    method: 'POST',
    body: { verification_id: verificationId, code },
  });
}

export function completeRegistration(input) {
  return apiRequest('/api/auth/register/complete', {
    method: 'POST',
    body: registrationRequestBody(input),
  });
}

export function refreshDesktopSession(refreshToken) {
  return apiRequest('/api/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

export function logoutDesktopSession(refreshToken) {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}
