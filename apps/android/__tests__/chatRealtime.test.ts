import type { Chat, ChatMessage } from '../src/features/chats/api/chatApi';
import {
  applyCreatedMessageToChats,
  applyReadMessageToChats,
  removeChatById,
  upsertGroupChat,
} from '../src/features/chats/chatRealtime';
import { chatPreview, type ChatPresentationCopy } from '../src/features/chats/chatPresentation';

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

test('upserts group state and removes a group after access loss', () => {
  const group: Chat = {
    ...chat,
    id: 'group-1',
    type: 'group',
    peer: null,
    title: 'Команда',
  };
  const refreshedGroup = { ...group, title: 'Новая команда', last_message_id: 'message-2' };

  expect(upsertGroupChat([chat, group], refreshedGroup)).toEqual([refreshedGroup, chat]);
  expect(upsertGroupChat([chat], chat)).toEqual([chat]);
  expect(removeChatById([refreshedGroup, chat], 'group-1')).toEqual([chat]);
});

test('updates a group lifecycle preview when its embedded system message arrives', () => {
  const group: Chat = { ...chat, id: 'group-1', type: 'group', peer: null, title: 'Команда' };
  const lifecycleMessage: ChatMessage = {
    ...incomingMessage,
    chat_id: group.id,
    type: 'system',
    payload: JSON.stringify({
      version: 1,
      action: 'member_joined',
      data: { member: { display_name: 'Анна' } },
    }),
  };
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

  const [updated] = applyCreatedMessageToChats([group], lifecycleMessage, 'user-1');

  expect(chatPreview(updated.last_message, 'user-1', copy)).toBe('Member joined: Анна');
});
