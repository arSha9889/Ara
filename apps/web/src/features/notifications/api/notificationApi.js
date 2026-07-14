import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getPushConfig(accessToken) {
  return apiRequest('/api/notifications/push-config', { headers: authHeaders(accessToken) });
}

export function savePushSubscription(accessToken, subscription) {
  return apiRequest('/api/notifications/subscriptions', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: subscription,
  });
}

export function deletePushSubscription(accessToken, endpoint) {
  return apiRequest('/api/notifications/subscriptions', {
    method: 'DELETE',
    headers: authHeaders(accessToken),
    body: { endpoint },
  });
}

export function getNotifications(accessToken) {
  return apiRequest('/api/notifications', { headers: authHeaders(accessToken) });
}

export function markNotificationsRead(accessToken, notificationIds = null) {
  return apiRequest('/api/notifications/read', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: notificationIds,
  });
}
