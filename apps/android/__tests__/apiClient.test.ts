jest.mock('react-native', () => ({
  NativeModules: {
    AppConfig: {
      apiBaseUrl: 'https://api.example.test',
    },
  },
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

import { ApiClient, ApiError } from '../src/infrastructure/http/apiClient';
import { SecureSessionStore } from '../src/infrastructure/storage/sessionStore';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('preserves a stable API error code from a failed JSON response', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: jest.fn().mockResolvedValue({ code: 'interaction_blocked' }),
  } as unknown as Response);
  globalThis.fetch = fetchMock as typeof fetch;

  const client = new ApiClient(new SecureSessionStore());
  let receivedError: unknown;

  try {
    await client.request('/api/chats/chat-1/messages', { requiresAuth: false });
  } catch (error) {
    receivedError = error;
  }

  expect(receivedError).toBeInstanceOf(ApiError);
  expect(receivedError).toMatchObject({
    status: 403,
    code: 'interaction_blocked',
  });

  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/chats/chat-1/messages', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    body: undefined,
    signal: undefined,
  });
});
