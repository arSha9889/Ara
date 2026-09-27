import { completeRegistration } from '../src/features/auth/api/authApi';
import { registrationCountryOptions } from '../src/features/auth/registrationCountry';
import { apiClient } from '../src/infrastructure/http/apiClient';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user: {
      id: 'user-1',
      nexus_id: '1234567890123456',
      status: 'active',
      legal_documents_current: true,
      profile: null,
    },
  });
});

test('sends the country explicitly selected for registration instead of GLOBAL', async () => {
  await completeRegistration({
    emailVerificationId: 'verification-1',
    username: 'arachat',
    password: 'password123',
    displayName: '  Ara Chat  ',
    deviceId: 'android-device-1',
    language: 'en',
    country: 'KZ',
  });

  expect(request).toHaveBeenCalledWith('/api/auth/register/complete', {
    method: 'POST',
    requiresAuth: false,
    body: {
      email_verification_id: 'verification-1',
      username: 'arachat',
      password: 'password123',
      device_id: 'android-device-1',
      language: 'en',
      registration_country: 'KZ',
      design_theme: 'halo',
      display_name: 'Ara Chat',
      avatar_type: 'built_in',
      avatar_ref: 'animal-01',
      accepted_terms: true,
      accepted_privacy_policy: true,
    },
  });
});

test('lists exactly the countries accepted by the registration API', () => {
  expect(registrationCountryOptions.map(option => option.code)).toEqual([
    'RU',
    'KZ',
    'KG',
    'BY',
    'UZ',
    'UA',
  ]);
});
