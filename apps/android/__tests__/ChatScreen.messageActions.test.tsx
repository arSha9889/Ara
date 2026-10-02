import type { ForwardedRef, ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import {
  sendTextMessage,
  togglePinMessage,
  type ChatMessage,
} from '../src/features/chats/api/chatApi';

const mockGetMessages = jest.fn();
const mockGetChat = jest.fn();
const mockSendTextMessage = sendTextMessage as jest.Mock;
const mockTogglePinMessage = togglePinMessage as jest.Mock;
const mockStartCall = jest.fn();
const mockSubscribeToChat = jest.fn();
const mockSubscribeToEvents = jest.fn();
const mockDirectCall = { call: null, startCall: (...args: unknown[]) => mockStartCall(...args) };
const mockI18n = { language: 'ru' as const, t: (key: string) => key };
const mockRealtime = {
  send: jest.fn(),
  subscribeToChat: (...args: unknown[]) => mockSubscribeToChat(...args),
  subscribeToEvents: (...args: unknown[]) => mockSubscribeToEvents(...args),
};
const mockSession = {
  session: {
    user: {
      id: 'user-1',
    },
  },
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
      delay: animation,
      loop: animation,
      parallel: animation,
      sequence: animation,
      stagger: animation,
      timing: animation,
    },
    AppState: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    FlatList,
    Image: 'Image',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    Modal: 'Modal',
    PermissionsAndroid: {
      PERMISSIONS: { CAMERA: 'CAMERA', RECORD_AUDIO: 'RECORD_AUDIO' },
      RESULTS: { GRANTED: 'granted' },
      request: jest.fn(),
    },
    Platform: {
      OS: 'android',
      select: (options: Record<string, unknown>) => options.android ?? options.default,
    },
    Pressable: 'Pressable',
    StyleSheet: {
      create: <T extends object>(styles: T) => styles,
      hairlineWidth: 1,
    },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
  };
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => undefined,
}));

jest.mock('../src/features/auth/authError', () => ({
  authErrorKey: () => 'error',
}));

jest.mock('../src/features/auth/session/useSession', () => ({
  useSession: () => mockSession,
}));

jest.mock('../src/features/chats/api/chatApi', () => ({
  deleteMessage: jest.fn(),
  editTextMessage: jest.fn(),
  getChat: (...args: unknown[]) => mockGetChat(...args),
  getMessage: jest.fn(),
  getMessages: (...args: unknown[]) => mockGetMessages(...args),
  markMessagesRead: jest.fn(),
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
  cancelChatVoiceRecording: jest.fn(),
  discardChatAttachmentDraft: jest.fn(),
  pickChatDocument: jest.fn(),
  pickChatPhoto: jest.fn(),
  pickChatVideo: jest.fn(),
  recordChatVideoNote: jest.fn(),
  startChatVoiceRecording: jest.fn(),
  stopChatVoiceRecording: jest.fn(),
}));

jest.mock('../src/features/chats/messageState', () => ({
  mergeChatMessages: (_current: unknown[], next: unknown[]) => next,
  upsertChatMessage: (current: { id: string }[], message: { id: string }) => [
    ...current.filter(item => item.id !== message.id),
    message,
  ],
}));

jest.mock('../src/features/calls/DirectCallProvider', () => ({
  useDirectCall: () => mockDirectCall,
}));

jest.mock('../src/features/realtime/RealtimeProvider', () => ({
  useRealtime: () => mockRealtime,
}));

jest.mock('../src/features/safety/api/safetyApi', () => ({
  blockUser: jest.fn(),
}));

jest.mock('../src/features/safety/components/ReportUserSheet', () => ({
  ReportUserSheet: 'ReportUserSheet',
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => mockI18n,
}));

jest.mock('../src/ui/AppScreen', () => ({
  AppScreen: 'AppScreen',
}));

jest.mock('../src/ui/EmptyState', () => ({
  EmptyState: 'EmptyState',
}));

jest.mock('../src/ui/Icon', () => ({
  Icon: 'Icon',
}));

jest.mock('../src/ui/IconButton', () => ({
  IconButton: 'IconButton',
}));

import { ChatScreen } from '../src/features/chats/screens/ChatScreen';

function settleAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function flattenedStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean));
  }

  return (style ?? {}) as Record<string, unknown>;
}

function ownTextMessage(
  id: string,
  deliveryStatus: 'sent' | 'delivered' | 'read',
): ChatMessage {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: 'user-1',
    author: null,
    type: 'text',
    payload: `${deliveryStatus} message`,
    media_url: null,
    media_name: null,
    media_mime_type: null,
    media_size_bytes: null,
    duration_seconds: null,
    encryption_state: 'encrypted',
    delivery_status: deliveryStatus,
    created_at: '2026-09-30T08:00:00Z',
    edited_at: null,
    deleted_at: null,
    reactions: [],
  };
}

async function renderChatScreen(messages: ChatMessage[]): Promise<ReturnType<typeof create>> {
  mockGetMessages.mockReset();
  mockGetChat.mockReset();
  mockSendTextMessage.mockReset();
  mockTogglePinMessage.mockReset();
  mockSubscribeToChat.mockReset();
  mockSubscribeToEvents.mockReset();
  mockGetMessages.mockResolvedValue(messages);
  mockGetChat.mockResolvedValue({ pinned_message: null });
  mockSendTextMessage.mockResolvedValue({ id: 'reply-message' });
  mockTogglePinMessage.mockResolvedValue({ pinned_message: null, pinned_message_id: null });
  mockSubscribeToChat.mockReturnValue(() => undefined);
  mockSubscribeToEvents.mockReturnValue(() => undefined);

  let component!: ReturnType<typeof create>;
  await act(async () => {
    component = create(
      <ChatScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{
          key: 'chat-1',
          name: 'Chat',
          params: {
            chatId: 'chat-1',
            peerUserId: 'peer-1',
            title: 'Peer',
          },
        } as never}
      />,
    );
    await settleAsyncWork();
  });

  return component;
}

test('keeps the edit form above the Android keyboard without a bottom sheet border', async () => {
  mockGetMessages.mockReset();
  mockGetChat.mockReset();
  mockSubscribeToChat.mockReset();
  mockSubscribeToEvents.mockReset();
  mockGetMessages.mockResolvedValue([
    {
      id: 'message-1',
      chat_id: 'chat-1',
      sender_id: 'user-1',
      author: null,
      type: 'text',
      payload: 'Own message',
      media_url: null,
      media_name: null,
      media_mime_type: null,
      media_size_bytes: null,
      duration_seconds: null,
      encryption_state: 'encrypted',
      delivery_status: 'sent',
      created_at: '2026-09-30T08:00:00Z',
      edited_at: null,
      deleted_at: null,
      reactions: [],
    },
  ]);
  mockGetChat.mockResolvedValue({ pinned_message: null });
  mockSubscribeToChat.mockReturnValue(() => undefined);
  mockSubscribeToEvents.mockReturnValue(() => undefined);

  let component!: ReturnType<typeof create>;
  await act(async () => {
    component = create(
      <ChatScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{
          key: 'chat-1',
          name: 'Chat',
          params: {
            chatId: 'chat-1',
            peerUserId: 'peer-1',
            title: 'Peer',
          },
        } as never}
      />,
    );
    await settleAsyncWork();
  });

  const message = component.root.findByProps({ accessibilityLabel: 'Own message' });
  act(() => {
    message.props.onLongPress();
  });

  const editLabel = component.root
    .findAllByType('Text' as never)
    .find(node => node.children.join('') === 'editMessage');
  expect(editLabel).toBeDefined();
  act(() => {
    editLabel?.parent?.props.onPress();
  });

  const messageActionsModal = component.root
    .findAllByType('Modal' as never)
    .find(node => node.props.visible);
  expect(messageActionsModal).toBeDefined();

  const keyboardAvoidingView = messageActionsModal?.findByType('KeyboardAvoidingView' as never);
  expect(keyboardAvoidingView?.props.behavior).toBe('height');
  expect(flattenedStyle(keyboardAvoidingView?.props.style)).toMatchObject({ flex: 1 });
  expect(
    messageActionsModal?.findByProps({ accessibilityLabel: 'editMessagePlaceholder' }).props.autoFocus,
  ).toBe(true);

  const sheet = messageActionsModal?.findByProps({ accessibilityViewIsModal: true });
  expect(flattenedStyle(sheet?.props.style)).toMatchObject({
    borderBottomWidth: 0,
    overflow: 'hidden',
  });

  await act(async () => {
    component.unmount();
  });
});

test('opens the attachment picker without an Android-unsupported dialog role', async () => {
  const component = await renderChatScreen([ownTextMessage('message-1', 'sent')]);
  const attachmentButton = component.root
    .findAllByProps({ accessibilityLabel: 'addAttachment' })
    .find(node => node.props.accessibilityRole === 'button');
  const attachmentPickerModal = component.root
    .findAllByType('Modal' as never)
    .find(modal =>
      modal
        .findAllByProps({ accessibilityLabel: 'addAttachment' })
        .some(node => node.props.accessibilityViewIsModal),
    );

  expect(attachmentButton).toBeDefined();
  expect(attachmentPickerModal?.props.visible).toBe(false);

  act(() => {
    attachmentButton?.props.onPress();
  });

  const attachmentSheet = attachmentPickerModal
    ?.findAllByProps({ accessibilityLabel: 'addAttachment' })
    .find(node => node.props.accessibilityViewIsModal);
  expect(attachmentPickerModal?.props.visible).toBe(true);
  expect(attachmentSheet?.props.accessibilityViewIsModal).toBe(true);
  expect(attachmentSheet?.props.accessibilityRole).toBeUndefined();

  await act(async () => {
    component.unmount();
  });
});

test('renders sent, delivered, and read message statuses like WhatsApp', async () => {
  const component = await renderChatScreen([
    ownTextMessage('message-sent', 'sent'),
    ownTextMessage('message-delivered', 'delivered'),
    ownTextMessage('message-read', 'read'),
  ]);

  const sent = component.root.findByProps({ accessibilityLabel: 'messageSent' });
  const delivered = component.root.findByProps({ accessibilityLabel: 'messageDelivered' });
  const read = component.root.findByProps({ accessibilityLabel: 'messageRead' });

  expect(sent.children).toEqual(['✓']);
  expect(flattenedStyle(sent.props.style).color).toBe('rgba(9, 18, 31, 0.68)');
  expect(delivered.children).toEqual(['✓✓']);
  expect(flattenedStyle(delivered.props.style).color).toBe('rgba(9, 18, 31, 0.68)');
  expect(read.children).toEqual(['✓✓']);
  expect(flattenedStyle(read.props.style).color).toBe('#00396A');

  await act(async () => {
    component.unmount();
  });
});

test('sends a text reply with the selected source message ID', async () => {
  const component = await renderChatScreen([ownTextMessage('message-1', 'sent')]);
  const message = component.root.findByProps({ accessibilityLabel: 'sent message' });

  act(() => {
    message.props.onLongPress();
  });
  act(() => {
    component.root.findByProps({ accessibilityLabel: 'replyMessage' }).props.onPress();
  });
  act(() => {
    component.root
      .findByProps({ accessibilityLabel: 'messageInputPlaceholder' })
      .props.onChangeText('Ответ');
  });

  await act(async () => {
    component.root.findByProps({ accessibilityLabel: 'sendMessage' }).props.onPress();
    await settleAsyncWork();
  });

  expect(mockSendTextMessage).toHaveBeenCalledWith('chat-1', 'Ответ', {
    replyToMessageId: 'message-1',
  });

  await act(async () => {
    component.unmount();
  });
});

test('pins a message from its action sheet', async () => {
  const component = await renderChatScreen([ownTextMessage('message-1', 'sent')]);
  mockTogglePinMessage.mockResolvedValue({
    pinned_message_id: 'message-1',
    pinned_message: {
      id: 'message-1',
      sender_id: 'user-1',
      type: 'text',
      payload: 'sent message',
      media_name: null,
      created_at: '2026-09-30T08:00:00Z',
    },
  });
  const message = component.root.findByProps({ accessibilityLabel: 'sent message' });

  act(() => {
    message.props.onLongPress();
  });
  await act(async () => {
    component.root.findByProps({ accessibilityLabel: 'pinMessage' }).props.onPress();
    await settleAsyncWork();
  });

  expect(mockTogglePinMessage).toHaveBeenCalledWith('chat-1', 'message-1');
  expect(component.root.findByProps({ accessibilityLabel: 'pinnedMessage: youPrefix. sent message' })).toBeDefined();

  await act(async () => {
    component.unmount();
  });
});
