import { apiClient } from '../../../infrastructure/http/apiClient';

export interface ChatAttachmentUpload {
  uri: string;
  name: string;
  mimeType: string;
}

export interface UploadedChatAttachment {
  media_url: string;
  media_name: string;
  media_mime_type: string;
  media_size_bytes: number;
  suggested_message_type: string;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  user_id: string;
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  role: GroupRole;
  joined_at: string;
}

export interface GroupMemberIdentity {
  user_id: string;
  display_name: string;
}

export interface GroupCreateInput {
  title: string;
  description?: string;
  avatar_ref?: string;
  member_user_ids?: string[];
}

export interface GroupUpdateInput {
  title?: string;
  description?: string;
  avatar_ref?: string;
}

export interface GroupInviteState {
  is_active: boolean;
}

export interface GroupInvite {
  invite_link: string;
}

export type ChatAttachmentMessageType = 'photo' | 'video' | 'voice' | 'video_note' | 'file';

export interface MediaMessageOptions {
  durationSeconds?: number;
  replyToMessageId?: string;
  type?: 'voice' | 'video_note';
}

export interface TextMessageOptions {
  replyToMessageId?: string;
}

export interface ChatPeer {
  id: string;
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  is_online: boolean;
  last_seen_at: string | null;
  active_platforms?: string[];
  is_official: boolean;
}

export interface ChatPreviewMessage {
  id: string;
  sender_id: string;
  type: string;
  payload: string;
  media_name: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  type: string;
  created_at: string;
  updated_at: string;
  last_message_id: string | null;
  pinned_message_id: string | null;
  participant_ids: string[];
  peer: ChatPeer | null;
  last_message: ChatPreviewMessage | null;
  pinned_message?: ChatPreviewMessage | null;
  unread_count: number;
  title: string | null;
  description?: string | null;
  avatar_ref?: string | null;
  is_private?: boolean;
  current_role?: GroupRole | null;
  notifications_enabled?: boolean;
  can_post: boolean;
}

export interface ChatMessageAuthor {
  id: string;
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  is_official: boolean;
}

export interface ChatMessageReaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

export interface ChatMessageReply {
  id: string;
  sender_id: string;
  type: string;
  payload: string;
  media_name: string | null;
  encryption_state: string;
  deleted_at: string | null;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  author: ChatMessageAuthor | null;
  type: string;
  payload: string;
  media_url: string | null;
  media_name: string | null;
  media_mime_type: string | null;
  media_size_bytes: number | null;
  duration_seconds: number | null;
  encryption_state: string;
  delivery_status: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reactions: ChatMessageReaction[];
  reply_to?: ChatMessageReply | null;
  is_pinned?: boolean;
}

function isSupportedMobileChat(chat: Chat): boolean {
  return chat.type === 'direct' || chat.type === 'saved' || chat.type === 'group';
}

export async function getChats(): Promise<Chat[]> {
  const chats = await apiClient.request<Chat[]>('/api/chats');
  return chats.filter(isSupportedMobileChat);
}

export function getChat(chatId: string): Promise<Chat> {
  return apiClient.request<Chat>(`/api/chats/${chatId}`);
}

export function getMessages(chatId: string): Promise<ChatMessage[]> {
  return apiClient.request<ChatMessage[]>(`/api/chats/${chatId}/messages`);
}

export function getMessage(chatId: string, messageId: string): Promise<ChatMessage> {
  return apiClient.request<ChatMessage>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
  );
}

export function createDirectChatForUser(userId: string): Promise<Chat> {
  return apiClient.request<Chat>(
    `/api/chats/direct/users/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
    },
  );
}

export async function createGroup(input: GroupCreateInput): Promise<Chat> {
  const response = await apiClient.request<{ chat: Chat }>('/api/chats/groups', {
    method: 'POST',
    body: {
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      ...(input.avatar_ref ? { avatar_ref: input.avatar_ref } : {}),
      member_user_ids: input.member_user_ids ?? [],
    },
  });
  return response.chat;
}

export function updateGroup(chatId: string, input: GroupUpdateInput): Promise<Chat> {
  return apiClient.request<Chat>(`/api/chats/groups/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.avatar_ref !== undefined ? { avatar_ref: input.avatar_ref } : {}),
    },
  });
}

export function deleteGroup(chatId: string): Promise<void> {
  return apiClient.request<void>(`/api/chats/groups/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

export function leaveGroup(chatId: string): Promise<void> {
  return apiClient.request<void>(`/api/chats/groups/${encodeURIComponent(chatId)}/leave`, {
    method: 'POST',
  });
}

export function getGroupMembers(chatId: string): Promise<GroupMember[]> {
  return apiClient.request<GroupMember[]>(`/api/chats/groups/${encodeURIComponent(chatId)}/members`);
}

export function addGroupMember(chatId: string, userId: string): Promise<Chat> {
  return apiClient.request<Chat>(`/api/chats/groups/${encodeURIComponent(chatId)}/members`, {
    method: 'POST',
    body: { user_id: userId },
  });
}

export function updateGroupMemberRole(
  chatId: string,
  userId: string,
  role: Exclude<GroupRole, 'owner'>,
): Promise<void> {
  return apiClient.request<void>(
    `/api/chats/groups/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: { role } },
  );
}

export function removeGroupMember(chatId: string, userId: string): Promise<void> {
  return apiClient.request<void>(
    `/api/chats/groups/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export function transferGroupOwnership(chatId: string, userId: string): Promise<void> {
  return apiClient.request<void>(`/api/chats/groups/${encodeURIComponent(chatId)}/ownership`, {
    method: 'POST',
    body: { user_id: userId },
  });
}

export function getGroupInviteState(chatId: string): Promise<GroupInviteState> {
  return apiClient.request<GroupInviteState>(`/api/chats/groups/${encodeURIComponent(chatId)}/invite`);
}

export function generateGroupInvite(chatId: string): Promise<GroupInvite> {
  return apiClient.request<GroupInvite>(`/api/chats/groups/${encodeURIComponent(chatId)}/invite`, {
    method: 'POST',
  });
}

export function revokeGroupInvite(chatId: string): Promise<GroupInviteState> {
  return apiClient.request<GroupInviteState>(`/api/chats/groups/${encodeURIComponent(chatId)}/invite`, {
    method: 'DELETE',
  });
}

export function joinGroupInvite(inviteToken: string): Promise<Chat> {
  return apiClient.request<Chat>('/api/chats/groups/join', {
    method: 'POST',
    body: { invite_token: inviteToken.trim() },
  });
}

export function sendTextMessage(
  chatId: string,
  text: string,
  options: TextMessageOptions = {},
): Promise<ChatMessage> {
  return apiClient.request<ChatMessage>(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: {
      text: text.trim(),
      type: 'text',
      ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
    },
  });
}

export async function uploadChatAttachment(
  attachment: ChatAttachmentUpload,
): Promise<UploadedChatAttachment> {
  const formData = new FormData();
  formData.append(
    'file',
    {
      uri: attachment.uri,
      name: attachment.name,
      type: attachment.mimeType,
    } as unknown as Blob,
  );

  return apiClient.requestMultipart<UploadedChatAttachment>('/api/uploads', {
    method: 'POST',
    formData,
  });
}

export async function uploadGroupAvatar(
  attachment: ChatAttachmentUpload,
): Promise<UploadedChatAttachment> {
  const formData = new FormData();
  formData.append(
    'file',
    {
      uri: attachment.uri,
      name: attachment.name,
      type: attachment.mimeType,
    } as unknown as Blob,
  );

  return apiClient.requestMultipart<UploadedChatAttachment>('/api/uploads/avatar', {
    method: 'POST',
    formData,
  });
}

export function sendMediaMessage(
  chatId: string,
  upload: UploadedChatAttachment,
  text = '',
  options: MediaMessageOptions = {},
): Promise<ChatMessage> {
  const type: ChatAttachmentMessageType =
    options.type ??
    (upload.suggested_message_type === 'photo' || upload.suggested_message_type === 'video'
      ? upload.suggested_message_type
      : 'file');
  const requiresDuration = type === 'voice' || type === 'video_note';
  const durationSeconds = options.durationSeconds;
  if (
    (requiresDuration &&
      (typeof durationSeconds !== 'number' ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds <= 0)) ||
    (!requiresDuration && durationSeconds !== undefined)
  ) {
    throw new Error('Для этого типа вложения указана некорректная длительность.');
  }

  return apiClient.request<ChatMessage>(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: {
      text: text.trim(),
      type,
      media_url: upload.media_url,
      media_name: upload.media_name,
      media_mime_type: upload.media_mime_type,
      media_size_bytes: upload.media_size_bytes,
      ...(requiresDuration ? { duration_seconds: durationSeconds } : {}),
      ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
    },
  });
}

export function editTextMessage(
  chatId: string,
  messageId: string,
  text: string,
): Promise<ChatMessage> {
  return apiClient.request<ChatMessage>(
    `/api/chats/${chatId}/messages/${messageId}`,
    {
      method: 'PATCH',
      body: { text: text.trim() },
    },
  );
}

export function deleteMessage(
  chatId: string,
  messageId: string,
): Promise<ChatMessage> {
  return apiClient.request<ChatMessage>(
    `/api/chats/${chatId}/messages/${messageId}`,
    {
      method: 'DELETE',
    },
  );
}

export function toggleMessageReaction(
  chatId: string,
  messageId: string,
  emoji: string,
): Promise<ChatMessage> {
  return apiClient.request<ChatMessage>(
    `/api/chats/${chatId}/messages/${messageId}/reactions`,
    {
      method: 'POST',
      body: { emoji },
    },
  );
}

export function togglePinMessage(chatId: string, messageId: string): Promise<Chat> {
  return apiClient.request<Chat>(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/pin`,
    {
      method: 'POST',
    },
  );
}

export function markMessagesRead(
  chatId: string,
  messageIds: string[],
): Promise<ChatMessage[]> {
  return apiClient.request<ChatMessage[]>(`/api/chats/${chatId}/read`, {
    method: 'POST',
    body: { message_ids: messageIds },
  });
}
