import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getAdminOverview(accessToken) {
  return apiRequest('/api/admin/overview', { headers: authHeaders(accessToken) });
}

export function updateAdminUserStatus(accessToken, userId, status) {
  return apiRequest(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { status },
  });
}
