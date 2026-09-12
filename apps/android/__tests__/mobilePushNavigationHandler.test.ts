import { getChats, type Chat } from '../src/features/chats/api/chatApi';
import { navigateFromMobilePush } from '../src/features/notifications/MobilePushNavigationHandler';

jest.mock('../src/features/chats/api/chatApi', () => ({
  getChats: jest.fn(),
}));

const mockGetChats = getChats as jest.Mock;
const chatId = 'b4983206-5337-42a8-8173-0b9f6a741451';
const notificationId = 'a20c6930-145f-4bc0-a8a6-2a20fcc021b1';
const chatCopy = {
  attachment: 'Вложение',
  directChat: 'Личный чат',
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

beforeEach(() => {
  mockGetChats.mockReset();
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
  });
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

test('opens a support ticket or settings without a notification body', async () => {
  const navigation = { navigate: jest.fn() };

  await navigateFromMobilePush(
    navigation as never,
    {
      kind: 'support',
      notificationId,
      supportTicketId: 'd1731abc-dc57-4bb8-a9d6-640a3d89ea2d',
    },
    chatCopy,
  );
  await navigateFromMobilePush(navigation as never, { kind: 'system', notificationId }, chatCopy);

  expect(navigation.navigate).toHaveBeenNthCalledWith(1, 'SupportTicket', {
    ticketId: 'd1731abc-dc57-4bb8-a9d6-640a3d89ea2d',
  });
  expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'MainTabs', { screen: 'Settings' });
});
