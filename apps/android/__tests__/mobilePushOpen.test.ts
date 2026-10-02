import { parseMobilePushOpen } from '../src/features/notifications/mobilePushOpen';

const notificationId = 'a20c6930-145f-4bc0-a8a6-2a20fcc021b1';
const chatId = 'b4983206-5337-42a8-8173-0b9f6a741451';
const messageId = 'cc0a820e-741d-4c7e-ad55-431549b9d4cf';

test('accepts a message destination with neutral identifiers only', () => {
  expect(parseMobilePushOpen({
    kind: 'message',
    notification_id: notificationId,
    chat_id: chatId,
    message_id: messageId,
  })).toEqual({
    kind: 'message',
    notificationId,
    chatId,
    messageId,
  });
});

test.each([
  null,
  { kind: 'message', notification_id: notificationId },
  { kind: 'message', notification_id: notificationId, chat_id: 'not-a-uuid' },
  { kind: 'message', notification_id: notificationId, chat_id: chatId, message_id: 'not-a-uuid' },
  { kind: 'support', notification_id: notificationId, chat_id: chatId },
  { kind: 'unknown', notification_id: notificationId },
  { kind: 'system', notification_id: notificationId, chat_id: chatId },
])('rejects malformed or unsupported native payload %#', value => {
  expect(parseMobilePushOpen(value)).toBeNull();
});
