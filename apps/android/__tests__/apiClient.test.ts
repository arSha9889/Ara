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
    json: jest.fn().mockResolvedValue({
      code: 'interaction_blocked',
      detail: 'This action is not available.',
    }),
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
    detail: 'This action is not available.',
  });

  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/chats/chat-1/messages', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    body: undefined,
    signal: undefined,
  });
});

test('sends multipart data with bearer authorization and without a JSON content type', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ uploaded: true }),
  } as unknown as Response);
  globalThis.fetch = fetchMock as typeof fetch;
  const store = {
    loadSession: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', nexusId: '1', status: 'active', legalDocumentsCurrent: true },
    }),
  } as unknown as SecureSessionStore;
  const formData = new FormData();
  formData.append('file', 'content');

  await expect(
    new ApiClient(store).requestMultipart('/api/uploads', {
      method: 'POST',
      formData,
    }),
  ).resolves.toEqual({ uploaded: true });

  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/uploads', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer access-token',
    },
    body: formData,
    signal: undefined,
  });
});

test('retries a private-media operation once after native authorization failure', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      access_token: 'renewed-access-token',
      refresh_token: 'renewed-refresh-token',
    }),
  } as unknown as Response);
  globalThis.fetch = fetchMock as typeof fetch;
  const initialSession = {
    accessToken: 'expired-access-token',
    refreshToken: 'refresh-token',
    user: { id: 'user-1', nexusId: '1', status: 'active', legalDocumentsCurrent: true },
  };
  const store = {
    loadSession: jest.fn().mockResolvedValue(initialSession),
    saveSession: jest.fn().mockResolvedValue(undefined),
  } as unknown as SecureSessionStore;
  const operation = jest
    .fn()
    .mockRejectedValueOnce({ code: 'MEDIA_UNAUTHORIZED' })
    .mockResolvedValueOnce('file:///cache/private-media.pdf');

  await expect(new ApiClient(store).withAuthRetry(operation)).resolves.toBe(
    'file:///cache/private-media.pdf',
  );

  expect(operation).toHaveBeenNthCalledWith(1, 'expired-access-token');
  expect(operation).toHaveBeenNthCalledWith(2, 'renewed-access-token');
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/auth/refresh', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: 'refresh-token' }),
    signal: undefined,
  });
});
