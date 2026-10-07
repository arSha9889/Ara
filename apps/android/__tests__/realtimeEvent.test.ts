import { parseRealtimeEvent } from '../src/infrastructure/realtime/realtimeEvent';

const message = {
  id: 'message-1',
  chat_id: 'chat-1',
  sender_id: 'user-1',
  type: 'text',
  payload: 'Привет',
  created_at: '2026-08-23T12:00:00Z',
};

const callHistory = {
  call_id: 'call-1',
  call_type: 'video',
  connected_at: '2026-10-07T09:00:05Z',
  direction: 'outgoing',
  duration_seconds: 65,
  ended_at: '2026-10-07T09:01:10Z',
  id: 'history-1',
  outcome: 'completed',
  peer: {
    avatar_ref: 'animal-01',
    avatar_type: 'built_in',
    display_name: 'Мария',
    id: 'user-2',
    is_official: false,
    username: 'maria',
  },
  started_at: '2026-10-07T09:00:00Z',
  chat_id: 'chat-1',
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

test('parses a validated persistent call history event', () => {
  expect(parseRealtimeEvent({
    event: 'call.history_created',
    call: callHistory,
  })).toEqual({
    callHistory,
    event: 'call.history_created',
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

test('preserves ephemeral typing event fields without message text', () => {
  expect(
    parseRealtimeEvent({
      event: 'typing.started',
      chat_id: 'chat-1',
      user_id: 'user-2',
    }),
  ).toEqual({
    event: 'typing.started',
    chatId: 'chat-1',
    userId: 'user-2',
  });
});

test('parses a pin update with the refreshed chat state', () => {
  const chat = {
    id: 'chat-1',
    type: 'direct',
    pinned_message_id: 'message-1',
    pinned_message: {
      id: 'message-1',
      sender_id: 'user-1',
      type: 'text',
      payload: 'Закреплённое сообщение',
      media_name: null,
      created_at: '2026-08-23T12:00:00Z',
    },
  };

  expect(
    parseRealtimeEvent({
      event: 'message.pin_updated',
      chat_id: 'chat-1',
      chat,
    }),
  ).toEqual({
    event: 'message.pin_updated',
    chatId: 'chat-1',
    chat,
  });
});

test('parses validated call signalling fields', () => {
  expect(
    parseRealtimeEvent({
      call_id: 'call-1',
      call_type: 'video',
      candidate: {
        candidate: 'candidate:1 1 udp 1 10.0.0.1 12345 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0',
      },
      chat_id: 'chat-1',
      description: { sdp: 'v=0', type: 'offer' },
      event: 'call.offer',
      user_id: 'user-2',
    }),
  ).toEqual({
      callId: 'call-1',
      callType: 'video',
    candidate: {
      candidate: 'candidate:1 1 udp 1 10.0.0.1 12345 typ host',
      sdpMLineIndex: 0,
      sdpMid: '0',
    },
    chatId: 'chat-1',
    description: { sdp: 'v=0', type: 'offer' },
    event: 'call.offer',
    userId: 'user-2',
  });
});
