import { apiRequest } from '../../../shared/api/httpClient.js';
import { authHeaders } from '../../profile/api/userApi.js';

export function getChats(accessToken) {
  return apiRequest('/api/chats', { headers: authHeaders(accessToken) });
}

export function createDirectChat(accessToken, payload) {
  return apiRequest('/api/chats/direct', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: payload,
  });
}

export function createDirectChatForUser(accessToken, userId) {
  return apiRequest(`/api/chats/direct/users/${userId}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function createSavedChat(accessToken) {
  return apiRequest('/api/chats/saved', {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function getPublicBranches(accessToken) {
  return apiRequest('/api/chats/branches/public', { headers: authHeaders(accessToken) });
}

export function subscribeToBranch(accessToken, chatId) {
  return apiRequest(`/api/chats/branches/${chatId}/subscribe`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function unsubscribeFromBranch(accessToken, chatId) {
  return apiRequest(`/api/chats/branches/${chatId}/subscribe`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function createPublicBranch(accessToken, payload) {
  return apiRequest('/api/chats/branches', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: payload,
  });
}

export function getChat(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}`, { headers: authHeaders(accessToken) });
}

export function hideChat(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function restoreChat(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/restore`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function updateChatWallpaper(accessToken, chatId, wallpaperId) {
  return apiRequest(`/api/chats/${chatId}/wallpaper`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { wallpaper_id: wallpaperId },
  });
}

export function getCallIceConfiguration(accessToken) {
  return apiRequest('/api/calls/ice-servers', { headers: authHeaders(accessToken) });
}

export function getMessages(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/messages`, { headers: authHeaders(accessToken) });
}

export function getChatE2eeKeys(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/e2ee-keys`, { headers: authHeaders(accessToken) });
}

export function getBranchComments(accessToken, branchId, postId) {
  return apiRequest(`/api/chats/${branchId}/messages/${postId}/comments`, { headers: authHeaders(accessToken) });
}

export function createBranchComment(accessToken, branchId, postId, text) {
  return apiRequest(`/api/chats/${branchId}/messages/${postId}/comments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: { text },
  });
}

export function updateBranchComment(accessToken, branchId, commentId, text) {
  return apiRequest(`/api/chats/${branchId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: { text },
  });
}

export function deleteBranchComment(accessToken, branchId, commentId) {
  return apiRequest(`/api/chats/${branchId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
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
