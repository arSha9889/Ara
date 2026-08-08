import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getAdminOverview(accessToken) {
  return apiRequest('/api/admin/overview', { headers: authHeaders(accessToken) });
}

export function getAdminSecurityMetrics(accessToken) {
  return apiRequest('/api/admin/security/metrics', { headers: authHeaders(accessToken) });
}

export function getAdminMaintenance(accessToken) {
  return apiRequest('/api/admin/maintenance', { headers: authHeaders(accessToken) });
}

export function runAdminRetention(accessToken) {
  return apiRequest('/api/admin/maintenance/retention', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function getAdminAuditLogs(accessToken) {
  return apiRequest('/api/admin/audit-logs', { headers: authHeaders(accessToken) });
}

export function getAdminBranches(accessToken) {
  return apiRequest('/api/admin/branches', { headers: authHeaders(accessToken) });
}

export function getAdminSystemBot(accessToken) {
  return apiRequest('/api/admin/system-bot', { headers: authHeaders(accessToken) });
}

export function publishAdminSystemBotMessage(accessToken, payload) {
  return apiRequest('/api/admin/system-bot/messages', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: { text: payload.text, type: 'text' },
  });
}

export function editAdminSystemBotMessage(accessToken, messageId, text) {
  return apiRequest(`/api/admin/system-bot/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { text },
  });
}

export function deleteAdminSystemBotMessage(accessToken, messageId) {
  return apiRequest(`/api/admin/system-bot/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function toggleAdminSystemBotMessagePin(accessToken, messageId) {
  return apiRequest(`/api/admin/system-bot/messages/${messageId}/pin`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function updateAdminBranch(accessToken, branchId, payload) {
  return apiRequest(`/api/admin/branches/${branchId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: payload,
  });
}

export function setAdminBranchArchived(accessToken, branchId, archived) {
  return apiRequest(`/api/admin/branches/${branchId}/${archived ? 'archive' : 'restore'}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function setAdminBranchMember(accessToken, branchId, userId, role) {
  return apiRequest(`/api/admin/branches/${branchId}/members`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: { user_id: userId, role },
  });
}

export function getAdminUsers(accessToken, filters = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.status && filters.status !== 'all') params.set('user_status', filters.status);
  if (filters.country) params.set('country', filters.country);
  if (filters.sort) params.set('sort', filters.sort);
  return apiRequest(`/api/admin/users?${params}`, { headers: authHeaders(accessToken) });
}

export function getAdminUser(accessToken, userId) {
  return apiRequest(`/api/admin/users/${userId}`, { headers: authHeaders(accessToken) });
}

export function updateAdminUserStatus(accessToken, userId, status) {
  return apiRequest(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { status },
  });
}

export function updateAdminUserVpnStatus(accessToken, userId, vpnEnabled) {
  return apiRequest(`/api/admin/users/${userId}/vpn`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { vpn_enabled: vpnEnabled },
  });
}
