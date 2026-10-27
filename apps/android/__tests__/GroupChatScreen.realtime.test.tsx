import type { ForwardedRef, ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import type { Chat, ChatMessage } from '../src/features/chats/api/chatApi';

const mockGetChat = jest.fn();
const mockGetMessages = jest.fn();
const mockMarkMessagesRead = jest.fn();
const mockSubscribeToChat = jest.fn();
const mockSubscribeToEvents = jest.fn();
let realtimeListener: ((event: Record<string, unknown>) => void) | undefined;
const mockI18n = { language: 'ru', t: (key: string) => key };
const mockRealtime = {
  subscribeToChat: (...args: unknown[]) => mockSubscribeToChat(...args),
  subscribeToEvents: (...args: unknown[]) => mockSubscribeToEvents(...args),
};

jest.mock('../src/infrastructure/http/apiClient', () => ({
  ApiError: class MockHttpApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const { ApiError: MockApiError } = jest.requireMock('../src/infrastructure/http/apiClient') as {
  ApiError: new (message: string, status: number) => Error;
};

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  class MockAnimatedValue {
    interpolate = jest.fn(() => this);
    setValue = jest.fn();
    stopAnimation = jest.fn();

    constructor(_value: number) {}
  }
  const animation = () => ({ start: jest.fn(), stop: jest.fn() });
  const FlatList = React.forwardRef(
    (
      props: {
        data?: unknown[];
        ListEmptyComponent?: ReactNode;
        renderItem?: (input: { item: unknown; index: number }) => ReactNode;
      },
      ref: ForwardedRef<{ scrollToEnd(): void; scrollToIndex(): void }>,
    ) => {
      React.useImperativeHandle(ref, () => ({
        scrollToEnd: () => undefined,
        scrollToIndex: () => undefined,
      }));
      const children = props.renderItem
        ? props.data?.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: (item as { id?: string }).id ?? index },
              props.renderItem?.({ item, index }),
            ),
          )
        : props.ListEmptyComponent;

      return React.createElement('FlatList', props, children);
    },
  );

  return {
    AccessibilityInfo: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      isReduceMotionEnabled: jest.fn().mockResolvedValue(true),
    },
    ActivityIndicator: 'ActivityIndicator',
    Alert: { alert: jest.fn() },
    Animated: {
      Value: MockAnimatedValue,
      View: 'AnimatedView',
      timing: animation,
    },
    FlatList,
    Image: 'Image',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    Modal: 'Modal',
    Platform: { select: (options: Record<string, unknown>) => options.android ?? options.default },
    Pressable: 'Pressable',
    StyleSheet: {
      absoluteFill: {},
      create: <T extends object>(styles: T) => styles,
      hairlineWidth: 1,
    },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
  };
});

jest.mock('../src/features/auth/authError', () => ({
  authErrorKey: () => 'error',
}));

jest.mock('../src/features/auth/session/useSession', () => ({
  useSession: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('../src/features/chats/api/chatApi', () => ({
  deleteMessage: jest.fn(),
  editTextMessage: jest.fn(),
  getChat: (...args: unknown[]) => mockGetChat(...args),
  getMessages: (...args: unknown[]) => mockGetMessages(...args),
  markMessagesRead: (...args: unknown[]) => mockMarkMessagesRead(...args),
  sendMediaMessage: jest.fn(),
  sendTextMessage: jest.fn(),
  toggleMessageReaction: jest.fn(),
  togglePinMessage: jest.fn(),
  uploadChatAttachment: jest.fn(),
}));

jest.mock('../src/features/chats/components/ChatAttachmentContent', () => ({
  ChatFileAttachment: 'ChatFileAttachment',
  ChatPhotoAttachment: 'ChatPhotoAttachment',
  ChatVideoAttachment: 'ChatVideoAttachment',
  ChatVideoNoteAttachment: 'ChatVideoNoteAttachment',
  ChatVoiceAttachment: 'ChatVoiceAttachment',
}));

jest.mock('../src/features/chats/components/ChatAvatar', () => ({
  ChatAvatar: 'ChatAvatar',
}));

jest.mock('../src/features/chats/media/mediaClient', () => ({
  discardChatAttachmentDraft: jest.fn().mockResolvedValue(undefined),
  pickChatDocument: jest.fn(),
  pickChatPhoto: jest.fn(),
  pickChatVideo: jest.fn(),
}));

jest.mock('../src/features/realtime/RealtimeProvider', () => ({
  useRealtime: () => mockRealtime,
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => mockI18n,
}));

jest.mock('../src/ui/AppScreen', () => ({ AppScreen: 'AppScreen' }));
jest.mock('../src/ui/EmptyState', () => ({ EmptyState: 'EmptyState' }));
jest.mock('../src/ui/Icon', () => ({ Icon: 'Icon' }));
jest.mock('../src/ui/IconButton', () => ({ IconButton: 'IconButton' }));

import { GroupChatScreen } from '../src/features/chats/screens/GroupChatScreen';

const group: Chat = {
  id: 'group-1',
  type: 'group',
  created_at: '2026-10-23T08:00:00Z',
  updated_at: '2026-10-23T08:00:00Z',
  last_message_id: null,
  pinned_message_id: null,
  participant_ids: ['user-1', 'user-2'],
  peer: null,
  last_message: null,
  unread_count: 0,
  title: 'Команда',
  avatar_ref: null,
  can_post: true,
};

const lifecycleMessage: ChatMessage = {
  id: 'message-1',
  chat_id: group.id,
  sender_id: 'user-2',
  author: null,
  type: 'system',
  payload: JSON.stringify({
    version: 1,
    action: 'member_joined',
    data: { member: { display_name: 'Мария' } },
  }),
  media_url: null,
  media_name: null,
  media_mime_type: null,
  media_size_bytes: null,
  duration_seconds: null,
  encryption_state: 'plain_web_core',
  delivery_status: 'received',
  created_at: '2026-10-23T08:01:00Z',
  edited_at: null,
  deleted_at: null,
  reactions: [],
};

function settleAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function renderGroupChat(
  options: {
    chat?: Promise<Chat> | Chat;
    chatError?: Error;
    messages?: Promise<ChatMessage[]> | ChatMessage[];
  } = {},
): Promise<{
  component: ReturnType<typeof create>;
  navigation: { goBack: jest.Mock; navigate: jest.Mock; popToTop: jest.Mock; setParams: jest.Mock };
  unsubscribeChat: jest.Mock;
}> {
  mockGetChat.mockReset();
  mockGetMessages.mockReset();
  mockMarkMessagesRead.mockReset();
  mockSubscribeToChat.mockReset();
  mockSubscribeToEvents.mockReset();
  realtimeListener = undefined;
  if (options.chatError) {
    mockGetChat.mockRejectedValue(options.chatError);
  } else {
    mockGetChat.mockResolvedValue(options.chat ?? group);
  }
  mockGetMessages.mockResolvedValue(options.messages ?? []);
  mockMarkMessagesRead.mockResolvedValue([]);
  const unsubscribeChat = jest.fn();
  mockSubscribeToChat.mockReturnValue(unsubscribeChat);
  mockSubscribeToEvents.mockImplementation(listener => {
    realtimeListener = listener;
    return jest.fn();
  });
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    popToTop: jest.fn(),
    setParams: jest.fn(),
  };
  let component!: ReturnType<typeof create>;

  await act(async () => {
    component = create(
      <GroupChatScreen
        navigation={navigation as never}
        route={{
          key: group.id,
          name: 'GroupChat',
          params: { chatId: group.id, title: group.title ?? 'Группа' },
        } as never}
      />,
    );
    await settleAsyncWork();
  });

  return { component, navigation, unsubscribeChat };
}

test('renders a localized group lifecycle message instead of the stored JSON payload', async () => {
  const { component } = await renderGroupChat({ messages: [lifecycleMessage] });

  expect(
    component.root
      .findAllByType('Text' as never)
      .some(node => node.children.join('') === 'groupMemberJoined: Мария'),
  ).toBe(true);
  expect(
    component.root
      .findAllByType('Text' as never)
      .some(node => node.children.join('') === lifecycleMessage.payload),
  ).toBe(false);
  expect(mockMarkMessagesRead).toHaveBeenCalledWith(group.id, [lifecycleMessage.id]);

  await act(async () => {
    component.unmount();
  });
});

test('merges a lifecycle message embedded in group realtime state', async () => {
  const { component } = await renderGroupChat();

  await act(async () => {
    realtimeListener?.({
      chat: { ...group, participant_ids: [...group.participant_ids, 'user-3'] },
      chatId: group.id,
      event: 'group.member_joined',
      message: lifecycleMessage,
    });
  });

  expect(
    component.root
      .findAllByType('Text' as never)
      .some(node => node.children.join('') === 'groupMemberJoined: Мария'),
  ).toBe(true);

  await act(async () => {
    component.unmount();
  });
});

test('closes the group and releases its subscription after own membership is removed', async () => {
  const { component, navigation, unsubscribeChat } = await renderGroupChat();

  await act(async () => {
    realtimeListener?.({
      chatId: group.id,
      event: 'group.member_removed',
      member: { display_name: 'Анна', user_id: 'user-1' },
    });
  });

  expect(navigation.popToTop).toHaveBeenCalledTimes(1);
  await act(async () => {
    component.unmount();
  });
  expect(unsubscribeChat).toHaveBeenCalledTimes(1);
});

test('treats a missing group API response as access loss rather than a visible transport error', async () => {
  const { component, navigation } = await renderGroupChat({
    chatError: new MockApiError('Request failed.', 404),
    messages: [],
  });

  expect(navigation.popToTop).toHaveBeenCalledTimes(1);
  expect(
    component.root
      .findAllByType('Text' as never)
      .some(node => node.children.join('') === 'error'),
  ).toBe(false);

  await act(async () => {
    component.unmount();
  });
});
