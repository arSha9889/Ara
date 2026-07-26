import { apiRequest } from '../../../shared/api/httpClient.js';

export function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function checkUsername(username) {
  return apiRequest('/api/users/username/check', {
    method: 'POST',
    body: { username },
  });
}

export function getMyProfile(accessToken) {
  return apiRequest('/api/users/me', { headers: authHeaders(accessToken) });
}

export function searchUsers(accessToken, query) {
  return apiRequest(`/api/users/search?query=${encodeURIComponent(query)}`, {
    headers: authHeaders(accessToken),
  });
}

export function updateMyProfile(accessToken, payload) {
  return apiRequest('/api/users/me/profile', {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: payload,
  });
}

export function updateUsername(accessToken, username) {
  return apiRequest('/api/users/username', {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { username },
  });
}
