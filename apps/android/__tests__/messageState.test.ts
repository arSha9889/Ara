import type { ChatMessage } from '../src/features/chats/api/chatApi';
import {
  mergeChatMessages,
  upsertChatMessage,
} from '../src/features/chats/messageState';

function message(id: string, createdAt: string, payload = id): ChatMessage {
  return {
    id,
    chat_id: 'chat-1',
    sender_id: 'user-1',
    author: null,
    type: 'text',
    payload,
    media_url: null,
    media_name: null,
    media_mime_type: null,
    media_size_bytes: null,
    duration_seconds: null,
    encryption_state: 'none',
    delivery_status: 'sent',
    created_at: createdAt,
    edited_at: null,
    deleted_at: null,
    reactions: [],
  };
}

test('keeps one message when HTTP and realtime deliver the same message', () => {
  const firstMessage = message('message-1', '2026-08-23T12:00:00Z');

  expect(upsertChatMessage([firstMessage], firstMessage)).toEqual([
    firstMessage,
  ]);
});

test('merges resynced messages and orders them by creation time', () => {
  const olderMessage = message('message-1', '2026-08-23T12:00:00Z');
  const newerMessage = message('message-2', '2026-08-23T12:01:00Z');

  expect(
    mergeChatMessages([newerMessage], [olderMessage, newerMessage]),
  ).toEqual([olderMessage, newerMessage]);
});

test('updates reply previews when the source message changes or is deleted', () => {
  const source = message('source-1', '2026-08-23T12:00:00Z', 'Исходный текст');
  const reply = {
    ...message('reply-1', '2026-08-23T12:01:00Z', 'Ответ'),
    reply_to: {
      id: source.id,
      sender_id: source.sender_id,
      type: source.type,
      payload: source.payload,
      media_name: source.media_name,
      encryption_state: source.encryption_state,
      deleted_at: source.deleted_at,
    },
  };
  const editedSource = { ...source, payload: 'Обновлённый текст' };
  const deletedSource = { ...editedSource, deleted_at: '2026-08-23T12:02:00Z' };

  const afterEdit = upsertChatMessage([source, reply], editedSource);
  expect(afterEdit.find(item => item.id === reply.id)?.reply_to).toMatchObject({
    payload: 'Обновлённый текст',
    deleted_at: null,
  });

  const afterDelete = upsertChatMessage(afterEdit, deletedSource);
  expect(afterDelete.find(item => item.id === reply.id)?.reply_to).toMatchObject({
    payload: 'Обновлённый текст',
    deleted_at: '2026-08-23T12:02:00Z',
  });
});
