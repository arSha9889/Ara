import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import {
  getChats,
  getMessage,
  type Chat,
  type ChatMessage,
} from '../src/features/chats/api/chatApi';
import {
  MobilePushNavigationHandler,
  navigateFromMobilePush,
} from '../src/features/notifications/MobilePushNavigationHandler';

const mockAlert = jest.fn();
const mockGetPendingMobilePushOpen = jest.fn();
const mockMarkMobileNotificationsRead = jest.fn();
const mockSubscribeToMobilePushOpen = jest.fn();
const mockTranslations: Record<string, string> = {
  call: 'Звонок',
  chatsAttachment: 'Вложение',
  chatsDirectFallback: 'Личный чат',
  chatsSavedMessages: 'Сохранённые',
  groupChat: 'Группа',
  noMessages: 'Нет сообщений',
  notificationMessageUnavailable: 'Это сообщение больше недоступно.',
  youPrefix: 'Вы',
};

jest.mock('react-native', () => ({
  Alert: {
    alert: (...args: unknown[]) => mockAlert(...args),
  },
}));

jest.mock('../src/features/chats/api/chatApi', () => ({
  getChats: jest.fn(),
  getMessage: jest.fn(),
}));

jest.mock('../src/features/notifications/api/mobilePushApi', () => ({
  markMobileNotificationsRead: (...args: unknown[]) =>
    mockMarkMobileNotificationsRead(...args),
}));

jest.mock('../src/features/notifications/pushClient', () => ({
  getPendingMobilePushOpen: () => mockGetPendingMobilePushOpen(),
  subscribeToMobilePushOpen: (listener: (value: unknown) => void) =>
    mockSubscribeToMobilePushOpen(listener),
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => mockTranslations[key] ?? key,
  }),
}));

const mockGetChats = getChats as jest.Mock;
const mockGetMessage = getMessage as jest.Mock;
const chatId = 'b4983206-5337-42a8-8173-0b9f6a741451';
const messageId = '8fc57aec-8406-4d75-9994-7733ce1a69e2';
const notificationId = 'a20c6930-145f-4bc0-a8a6-2a20fcc021b1';
const chatCopy = {
  attachment: 'Вложение',
  call: 'Звонок',
  directChat: 'Личный чат',
  groupChat: 'Группа',
  noMessages: 'Нет сообщений',
  savedMessages: 'Сохранённые',
  youPrefix: 'Вы',
};

const directChat = {
  id: chatId,
  type: 'direct',
  peer: {
    id: '94c32a6a-221f-48cb-8a8d-74e8ad7c6d96',
    display_name: 'Мария',
  },
} as Chat;

const groupChat = {
  ...directChat,
  id: 'ae6997ea-55fa-45b9-9b48-6dc89e87786a',
  type: 'group',
  peer: null,
  title: 'Команда',
} as Chat;

const targetMessage: ChatMessage = {
  id: messageId,
  chat_id: chatId,
  sender_id: directChat.peer!.id,
  author: null,
  type: 'text',
  payload: 'Сообщение вне обычной истории',
  media_url: null,
  media_name: null,
  media_mime_type: null,
  media_size_bytes: null,
  duration_seconds: null,
  encryption_state: 'plain_web_core',
  delivery_status: 'received',
  created_at: '2026-09-26T15:00:00Z',
  edited_at: null,
  deleted_at: null,
  reactions: [],
};

let pushOpenListener: ((value: unknown) => void) | undefined;

function settleAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  mockGetChats.mockReset();
  mockGetMessage.mockReset();
  mockAlert.mockReset();
  mockGetPendingMobilePushOpen.mockReset();
  mockMarkMobileNotificationsRead.mockReset();
  mockSubscribeToMobilePushOpen.mockReset();
  pushOpenListener = undefined;
  mockGetPendingMobilePushOpen.mockResolvedValue(null);
  mockMarkMobileNotificationsRead.mockResolvedValue(undefined);
  mockSubscribeToMobilePushOpen.mockImplementation(listener => {
    pushOpenListener = listener;
    return () => undefined;
  });
});

test('opens only an available chat for a message notification', async () => {
  const navigation = { navigate: jest.fn() };
  mockGetChats.mockResolvedValue([directChat]);

  await navigateFromMobilePush(
    navigation as never,
    { kind: 'message', notificationId, chatId },
    chatCopy,
  );

  expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
    chatId,
    title: 'Мария',
    peerUserId: directChat.peer?.id,
    peerIsOnline: undefined,
    peerLastSeenAt: undefined,
  });
  expect(mockGetMessage).not.toHaveBeenCalled();
});

test('opens a group notification in the isolated group route without direct-peer fields', async () => {
  const navigation = { navigate: jest.fn() };
  mockGetChats.mockResolvedValue([groupChat]);

  await navigateFromMobilePush(
    navigation as never,
    { kind: 'message', notificationId, chatId: groupChat.id },
    chatCopy,
  );

  expect(navigation.navigate).toHaveBeenCalledWith('GroupChat', {
    chatId: groupChat.id,
    title: 'Команда',
  });
  expect(mockGetMessage).not.toHaveBeenCalled();
});

test('does not navigate when the message chat is unavailable to the current user', async () => {
  const navigation = { navigate: jest.fn() };
  mockGetChats.mockResolvedValue([]);

  await expect(navigateFromMobilePush(
    navigation as never,
    { kind: 'message', notificationId, chatId },
    chatCopy,
  )).rejects.toThrow('Chat is unavailable.');
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('verifies the exact target message before navigating from a message push', async () => {
  const navigation = { navigate: jest.fn() };
  const callOrder: string[] = [];
  mockGetChats.mockImplementation(async () => {
    callOrder.push('chats');
    return [directChat];
  });
  mockGetMessage.mockImplementation(async () => {
    callOrder.push('message');
    return targetMessage;
  });
  navigation.navigate.mockImplementation(() => callOrder.push('navigate'));

  await navigateFromMobilePush(
    navigation as never,
    { kind: 'message', notificationId, chatId, messageId },
    chatCopy,
  );

  expect(callOrder).toEqual(['chats', 'message', 'navigate']);
  expect(mockGetMessage).toHaveBeenCalledWith(chatId, messageId);
  expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
    chatId,
    title: 'Мария',
    peerUserId: directChat.peer?.id,
    peerIsOnline: undefined,
    peerLastSeenAt: undefined,
    targetMessageId: messageId,
    targetMessage,
  });
});

test('passes an exact group target to the isolated group route', async () => {
  const navigation = { navigate: jest.fn() };
  const groupMessage = { ...targetMessage, chat_id: groupChat.id };
  mockGetChats.mockResolvedValue([groupChat]);
  mockGetMessage.mockResolvedValue(groupMessage);

  await navigateFromMobilePush(
    navigation as never,
    { kind: 'message', notificationId, chatId: groupChat.id, messageId },
    chatCopy,
  );

  expect(navigation.navigate).toHaveBeenCalledWith('GroupChat', {
    chatId: groupChat.id,
    title: 'Команда',
    targetMessageId: messageId,
    targetMessage: groupMessage,
  });
});

test('does not navigate when the target message is unavailable', async () => {
  const navigation = { navigate: jest.fn() };
  mockGetChats.mockResolvedValue([directChat]);
  mockGetMessage.mockRejectedValue(new Error('Private server detail must not be shown'));

  await expect(
    navigateFromMobilePush(
      navigation as never,
      { kind: 'message', notificationId, chatId, messageId },
      chatCopy,
    ),
  ).rejects.toThrow('Message destination is unavailable.');
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('does not navigate when the target message is deleted or belongs to another chat', async () => {
  const navigation = { navigate: jest.fn() };
  mockGetChats.mockResolvedValue([directChat]);
  mockGetMessage.mockResolvedValue({
    ...targetMessage,
    chat_id: 'f4ea5e53-2a6e-49f6-82bc-eb9938e8e3e2',
    deleted_at: '2026-09-26T15:01:00Z',
  });

  await expect(
    navigateFromMobilePush(
      navigation as never,
      { kind: 'message', notificationId, chatId, messageId },
      chatCopy,
    ),
  ).rejects.toThrow('Message destination is unavailable.');
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('marks a notification as read only after exact-message navigation succeeds', async () => {
  const navigation = { navigate: jest.fn() };
  const callOrder: string[] = [];
  mockGetChats.mockImplementation(async () => {
    callOrder.push('chats');
    return [directChat];
  });
  mockGetMessage.mockImplementation(async () => {
    callOrder.push('message');
    return targetMessage;
  });
  navigation.navigate.mockImplementation(() => callOrder.push('navigate'));
  mockMarkMobileNotificationsRead.mockImplementation(async () => {
    callOrder.push('read');
  });

  let component: ReturnType<typeof create> | undefined;
  await act(async () => {
    component = create(
      createElement(MobilePushNavigationHandler, { navigation: navigation as never }),
    );
    await settleAsyncWork();
  });

  await act(async () => {
    pushOpenListener?.({
      kind: 'message',
      notification_id: notificationId,
      chat_id: chatId,
      message_id: messageId,
    });
    await settleAsyncWork();
  });

  expect(callOrder).toEqual(['chats', 'message', 'navigate', 'read']);
  expect(mockMarkMobileNotificationsRead).toHaveBeenCalledWith([notificationId]);

  await act(async () => {
    component?.unmount();
  });
});

test('does not mark an unavailable message notification as read or expose server detail', async () => {
  const navigation = { navigate: jest.fn() };
  mockGetChats.mockResolvedValue([directChat]);
  mockGetMessage.mockRejectedValue(new Error('Private server detail must not be shown'));

  let component: ReturnType<typeof create> | undefined;
  await act(async () => {
    component = create(
      createElement(MobilePushNavigationHandler, { navigation: navigation as never }),
    );
    await settleAsyncWork();
  });

  await act(async () => {
    pushOpenListener?.({
      kind: 'message',
      notification_id: notificationId,
      chat_id: chatId,
      message_id: messageId,
    });
    await settleAsyncWork();
  });

  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(mockMarkMobileNotificationsRead).not.toHaveBeenCalled();
  expect(mockAlert).toHaveBeenCalledWith('Это сообщение больше недоступно.');
  expect(mockAlert).not.toHaveBeenCalledWith(
    'Private server detail must not be shown',
  );

  await act(async () => {
    component?.unmount();
  });
});
