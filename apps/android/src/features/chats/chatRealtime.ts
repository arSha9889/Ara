import type { Chat, ChatMessage, ChatPreviewMessage } from './api/chatApi';

function previewFromMessage(message: ChatMessage): ChatPreviewMessage {
  return {
    id: message.id,
    sender_id: message.sender_id,
    type: message.type,
    payload: message.payload,
    media_name: message.media_name,
    created_at: message.created_at,
  };
}

export function applyCreatedMessageToChats(
  chats: Chat[],
  message: ChatMessage,
  currentUserId: string | undefined,
): Chat[] {
  const chat = chats.find(item => item.id === message.chat_id);
  if (!chat || chat.last_message?.id === message.id) {
    return chats;
  }

  const updatedChat: Chat = {
    ...chat,
    last_message: previewFromMessage(message),
    last_message_id: message.id,
    unread_count:
      message.sender_id === currentUserId ? chat.unread_count : chat.unread_count + 1,
    updated_at: message.created_at,
  };

  return [updatedChat, ...chats.filter(item => item.id !== message.chat_id)];
}

export function applyReadMessageToChats(
  chats: Chat[],
  message: ChatMessage,
  readerId: string | undefined,
  currentUserId: string | undefined,
): Chat[] {
  if (readerId !== currentUserId || message.sender_id === currentUserId) {
    return chats;
  }

  return chats.map(chat =>
    chat.id === message.chat_id
      ? { ...chat, unread_count: Math.max(0, chat.unread_count - 1) }
      : chat,
  );
}
