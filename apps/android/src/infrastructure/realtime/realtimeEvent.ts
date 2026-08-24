import type { ChatMessage } from '../../features/chats/api/chatApi';

export interface RealtimeEvent {
  event: string;
  chatId?: string;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  message?: ChatMessage;
  readerId?: string;
  reason?: string;
  userId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null || typeof value === 'string') {
    return value;
  }

  return undefined;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.chat_id === 'string' &&
    typeof value.sender_id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.payload === 'string' &&
    typeof value.created_at === 'string'
  );
}

export function parseRealtimeEvent(value: unknown): RealtimeEvent | null {
  if (!isRecord(value) || typeof value.event !== 'string') {
    return null;
  }

  return {
    event: value.event,
    chatId: stringValue(value.chat_id),
    isOnline: typeof value.is_online === 'boolean' ? value.is_online : undefined,
    lastSeenAt: nullableStringValue(value.last_seen_at),
    message: isChatMessage(value.message) ? value.message : undefined,
    readerId: stringValue(value.reader_id),
    reason: stringValue(value.reason),
    userId: stringValue(value.user_id),
  };
}
