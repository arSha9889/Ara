import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getAdminOverview(accessToken) {
  return apiRequest('/api/admin/overview', { headers: authHeaders(accessToken) });
}

export function getAdminSecurityMetrics(accessToken) {
  return apiRequest('/api/admin/security/metrics', { headers: authHeaders(accessToken) });
}

export function getAdminAuditLogs(accessToken) {
  return apiRequest('/api/admin/audit-logs', { headers: authHeaders(accessToken) });
}

export function getAdminBranches(accessToken) {
  return apiRequest('/api/admin/branches', { headers: authHeaders(accessToken) });
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
