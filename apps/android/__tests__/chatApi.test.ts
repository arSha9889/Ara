import { apiClient } from '../src/infrastructure/http/apiClient';
import {
  createDirectChatForUser,
  deleteMessage,
  editTextMessage,
  getChats,
  getMessages,
  markMessagesRead,
  sendMediaMessage,
  sendTextMessage,
  toggleMessageReaction,
  uploadChatAttachment,
} from '../src/features/chats/api/chatApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
    requestMultipart: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;
const requestMultipart = apiClient.requestMultipart as jest.Mock;

beforeEach(() => {
  request.mockReset();
  requestMultipart.mockReset();
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

test('uploads a selected attachment and creates a media message from its metadata', async () => {
  const upload = {
    media_url: '/api/media/0f281cc0-59f3-4d2f-9804-d0dc0c0a79f9',
    media_name: 'receipt.pdf',
    media_mime_type: 'application/pdf',
    media_size_bytes: 2048,
    suggested_message_type: 'file',
  };
  requestMultipart.mockResolvedValue(upload);
  request.mockResolvedValue({ id: 'message-1' });

  await expect(
    uploadChatAttachment({
      uri: 'file:///cache/receipt.pdf',
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
    }),
  ).resolves.toEqual(upload);
  await sendMediaMessage('chat-1', upload, '  Чек за поездку  ');

  expect(requestMultipart).toHaveBeenCalledWith('/api/uploads', {
    method: 'POST',
    formData: expect.any(FormData),
  });
  expect(request).toHaveBeenCalledWith('/api/chats/chat-1/messages', {
    method: 'POST',
    body: {
      text: 'Чек за поездку',
      type: 'file',
      media_url: upload.media_url,
      media_name: upload.media_name,
      media_mime_type: upload.media_mime_type,
      media_size_bytes: upload.media_size_bytes,
    },
  });
});

test('uses a photo message type only when the upload metadata explicitly marks it as a photo', async () => {
  request.mockResolvedValue({ id: 'message-1' });

  await sendMediaMessage('chat-1', {
    media_url: '/api/media/45543f5f-c86d-4af2-a14e-d786ff211a6c',
    media_name: 'sunset.jpg',
    media_mime_type: 'image/jpeg',
    media_size_bytes: 4096,
    suggested_message_type: 'photo',
  });

  expect(request).toHaveBeenCalledWith('/api/chats/chat-1/messages', {
    method: 'POST',
    body: {
      text: '',
      type: 'photo',
      media_url: '/api/media/45543f5f-c86d-4af2-a14e-d786ff211a6c',
      media_name: 'sunset.jpg',
      media_mime_type: 'image/jpeg',
      media_size_bytes: 4096,
    },
  });
});

test('uses a video message type only when the upload metadata explicitly marks it as a video', async () => {
  request.mockResolvedValue({ id: 'message-1' });

  await sendMediaMessage('chat-1', {
    media_url: '/api/media/c0b728e1-6265-4ad3-8189-09d87ad0a4c6',
    media_name: 'walk.mp4',
    media_mime_type: 'video/mp4',
    media_size_bytes: 8_192,
    suggested_message_type: 'video',
  });

  expect(request).toHaveBeenCalledWith('/api/chats/chat-1/messages', {
    method: 'POST',
    body: {
      text: '',
      type: 'video',
      media_url: '/api/media/c0b728e1-6265-4ad3-8189-09d87ad0a4c6',
      media_name: 'walk.mp4',
      media_mime_type: 'video/mp4',
      media_size_bytes: 8_192,
    },
  });
});

test('sends recorded voice and video notes with an explicit type and positive duration', async () => {
  request.mockResolvedValue({ id: 'message-1' });
  const voiceUpload = {
    media_url: '/api/media/5dd22a21-a64f-4ee5-9df0-48017257a33e',
    media_name: 'voice.m4a',
    media_mime_type: 'audio/mp4',
    media_size_bytes: 12_288,
    suggested_message_type: 'voice',
  };
  const videoNoteUpload = {
    media_url: '/api/media/23e3f4d5-6fd3-423e-b310-7b0fdf8f7359',
    media_name: 'video-note.mp4',
    media_mime_type: 'video/mp4',
    media_size_bytes: 32_768,
    suggested_message_type: 'video',
  };

  await sendMediaMessage('chat-1', voiceUpload, '  Голос  ', {
    durationSeconds: 9,
    type: 'voice',
  });
  await sendMediaMessage('chat-1', videoNoteUpload, '', {
    durationSeconds: 12,
    type: 'video_note',
  });

  expect(request).toHaveBeenNthCalledWith(1, '/api/chats/chat-1/messages', {
    method: 'POST',
    body: {
      text: 'Голос',
      type: 'voice',
      media_url: voiceUpload.media_url,
      media_name: voiceUpload.media_name,
      media_mime_type: voiceUpload.media_mime_type,
      media_size_bytes: voiceUpload.media_size_bytes,
      duration_seconds: 9,
    },
  });
  expect(request).toHaveBeenNthCalledWith(2, '/api/chats/chat-1/messages', {
    method: 'POST',
    body: {
      text: '',
      type: 'video_note',
      media_url: videoNoteUpload.media_url,
      media_name: videoNoteUpload.media_name,
      media_mime_type: videoNoteUpload.media_mime_type,
      media_size_bytes: videoNoteUpload.media_size_bytes,
      duration_seconds: 12,
    },
  });
});

test('rejects a recorded message without a positive duration before sending it', async () => {
  const upload = {
    media_url: '/api/media/5dd22a21-a64f-4ee5-9df0-48017257a33e',
    media_name: 'voice.m4a',
    media_mime_type: 'audio/mp4',
    media_size_bytes: 12_288,
    suggested_message_type: 'voice',
  };

  expect(() =>
    sendMediaMessage('chat-1', upload, '', { durationSeconds: 0, type: 'voice' }),
  ).toThrow('некорректная длительность');
  expect(request).not.toHaveBeenCalled();
});
