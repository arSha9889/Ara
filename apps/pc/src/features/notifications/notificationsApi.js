import { apiRequest } from '../../shared/api/apiClient.js';

function authorizationHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getNotifications(accessToken) {
  return apiRequest('/api/notifications', { headers: authorizationHeaders(accessToken) });
}

export function markNotificationsRead(accessToken, notificationIds = null) {
  return apiRequest('/api/notifications/read', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: notificationIds,
  });
}
