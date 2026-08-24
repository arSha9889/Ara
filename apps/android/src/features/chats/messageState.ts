import type { ChatMessage } from './api/chatApi';

function messageTimestamp(message: ChatMessage): number {
  const timestamp = new Date(message.created_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function mergeChatMessages(
  currentMessages: ChatMessage[],
  incomingMessages: ChatMessage[],
): ChatMessage[] {
  const messagesById = new Map(currentMessages.map(message => [message.id, message]));

  incomingMessages.forEach(message => {
    messagesById.set(message.id, message);
  });

  return [...messagesById.values()].sort((left, right) => messageTimestamp(left) - messageTimestamp(right));
}

export function upsertChatMessage(currentMessages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return mergeChatMessages(currentMessages, [message]);
}
