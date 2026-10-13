import type { Chat, ChatPreviewMessage } from './api/chatApi';

export interface AttachmentPresentationCopy {
  attachment: string;
  file: string;
  photo: string;
  video: string;
  videoNote: string;
  voice: string;
}

export interface ChatPresentationCopy extends AttachmentPresentationCopy {
  call: string;
  directChat: string;
  noMessages: string;
  savedMessages: string;
  youPrefix: string;
}

export function chatTitle(
  chat: Chat,
  copy: Pick<ChatPresentationCopy, 'directChat' | 'savedMessages'>,
): string {
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

export function attachmentLabel(type: string, copy: AttachmentPresentationCopy): string {
  switch (type) {
    case 'photo':
      return copy.photo;
    case 'video':
      return copy.video;
    case 'voice':
      return copy.voice;
    case 'video_note':
      return copy.videoNote;
    case 'file':
      return copy.file;
    default:
      return copy.attachment;
  }
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
      : message.type === 'call'
        ? copy.call
        : attachmentLabel(message.type, copy);

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
