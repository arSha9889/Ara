import { parseRealtimeEvent } from '../src/infrastructure/realtime/realtimeEvent';

const message = {
  id: 'message-1',
  chat_id: 'chat-1',
  sender_id: 'user-1',
  type: 'text',
  payload: 'Привет',
  created_at: '2026-08-23T12:00:00Z',
};

test('parses a valid message event from the server contract', () => {
  expect(
    parseRealtimeEvent({
      event: 'message.created',
      chat_id: 'chat-1',
      message,
    }),
  ).toEqual({
    event: 'message.created',
    chatId: 'chat-1',
    message,
  });
});

test('rejects malformed realtime payloads without throwing', () => {
  expect(parseRealtimeEvent(null)).toBeNull();
  expect(parseRealtimeEvent({ event: 'message.created', message: { id: 'message-1' } })).toEqual({
    event: 'message.created',
    message: undefined,
  });
});

test('preserves presence status fields', () => {
  expect(
    parseRealtimeEvent({
      event: 'presence.status',
      chat_id: 'chat-1',
      user_id: 'user-2',
      is_online: false,
      last_seen_at: '2026-08-23T11:59:00Z',
    }),
  ).toEqual({
    event: 'presence.status',
    chatId: 'chat-1',
    userId: 'user-2',
    isOnline: false,
    lastSeenAt: '2026-08-23T11:59:00Z',
  });
});
