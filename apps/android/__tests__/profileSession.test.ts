import { toSessionUser, type ApiUser } from '../src/features/auth/api/authApi';

jest.mock('react-native', () => ({
  NativeModules: {
    AppConfig: {
      apiBaseUrl: 'https://api.example.test',
    },
  },
}));

import { avatarEmoji, uploadedAvatarUrl } from '../src/features/profile/avatar';

test('preserves the complete server-supported profile in the session user', () => {
  const user: ApiUser = {
    id: 'user-1',
    nexus_id: '1234567890123456',
    status: 'active',
    legal_documents_current: true,
    profile: {
      display_name: 'Ara',
      username: 'arachat',
      email: 'ara@example.com',
      email_verified: true,
      avatar_type: 'built_in',
      avatar_ref: 'animal-02',
      optional_phone: '+79000000000',
      phone_public: false,
      language: 'en',
    },
  };

  expect(toSessionUser(user)).toEqual({
    id: 'user-1',
    nexusId: '1234567890123456',
    status: 'active',
    legalDocumentsCurrent: true,
    displayName: 'Ara',
    username: 'arachat',
    email: 'ara@example.com',
    emailVerified: true,
    avatarType: 'built_in',
    avatarRef: 'animal-02',
    optionalPhone: '+79000000000',
    phonePublic: false,
    language: 'en',
  });
});

test('renders known built-in avatars and keeps unknown values neutral', () => {
  expect(avatarEmoji('animal-01')).toBe('🦊');
  expect(avatarEmoji('unknown-avatar')).toBeNull();
});

test('builds a public uploaded-avatar URL from the configured API base URL', () => {
  expect(uploadedAvatarUrl('uploaded', '/api/media/avatars/0af4a983-2a87-42cb-afeb-8bbd1ba770c7')).toBe(
    'https://api.example.test/api/media/avatars/0af4a983-2a87-42cb-afeb-8bbd1ba770c7',
  );
  expect(uploadedAvatarUrl('uploaded', '/api/media/42')).toBeNull();
});
