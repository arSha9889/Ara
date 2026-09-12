import { apiClient } from '../src/infrastructure/http/apiClient';
import { markMobileNotificationsRead } from '../src/features/notifications/api/mobilePushApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true });
});

test('marks opened mobile notifications as read with the existing notification endpoint', async () => {
  await markMobileNotificationsRead(['notification-1']);

  expect(request).toHaveBeenCalledWith('/api/notifications/read', {
    method: 'POST',
    body: ['notification-1'],
  });
});

test('does not make a read-state request when no notification was opened', async () => {
  await markMobileNotificationsRead([]);

  expect(request).not.toHaveBeenCalled();
});
