import { apiRequest } from '../../shared/api/apiClient.js';

function authorizationHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getChats(accessToken) {
  return apiRequest('/api/chats', {
    headers: authorizationHeaders(accessToken),
  });
}

export function hideAllDirectChats(accessToken) {
  return apiRequest('/api/chats', {
    method: 'DELETE',
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

export function createGroup(accessToken, payload) {
  return apiRequest('/api/chats/groups', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function updateGroup(accessToken, chatId, payload) {
  return apiRequest(`/api/chats/groups/${chatId}`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function deleteGroup(accessToken, chatId) {
  return apiRequest(`/api/chats/groups/${chatId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function leaveGroup(accessToken, chatId) {
  return apiRequest(`/api/chats/groups/${chatId}/leave`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function getGroupMembers(accessToken, chatId) {
  return apiRequest(`/api/chats/groups/${chatId}/members`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function addGroupMember(accessToken, chatId, userId) {
  return apiRequest(`/api/chats/groups/${chatId}/members`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: { user_id: userId },
  });
}

export function updateGroupMemberRole(accessToken, chatId, userId, role) {
  return apiRequest(`/api/chats/groups/${chatId}/members/${userId}`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: { role },
  });
}

export function removeGroupMember(accessToken, chatId, userId) {
  return apiRequest(`/api/chats/groups/${chatId}/members/${userId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function transferGroupOwnership(accessToken, chatId, userId) {
  return apiRequest(`/api/chats/groups/${chatId}/ownership`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: { user_id: userId },
  });
}

export function getGroupInviteState(accessToken, chatId) {
  return apiRequest(`/api/chats/groups/${chatId}/invite`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function generateGroupInvite(accessToken, chatId) {
  return apiRequest(`/api/chats/groups/${chatId}/invite`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function revokeGroupInvite(accessToken, chatId) {
  return apiRequest(`/api/chats/groups/${chatId}/invite`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function getPublicChannels(accessToken) {
  return apiRequest('/api/chats/branches/public', {
    headers: authorizationHeaders(accessToken),
  });
}

export function subscribeToPublicChannel(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/subscribe`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function unsubscribeFromPublicChannel(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/subscribe`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function createPrivateChannel(accessToken, payload) {
  return apiRequest('/api/chats/branches/private', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}

export function joinPrivateChannel(accessToken, inviteToken) {
  return apiRequest('/api/chats/branches/join', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: { invite_token: inviteToken },
  });
}

export function updatePrivateChannel(accessToken, channelId, payload) {
  return apiRequest(`/api/chats/branches/${channelId}`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: payload,
  });
}


export function deletePrivateChannel(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function leavePrivateChannel(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/leave`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function getChannelInviteState(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/invite`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function generateChannelInvite(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/invite`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
  });
}

export function revokeChannelInvite(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/invite`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function getChannelMembers(accessToken, channelId) {
  return apiRequest(`/api/chats/branches/${channelId}/members`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function updateChannelMemberRole(accessToken, channelId, userId, role) {
  return apiRequest(`/api/chats/branches/${channelId}/members/${userId}`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: { role },
  });
}

export function removeChannelMember(accessToken, channelId, userId) {
  return apiRequest(`/api/chats/branches/${channelId}/members/${userId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  });
}

export function updateChannelNotifications(accessToken, channelId, enabled) {
  return apiRequest(`/api/chats/branches/${channelId}/notifications`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: { enabled },
  });
}

export function getChatMessages(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/messages`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function getChatMessage(accessToken, chatId, messageId) {
  return apiRequest(`/api/chats/${chatId}/messages/${messageId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function getChatE2eeKeys(accessToken, chatId) {
  return apiRequest(`/api/chats/${chatId}/e2ee-keys`, {
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

export function setChannelPostCommentsEnabled(accessToken, channelId, postId, commentsEnabled) {
  return apiRequest(`/api/chats/branches/${channelId}/messages/${postId}/comments-enabled`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: { comments_enabled: commentsEnabled },
  });
}

export function getChannelPostComments(accessToken, channelId, postId) {
  return apiRequest(`/api/chats/${channelId}/messages/${postId}/comments`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function createChannelPostComment(accessToken, channelId, postId, text) {
  return apiRequest(`/api/chats/${channelId}/messages/${postId}/comments`, {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: { text },
  });
}

export function updateChannelPostComment(accessToken, channelId, commentId, text) {
  return apiRequest(`/api/chats/${channelId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: authorizationHeaders(accessToken),
    body: { text },
  });
}

export function deleteChannelPostComment(accessToken, channelId, commentId) {
  return apiRequest(`/api/chats/${channelId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
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

export function uploadChannelAvatar(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest('/api/uploads/avatar', {
    method: 'POST',
    headers: authorizationHeaders(accessToken),
    body: formData,
  });
}

export const uploadGroupAvatar = uploadChannelAvatar;

export function uploadE2eeAttachment(accessToken, file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest('/api/uploads/e2ee', {
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
