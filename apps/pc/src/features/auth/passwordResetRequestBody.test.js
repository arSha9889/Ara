import assert from 'node:assert/strict';
import test from 'node:test';

import { passwordResetConfirmRequestBody, passwordResetStartRequestBody } from './passwordResetRequestBody.js';

test('создаёт запрос на отправку кода восстановления пароля', () => {
  assert.deepEqual(passwordResetStartRequestBody({
    email: 'name@example.com',
    deviceId: 'desktop-device',
    language: 'ru',
  }), {
    email: 'name@example.com',
    device_id: 'desktop-device',
    language: 'ru',
  });
});

test('создаёт запрос на подтверждение нового пароля', () => {
  assert.deepEqual(passwordResetConfirmRequestBody({
    email: 'name@example.com',
    code: '123456',
    password: 'password1',
    deviceId: 'desktop-device',
  }), {
    email: 'name@example.com',
    code: '123456',
    new_password: 'password1',
    device_id: 'desktop-device',
  });
});
