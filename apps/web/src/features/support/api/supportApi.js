import { authenticatedFetch, apiRequest, translateApiError } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getSupportTickets(accessToken) {
  return apiRequest('/api/support', { headers: authHeaders(accessToken) });
}


export function createSupportTicket(accessToken, payload) {
  return apiRequest('/api/support', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: payload,
  });
}


export function getSupportTicket(accessToken, ticketId) {
  return apiRequest(`/api/support/${ticketId}`, { headers: authHeaders(accessToken) });
}


export function createSupportMessage(accessToken, ticketId, payload) {
  return apiRequest(`/api/support/${ticketId}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: payload,
  });
}


export function getAdminSupportTickets(accessToken, ticketStatus = 'all') {
  const query = ticketStatus === 'all' ? '' : `?status=${encodeURIComponent(ticketStatus)}`;
  return apiRequest(`/api/support/admin/tickets${query}`, { headers: authHeaders(accessToken) });
}


export function getAdminSupportTicket(accessToken, ticketId) {
  return apiRequest(`/api/support/admin/tickets/${ticketId}`, { headers: authHeaders(accessToken) });
}


export function createAdminSupportMessage(accessToken, ticketId, payload) {
  return apiRequest(`/api/support/admin/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: payload,
  });
}


export function updateAdminSupportTicket(accessToken, ticketId, status) {
  return apiRequest(`/api/support/admin/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { status },
  });
}


export async function uploadSupportAttachment(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await authenticatedFetch('/api/uploads/support', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(translateApiError(errorBody?.detail, response.status));
  }

  return response.json();
}
