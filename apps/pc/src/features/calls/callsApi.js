import { apiRequest } from '../../shared/api/apiClient.js';

export function getCallIceConfiguration(accessToken) {
  return apiRequest('/api/calls/ice-servers', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
