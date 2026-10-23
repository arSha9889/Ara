import {
  chatPreview,
  chatTitle,
  groupLifecycleText,
  type ChatPresentationCopy,
} from '../src/features/chats/chatPresentation';
import type { Chat, ChatPreviewMessage } from '../src/features/chats/api/chatApi';

const copy: ChatPresentationCopy = {
  attachment: 'Attachment',
  call: 'Call',
  directChat: 'Direct chat',
  file: 'Document',
  groupChat: 'Group chat',
  groupCreated: 'Group created',
  groupCreatedWithMembers: 'Group created with members',
  groupLifecycleFallback: 'Group activity',
  groupMemberAdded: 'Member added',
  groupMemberJoined: 'Member joined',
  groupMemberLeft: 'Member left',
  groupMemberRemoved: 'Member removed',
  groupMemberRoleChanged: 'Member role changed',
  groupOwnershipTransferred: 'Ownership transferred',
  groupRoleAdmin: 'Admin',
  groupRoleMember: 'Member',
  noMessages: 'No messages',
  photo: 'Photo',
  savedMessages: 'Saved messages',
  youPrefix: 'You',
  video: 'Video',
  videoNote: 'Video note',
  voice: 'Voice message',
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

test('uses a group title with a localized fallback', () => {
  expect(chatTitle({ ...chat, type: 'group', peer: null, title: 'Команда' }, copy)).toBe('Команда');
  expect(chatTitle({ ...chat, type: 'group', peer: null, title: '   ' }, copy)).toBe('Group chat');
});

test('labels the current user in a text-message preview', () => {
  expect(chatPreview(message, 'user-1', copy)).toBe('You: Привет');
});

test('uses a local attachment type instead of a technical media name', () => {
  expect(
    chatPreview(
      { ...message, type: 'voice', payload: '', media_name: 'voice-1791120270447.m4a' },
      'user-2',
      copy,
    ),
  ).toBe('Voice message');
});

test.each([
  ['photo', 'Photo'],
  ['video', 'Video'],
  ['video_note', 'Video note'],
  ['file', 'Document'],
])('uses the user-facing %s label for a media preview', (type, expected) => {
  expect(chatPreview({ ...message, type, payload: '', media_name: 'technical-name.bin' }, 'user-2', copy)).toBe(
    expected,
  );
});

test('uses a local call label for call history previews', () => {
  expect(chatPreview({ ...message, type: 'call', payload: '{"version":1}', media_name: null }, 'user-2', copy)).toBe(
    'Call',
  );
});

test('renders a group lifecycle preview instead of its JSON payload', () => {
  expect(
    chatPreview(
      {
        ...message,
        type: 'system',
        payload: JSON.stringify({
          version: 1,
          action: 'member_role_changed',
          data: { member: { display_name: 'Анна' }, role: 'admin' },
        }),
      },
      'user-2',
      copy,
    ),
  ).toBe('Member role changed: Анна — Admin');
});

test('uses a neutral fallback for malformed or unknown group lifecycle payloads', () => {
  expect(groupLifecycleText('{"version":1,"action":"unknown","data":{}}', copy)).toBe(
    'Group activity',
  );
  expect(groupLifecycleText('backend JSON must not be shown', copy)).toBe('Group activity');
});
