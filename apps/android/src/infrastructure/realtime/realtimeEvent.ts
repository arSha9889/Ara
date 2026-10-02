import type { Chat, ChatMessage } from '../../features/chats/api/chatApi';

export interface CallSessionDescription {
  sdp: string;
  type: 'answer' | 'offer';
}

export interface CallIceCandidate {
  candidate: string;
  sdpMLineIndex?: number;
  sdpMid?: string;
}

export interface RealtimeEvent {
  callId?: string;
  callType?: 'audio' | 'video';
  candidate?: CallIceCandidate;
  chat?: Chat;
  description?: CallSessionDescription;
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

function callType(value: unknown): 'audio' | 'video' | undefined {
  return value === 'audio' || value === 'video' ? value : undefined;
}

function callSessionDescription(value: unknown): CallSessionDescription | undefined {
  if (!isRecord(value) || (value.type !== 'offer' && value.type !== 'answer') || typeof value.sdp !== 'string') {
    return undefined;
  }

  return { sdp: value.sdp, type: value.type };
}

function callIceCandidate(value: unknown): CallIceCandidate | undefined {
  if (!isRecord(value) || typeof value.candidate !== 'string') {
    return undefined;
  }

  const candidate: CallIceCandidate = { candidate: value.candidate };
  if (typeof value.sdpMid === 'string') {
    candidate.sdpMid = value.sdpMid;
  }
  if (typeof value.sdpMLineIndex === 'number' && Number.isInteger(value.sdpMLineIndex)) {
    candidate.sdpMLineIndex = value.sdpMLineIndex;
  }

  return candidate;
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

function isChat(value: unknown): value is Chat {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    (value.pinned_message_id === null || typeof value.pinned_message_id === 'string')
  );
}

export function parseRealtimeEvent(value: unknown): RealtimeEvent | null {
  if (!isRecord(value) || typeof value.event !== 'string') {
    return null;
  }

  return {
    callId: stringValue(value.call_id),
    callType: callType(value.call_type),
    candidate: callIceCandidate(value.candidate),
    chat: isChat(value.chat) ? value.chat : undefined,
    description: callSessionDescription(value.description),
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
