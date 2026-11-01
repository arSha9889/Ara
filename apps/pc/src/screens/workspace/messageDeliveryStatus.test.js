import assert from 'node:assert/strict';
import test from 'node:test';

import { messageDeliveryIndicator } from './messageDeliveryStatus.js';

test('выбирает одну серую галочку для отправленного сообщения', () => {
  assert.deepEqual(messageDeliveryIndicator('sent'), { icon: 'check', tone: 'sent' });
});

test('выбирает две серые галочки для доставленного сообщения', () => {
  assert.deepEqual(messageDeliveryIndicator('delivered'), { icon: 'check-double', tone: 'delivered' });
});

test('выбирает две голубые галочки для прочитанного сообщения', () => {
  assert.deepEqual(messageDeliveryIndicator('read'), { icon: 'check-double', tone: 'read' });
});

test('сохраняет безопасный статус отправки для неизвестного ответа API', () => {
  assert.deepEqual(messageDeliveryIndicator(undefined), { icon: 'check', tone: 'sent' });
});
