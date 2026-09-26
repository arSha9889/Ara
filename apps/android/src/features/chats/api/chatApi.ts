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

export type ChatAttachmentMessageType = 'photo' | 'video' | 'voice' | 'video_note' | 'file';

export interface MediaMessageOptions {
  durationSeconds?: number;
  type?: 'voice' | 'video_note';
}

export interface ChatPeer {
  id: string;
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  is_online: boolean;
  last_seen_at: string | null;
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
  unread_count: number;
  title: string | null;
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
}

function isSupportedMobileChat(chat: Chat): boolean {
  return chat.type === 'direct' || chat.type === 'saved';
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

export function sendTextMessage(
  chatId: string,
  text: string,
): Promise<ChatMessage> {
  return apiClient.request<ChatMessage>(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: { text: text.trim(), type: 'text' },
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

export function markMessagesRead(
  chatId: string,
  messageIds: string[],
): Promise<ChatMessage[]> {
  return apiClient.request<ChatMessage[]>(`/api/chats/${chatId}/read`, {
    method: 'POST',
    body: { message_ids: messageIds },
  });
}
