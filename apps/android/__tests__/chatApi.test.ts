import { apiClient } from '../src/infrastructure/http/apiClient';
import {
  createDirectChatForUser,
  deleteMessage,
  editTextMessage,
  getChats,
  getMessages,
  markMessagesRead,
  sendTextMessage,
  toggleMessageReaction,
} from '../src/features/chats/api/chatApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
});

test('loads only chat types included in Android v1', async () => {
  request.mockResolvedValue([
    { id: 'direct-1', type: 'direct' },
    { id: 'saved-1', type: 'saved' },
    { id: 'branch-1', type: 'branch' },
  ]);

  await expect(getChats()).resolves.toEqual([
    { id: 'direct-1', type: 'direct' },
    { id: 'saved-1', type: 'saved' },
  ]);
  expect(request).toHaveBeenCalledWith('/api/chats');
});

test('uses the existing backend endpoints for history, sending, and read state', async () => {
  request.mockResolvedValue([]);

  await getMessages('chat-1');
  await sendTextMessage('chat-1', '  Привет  ');
  await markMessagesRead('chat-1', ['message-1']);

  expect(request).toHaveBeenNthCalledWith(1, '/api/chats/chat-1/messages');
  expect(request).toHaveBeenNthCalledWith(2, '/api/chats/chat-1/messages', {
    method: 'POST',
    body: { text: 'Привет', type: 'text' },
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/chats/chat-1/read', {
    method: 'POST',
    body: { message_ids: ['message-1'] },
  });
});

test('uses the existing backend endpoints for editing, deleting, and reactions', async () => {
  request.mockResolvedValue({ id: 'message-1' });

  await editTextMessage('chat-1', 'message-1', '  Обновлённый текст  ');
  await toggleMessageReaction('chat-1', 'message-1', '👍');
  await deleteMessage('chat-1', 'message-1');

  expect(request).toHaveBeenNthCalledWith(
    1,
    '/api/chats/chat-1/messages/message-1',
    {
      method: 'PATCH',
      body: { text: 'Обновлённый текст' },
    },
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/api/chats/chat-1/messages/message-1/reactions',
    {
      method: 'POST',
      body: { emoji: '👍' },
    },
  );
  expect(request).toHaveBeenNthCalledWith(
    3,
    '/api/chats/chat-1/messages/message-1',
    {
      method: 'DELETE',
    },
  );
});

test('opens or creates a direct chat with a selected user', async () => {
  request.mockResolvedValue({ id: 'chat-1', type: 'direct' });

  await createDirectChatForUser('user-1');

  expect(request).toHaveBeenCalledWith('/api/chats/direct/users/user-1', {
    method: 'POST',
  });
});
