import { chatPreview, chatTitle } from '../src/features/chats/chatPresentation';
import type { Chat, ChatPreviewMessage } from '../src/features/chats/api/chatApi';

const copy = {
  attachment: 'Attachment',
  call: 'Call',
  directChat: 'Direct chat',
  noMessages: 'No messages',
  savedMessages: 'Saved messages',
  youPrefix: 'You',
};

const chat: Chat = {
  id: 'chat-1',
  type: 'direct',
  created_at: '2026-08-23T08:00:00Z',
  updated_at: '2026-08-23T08:00:00Z',
  last_message_id: null,
  pinned_message_id: null,
  participant_ids: ['user-1', 'user-2'],
  peer: {
    id: 'user-2',
    display_name: 'Анна',
    username: 'anna',
    avatar_type: 'built_in',
    avatar_ref: 'animal-01',
    is_online: true,
    last_seen_at: null,
    is_official: false,
  },
  last_message: null,
  unread_count: 0,
  title: null,
  can_post: true,
};

const message: ChatPreviewMessage = {
  id: 'message-1',
  sender_id: 'user-1',
  type: 'text',
  payload: 'Привет',
  media_name: null,
  created_at: '2026-08-23T08:00:00Z',
};

test('uses the peer display name for a direct chat', () => {
  expect(chatTitle(chat, copy)).toBe('Анна');
});

test('uses the saved-messages label for a saved chat', () => {
  expect(chatTitle({ ...chat, type: 'saved', peer: null }, copy)).toBe('Saved messages');
});

test('labels the current user in a text-message preview', () => {
  expect(chatPreview(message, 'user-1', copy)).toBe('You: Привет');
});

test('uses a local attachment label when a media preview has no name', () => {
  expect(chatPreview({ ...message, type: 'photo', payload: '', media_name: null }, 'user-2', copy)).toBe(
    'Attachment',
  );
});

test('uses a local call label for call history previews', () => {
  expect(chatPreview({ ...message, type: 'call', payload: '{"version":1}', media_name: null }, 'user-2', copy)).toBe(
    'Call',
  );
});
