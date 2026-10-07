import * as Keychain from 'react-native-keychain';

import {
  SecureSessionStore,
  type AuthSession,
} from '../src/infrastructure/storage/sessionStore';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  },
  STORAGE_TYPE: {
    AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth',
  },
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
}));

jest.mock('react-native', () => ({
  NativeModules: {
    AppConfig: {
      createDeviceId: jest.fn(),
    },
  },
}));

const keychain = Keychain as jest.Mocked<typeof Keychain>;

const session: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    id: '2ed67eb4-9f7b-4880-b4c1-fabc6d32a541',
    nexusId: '1234567890123456',
    status: 'active',
    legalDocumentsCurrent: true,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('stores an authenticated session in the device-only Keychain entry', async () => {
  const store = new SecureSessionStore();

  await store.saveSession(session);

  expect(keychain.setGenericPassword).toHaveBeenCalledWith(
    'session',
    JSON.stringify(session),
    expect.objectContaining({
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  );
});

test('does not accept malformed serialized sessions', async () => {
  keychain.getGenericPassword.mockResolvedValue({
    service: 'arachat.messenger.session',
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
    username: 'session',
    password: '{not-json',
  });
  const store = new SecureSessionStore();

  await expect(store.loadSession()).resolves.toBeNull();
  expect(keychain.resetGenericPassword).toHaveBeenCalledTimes(1);
});

test('does not accept sessions without legal document state', async () => {
  keychain.getGenericPassword.mockResolvedValue({
    service: 'arachat.messenger.session',
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
    username: 'session',
    password: JSON.stringify({
      ...session,
      user: { ...session.user, legalDocumentsCurrent: undefined },
    }),
  });
  const store = new SecureSessionStore();

  await expect(store.loadSession()).resolves.toBeNull();
  expect(keychain.resetGenericPassword).toHaveBeenCalledTimes(1);
});

test('stores and consumes the user-specific notification permission marker', async () => {
  const store = new SecureSessionStore();
  const service = `arachat.messenger.notification-permission-request.${session.user.id}`;

  await store.markNotificationPermissionRequest(session.user.id);

  expect(keychain.setGenericPassword).toHaveBeenCalledWith(
    'notification-permission-request',
    'pending',
    expect.objectContaining({
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      service,
    }),
  );

  keychain.getGenericPassword.mockResolvedValue({
    service,
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
    username: 'notification-permission-request',
    password: 'pending',
  });

  await expect(store.consumeNotificationPermissionRequest(session.user.id)).resolves.toBe(true);
  expect(keychain.resetGenericPassword).toHaveBeenCalledWith({ service });
});
