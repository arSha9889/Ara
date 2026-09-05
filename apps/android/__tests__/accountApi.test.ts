import { apiClient } from '../src/infrastructure/http/apiClient';
import {
  confirmEmailChange,
  confirmPasswordChange,
  createPin,
  deleteAccount,
  getDeviceSessions,
  getLoginHistory,
  getMyProfile,
  resetPin,
  revokeDeviceSession,
  startEmailChange,
  startPasswordChange,
  updateMyProfile,
  updateUsername,
} from '../src/features/account/api/accountApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({
    id: 'user-1',
    nexus_id: '1234567890123456',
    status: 'active',
    legal_documents_current: true,
    profile: {
      display_name: 'Ara',
      username: 'arachat',
      email: 'ara@example.com',
      avatar_type: 'built_in',
      avatar_ref: 'animal-01',
      optional_phone: null,
      phone_public: false,
      language: 'ru',
    },
  });
});

test('uses profile routes with only server-supported fields', async () => {
  await getMyProfile();
  await updateMyProfile({
    displayName: '  Ara Chat  ',
    optionalPhone: '  +7 900 000 00 00  ',
    phonePublic: true,
    avatarRef: 'animal-02',
    language: 'en',
  });
  await updateUsername('  arachat2  ');

  expect(request).toHaveBeenNthCalledWith(1, '/api/users/me');
  expect(request).toHaveBeenNthCalledWith(2, '/api/users/me/profile', {
    method: 'PATCH',
    body: {
      display_name: 'Ara Chat',
      optional_phone: '+7 900 000 00 00',
      phone_public: true,
      avatar_type: 'built_in',
      avatar_ref: 'animal-02',
      language: 'en',
    },
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/users/username', {
    method: 'PATCH',
    body: { username: 'arachat2' },
  });
});

test('uses protected two-step e-mail and password flows', async () => {
  await startPasswordChange('current1', 'newpass2', 'android-device-1', 'ru');
  await confirmPasswordChange('verification-1', '123456', 'android-device-1');
  await startEmailChange('current1', '  new@example.com  ', 'android-device-1', 'en');
  await confirmEmailChange('verification-2', '654321', 'android-device-1');

  expect(request).toHaveBeenNthCalledWith(1, '/api/auth/password/change/start', {
    method: 'POST',
    body: {
      current_password: 'current1',
      new_password: 'newpass2',
      device_id: 'android-device-1',
      language: 'ru',
    },
  });
  expect(request).toHaveBeenNthCalledWith(2, '/api/auth/password/change/confirm', {
    method: 'POST',
    body: {
      verification_id: 'verification-1',
      code: '123456',
      device_id: 'android-device-1',
    },
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/auth/email/change/start', {
    method: 'POST',
    body: {
      current_password: 'current1',
      email: 'new@example.com',
      device_id: 'android-device-1',
      language: 'en',
    },
  });
  expect(request).toHaveBeenNthCalledWith(4, '/api/auth/email/change/confirm', {
    method: 'POST',
    body: {
      verification_id: 'verification-2',
      code: '654321',
      device_id: 'android-device-1',
    },
  });
});

test('uses actual PIN, device, history, and deletion routes', async () => {
  await createPin('current1', '1234', 'android-device-1');
  await resetPin('current1', null, 'android-device-1');
  await getDeviceSessions();
  await revokeDeviceSession('android-device-1/with slash');
  await getLoginHistory();
  await deleteAccount();

  expect(request).toHaveBeenNthCalledWith(1, '/api/security/pin/create', {
    method: 'POST',
    body: { current_password: 'current1', pin: '1234', device_id: 'android-device-1' },
  });
  expect(request).toHaveBeenNthCalledWith(2, '/api/security/pin/reset', {
    method: 'POST',
    body: { current_password: 'current1', pin: null, device_id: 'android-device-1' },
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/devices');
  expect(request).toHaveBeenNthCalledWith(4, '/api/devices/android-device-1%2Fwith%20slash', {
    method: 'DELETE',
  });
  expect(request).toHaveBeenNthCalledWith(5, '/api/login-history');
  expect(request).toHaveBeenNthCalledWith(6, '/api/auth/account', { method: 'DELETE' });
});
