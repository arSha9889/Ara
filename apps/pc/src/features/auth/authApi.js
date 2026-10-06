import { apiRequest } from '../../shared/api/apiClient.js';

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

export function completeRegistration({
  verificationId,
  username,
  password,
  deviceId,
  language,
  country,
  displayName,
}) {
  return apiRequest('/api/auth/register/complete', {
    method: 'POST',
    body: {
      email_verification_id: verificationId,
      username,
      password,
      device_id: deviceId,
      language,
      registration_country: country,
      design_theme: 'halo',
      display_name: displayName,
      avatar_type: 'built_in',
      avatar_ref: 'animal-01',
      accepted_terms: true,
      accepted_privacy_policy: true,
    },
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
