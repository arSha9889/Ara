import type { Chat, ChatMessage } from '../src/features/chats/api/chatApi';
import {
  applyCreatedMessageToChats,
  applyReadMessageToChats,
} from '../src/features/chats/chatRealtime';

const chat: Chat = {
  id: 'chat-1',
  type: 'direct',
  created_at: '2026-08-23T11:00:00Z',
  updated_at: '2026-08-23T11:00:00Z',
  last_message_id: null,
  pinned_message_id: null,
  participant_ids: ['user-1', 'user-2'],
  peer: {
    id: 'user-2',
    display_name: 'Друг',
    username: 'friend',
    avatar_type: 'built_in',
    avatar_ref: 'animal-01',
    is_online: false,
    last_seen_at: null,
    is_official: false,
  },
  last_message: null,
  unread_count: 0,
  title: null,
  can_post: true,
};

const incomingMessage: ChatMessage = {
  id: 'message-1',
  chat_id: 'chat-1',
  sender_id: 'user-2',
  author: null,
  type: 'text',
  payload: 'Привет',
  media_url: null,
  media_name: null,
  media_mime_type: null,
  media_size_bytes: null,
  duration_seconds: null,
  encryption_state: 'none',
  delivery_status: 'sent',
  created_at: '2026-08-23T12:00:00Z',
  edited_at: null,
  deleted_at: null,
  reactions: [],
};

test('updates the preview and unread count for an incoming realtime message', () => {
  expect(applyCreatedMessageToChats([chat], incomingMessage, 'user-1')).toEqual(
    [
      {
        ...chat,
        last_message: {
          id: 'message-1',
          sender_id: 'user-2',
          type: 'text',
          payload: 'Привет',
          media_name: null,
          created_at: '2026-08-23T12:00:00Z',
        },
        last_message_id: 'message-1',
        unread_count: 1,
        updated_at: '2026-08-23T12:00:00Z',
      },
    ],
  );
});

test('decrements unread count only for a read event from the current user', () => {
  const unreadChat = { ...chat, unread_count: 2 };

  expect(
    applyReadMessageToChats([unreadChat], incomingMessage, 'user-1', 'user-1'),
  ).toEqual([{ ...unreadChat, unread_count: 1 }]);
  expect(
    applyReadMessageToChats([unreadChat], incomingMessage, 'user-2', 'user-1'),
  ).toEqual([unreadChat]);
});
