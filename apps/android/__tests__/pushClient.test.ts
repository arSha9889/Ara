jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
  })),
  NativeModules: {
    AraChatPush: {
      addListener: jest.fn(),
      clearMessageNotificationsForChat: jest.fn(),
      getPendingNotificationOpen: jest.fn(),
      getNotificationPermissionStatus: jest.fn(),
      getTokens: jest.fn(),
      removeListeners: jest.fn(),
      requestNotificationPermission: jest.fn(),
      setNotificationOpenListenerActive: jest.fn(),
    },
  },
}));

import { NativeModules } from 'react-native';

import {
  clearMessageNotificationsForChat,
  getMobilePushTokens,
  getPendingMobilePushOpen,
} from '../src/features/notifications/pushClient';

const nativePush = NativeModules.AraChatPush as {
  clearMessageNotificationsForChat: jest.Mock;
  getPendingNotificationOpen: jest.Mock;
  getTokens: jest.Mock;
};

afterEach(() => {
  jest.clearAllMocks();
});

test('returns only RuStore tokens and ignores disabled Firebase tokens', async () => {
  nativePush.getTokens.mockResolvedValue({
    firebase: 'f'.repeat(32),
    rustore: 'r'.repeat(32),
    universal: 'u'.repeat(32),
  });

  await expect(getMobilePushTokens()).resolves.toEqual([
    { provider: 'rustore', token: 'r'.repeat(32) },
  ]);
});

test('returns the pending cold-start notification destination from the native bridge', async () => {
  const destination = {
    kind: 'message',
    notification_id: 'a20c6930-145f-4bc0-a8a6-2a20fcc021b1',
    chat_id: 'b4983206-5337-42a8-8173-0b9f6a741451',
  };
  nativePush.getPendingNotificationOpen.mockResolvedValue(destination);

  await expect(getPendingMobilePushOpen()).resolves.toEqual(destination);
});

test('asks the native bridge to clear message notifications only for the read chat', () => {
  clearMessageNotificationsForChat('b4983206-5337-42a8-8173-0b9f6a741451');

  expect(nativePush.clearMessageNotificationsForChat).toHaveBeenCalledWith(
    'b4983206-5337-42a8-8173-0b9f6a741451',
  );
});
