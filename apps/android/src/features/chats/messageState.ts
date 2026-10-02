import type { ChatMessage, ChatMessageReply } from './api/chatApi';

function messageTimestamp(message: ChatMessage): number {
  const timestamp = new Date(message.created_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function replySnapshotFromMessage(message: ChatMessage, reply: ChatMessageReply): ChatMessageReply {
  return {
    ...reply,
    deleted_at: message.deleted_at,
    encryption_state: message.encryption_state,
    media_name: message.media_name,
    payload: message.payload,
    sender_id: message.sender_id,
    type: message.type,
  };
}

export function mergeChatMessages(
  currentMessages: ChatMessage[],
  incomingMessages: ChatMessage[],
): ChatMessage[] {
  const messagesById = new Map(currentMessages.map(message => [message.id, message]));

  incomingMessages.forEach(message => {
    messagesById.set(message.id, message);
  });

  return [...messagesById.values()]
    .map(message => {
      const reply = message.reply_to;
      const source = reply ? messagesById.get(reply.id) : undefined;

      return source && reply
        ? { ...message, reply_to: replySnapshotFromMessage(source, reply) }
        : message;
    })
    .sort((left, right) => messageTimestamp(left) - messageTimestamp(right));
}

export function upsertChatMessage(currentMessages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return mergeChatMessages(currentMessages, [message]);
}
