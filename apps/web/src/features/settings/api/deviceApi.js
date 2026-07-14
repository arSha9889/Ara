import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getDevices(accessToken) {
  return apiRequest('/api/devices', { headers: authHeaders(accessToken) });
}

export function revokeDevice(accessToken, deviceId) {
  return apiRequest(`/api/devices/${deviceId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function getLoginHistory(accessToken) {
  return apiRequest('/api/login-history', { headers: authHeaders(accessToken) });
}
