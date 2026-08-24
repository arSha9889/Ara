import type { ChatMessage } from '../src/features/chats/api/chatApi';
import {
  mergeChatMessages,
  upsertChatMessage,
} from '../src/features/chats/messageState';

function message(id: string, createdAt: string, payload = id): ChatMessage {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: 'user-1',
    author: null,
    type: 'text',
    payload,
    media_url: null,
    media_name: null,
    media_mime_type: null,
    media_size_bytes: null,
    duration_seconds: null,
    encryption_state: 'none',
    delivery_status: 'sent',
    created_at: createdAt,
    edited_at: null,
    deleted_at: null,
    reactions: [],
  };
}

test('keeps one message when HTTP and realtime deliver the same message', () => {
  const firstMessage = message('message-1', '2026-08-23T12:00:00Z');

  expect(upsertChatMessage([firstMessage], firstMessage)).toEqual([
    firstMessage,
  ]);
});

test('merges resynced messages and orders them by creation time', () => {
  const olderMessage = message('message-1', '2026-08-23T12:00:00Z');
  const newerMessage = message('message-2', '2026-08-23T12:01:00Z');

  expect(
    mergeChatMessages([newerMessage], [olderMessage, newerMessage]),
  ).toEqual([olderMessage, newerMessage]);
});
