import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getChats(accessToken) {
  return apiRequest('/api/chats', { headers: authHeaders(accessToken) });
}

export function createDirectChat(accessToken, identifier) {
  return apiRequest('/api/chats/direct', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: { identifier },
  });
}

export function createSavedChat(accessToken) {
  return apiRequest('/api/chats/saved', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function getChat(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}`, { headers: authHeaders(accessToken) });
}

export function getMessages(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/messages`, { headers: authHeaders(accessToken) });
}

export function sendMessage(accessToken, chatId, payload) {
  return apiRequest(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: typeof payload === 'string' ? { text: payload, type: 'text' } : payload,
  });
}

export function editMessage(accessToken, chatId, messageId, text) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { text },
  });
}

export function deleteMessage(accessToken, chatId, messageId) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function pinMessage(accessToken, chatId, messageId) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}/pin`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function reactToMessage(accessToken, chatId, messageId, emoji) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: { emoji },
  });
}

export function markMessagesRead(accessToken, chatId, messageIds) {
  return apiRequest(`/api/chats/${chatId}/read`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: { message_ids: messageIds },
  });
}
