import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function saveE2eeWebKey(accessToken, payload) {
  return apiRequest('/api/security/e2ee/web-key', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: payload,
  });
}
