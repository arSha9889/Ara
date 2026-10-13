import { apiRequest } from '../../shared/api/apiClient.js';

function authorizationHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getDevices(accessToken) {
  return apiRequest('/api/devices', { headers: authorizationHeaders(accessToken) });
}

export function revokeDevice(accessToken, deviceId) {
  return apiRequest(`/api/devices/${deviceId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function getLoginHistory(accessToken) {
  return apiRequest('/api/login-history', { headers: authorizationHeaders(accessToken) });
}

export function createPin(accessToken, payload) {
  return apiRequest('/api/security/pin/create', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function resetPin(accessToken, payload) {
  return apiRequest('/api/security/pin/reset', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function saveE2eeWebKey(accessToken, payload) {
  return apiRequest('/api/security/e2ee/web-key', {
    method: 'PUT',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function startPasswordChange(accessToken, payload) {
  return apiRequest('/api/auth/password/change/start', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function confirmPasswordChange(accessToken, payload) {
  return apiRequest('/api/auth/password/change/confirm', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function startEmailChange(accessToken, payload) {
  return apiRequest('/api/auth/email/change/start', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function confirmEmailChange(accessToken, payload) {
  return apiRequest('/api/auth/email/change/confirm', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}
