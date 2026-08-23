import type { Chat, ChatPreviewMessage } from './api/chatApi';

export interface ChatPresentationCopy {
  attachment: string;
  directChat: string;
  noMessages: string;
  savedMessages: string;
  youPrefix: string;
}

export function chatTitle(chat: Chat, copy: ChatPresentationCopy): string {
  if (chat.type === 'saved') {
    return copy.savedMessages;
  }

  if (chat.peer?.display_name) {
    return chat.peer.display_name;
  }

  if (chat.peer?.username) {
    return `@${chat.peer.username}`;
  }

  return copy.directChat;
}

export function chatPreview(
  message: ChatPreviewMessage | null,
  currentUserId: string | undefined,
  copy: ChatPresentationCopy,
): string {
  if (!message) {
    return copy.noMessages;
  }

  const prefix = message.sender_id === currentUserId ? `${copy.youPrefix}: ` : '';
  const content =
    message.type === 'text' || message.type === 'emoji'
      ? message.payload
      : message.media_name || copy.attachment;

  return `${prefix}${content}`;
}

export function formatConversationTime(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
