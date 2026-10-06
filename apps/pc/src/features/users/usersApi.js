import { apiRequest } from '../../shared/api/apiClient.js';

function authorizationHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getCurrentUser(accessToken) {
  return apiRequest('/api/users/me', {
    headers: authorizationHeaders(accessToken),
  });
}

export function updateCurrentProfile(accessToken, profile) {
  return apiRequest('/api/users/me/profile', {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: profile,
  });
}

export function searchPublicUsers(accessToken, query) {
  return apiRequest(`/api/users/search?query=${encodeURIComponent(query)}`, {
    headers: authorizationHeaders(accessToken),
  });
}
