jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
  })),
  NativeModules: {
    AraChatPush: {
      addListener: jest.fn(),
      getNotificationPermissionStatus: jest.fn(),
      getTokens: jest.fn(),
      removeListeners: jest.fn(),
      requestNotificationPermission: jest.fn(),
    },
  },
}));

import { NativeModules } from 'react-native';

import { getMobilePushTokens } from '../src/features/notifications/pushClient';

const nativePush = NativeModules.AraChatPush as {
  getTokens: jest.Mock;
};

afterEach(() => {
  jest.clearAllMocks();
});

test('maps the Universal SDK firebase key to the server fcm provider', async () => {
  nativePush.getTokens.mockResolvedValue({
    firebase: 'f'.repeat(32),
    rustore: 'r'.repeat(32),
    universal: 'u'.repeat(32),
  });

  await expect(getMobilePushTokens()).resolves.toEqual([
    { provider: 'fcm', token: 'f'.repeat(32) },
    { provider: 'rustore', token: 'r'.repeat(32) },
  ]);
});
