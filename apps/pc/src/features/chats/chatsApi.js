import { apiRequest } from '../../shared/api/apiClient.js';

function authorizationHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getChats(accessToken) {
  return apiRequest('/api/chats', {
    headers: authorizationHeaders(accessToken),
  });
}

export function getChat(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function createDirectChatForUser(accessToken, userId) {
  return apiRequest(`/api/chats/direct/users/${userId}`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function getChatMessages(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/messages`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function sendTextMessage(accessToken, chatId, text) {
  return sendMessage(accessToken, chatId, { text, type: 'text' });
}

export function sendMessage(accessToken, chatId, payload) {
  return apiRequest(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function editMessage(accessToken, chatId, messageId, text) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: { text },
  });
}

export function deleteMessage(accessToken, chatId, messageId) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function pinMessage(accessToken, chatId, messageId) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}/pin`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function reactToMessage(accessToken, chatId, messageId, emoji) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: { emoji },
  });
}

export function uploadChatMedia(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest('/api/uploads', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: formData,
  });
}

export function markMessagesRead(accessToken, chatId, messageIds) {
  return apiRequest(`/api/chats/${chatId}/read`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: { message_ids: messageIds },
  });
}
