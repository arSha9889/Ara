import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldPromptForNotificationPermission } from './notificationPermissionPrompt.js';

test('предлагает включить уведомления после входа, если приложение ещё не получило разрешение', () => {
  assert.equal(shouldPromptForNotificationPermission({ desktopNotifications: true, permission: 'default' }), true);
  assert.equal(shouldPromptForNotificationPermission({ desktopNotifications: undefined, permission: 'default' }), true);
});

test('не запрашивает разрешение повторно, если пользователь выключил уведомления или система уже разрешила их', () => {
  assert.equal(shouldPromptForNotificationPermission({ desktopNotifications: false, permission: 'default' }), false);
  assert.equal(shouldPromptForNotificationPermission({ desktopNotifications: true, permission: 'granted' }), false);
  assert.equal(shouldPromptForNotificationPermission({ desktopNotifications: true, permission: 'unavailable' }), false);
});
