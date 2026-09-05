import { apiClient } from '../src/infrastructure/http/apiClient';
import {
  blockUser,
  getBlockedUsers,
  getMyReports,
  submitUserReport,
  unblockUser,
} from '../src/features/safety/api/safetyApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({});
});

test('uses the safety endpoints for blocks and unblock', async () => {
  await getBlockedUsers();
  await blockUser('user-1');
  await unblockUser('user-1');

  expect(request).toHaveBeenNthCalledWith(1, '/api/safety/blocks');
  expect(request).toHaveBeenNthCalledWith(2, '/api/safety/blocks/user-1', {
    method: 'POST',
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/safety/blocks/user-1', {
    method: 'DELETE',
  });
});

test('uses the safety report contract without empty descriptions', async () => {
  await getMyReports();
  await submitUserReport('user-1', 'spam', '  ');
  await submitUserReport('user-1', 'other', '  Important details  ');

  expect(request).toHaveBeenNthCalledWith(1, '/api/safety/reports');
  expect(request).toHaveBeenNthCalledWith(2, '/api/safety/reports', {
    method: 'POST',
    body: {
      target_type: 'user',
      target_id: 'user-1',
      reason: 'spam',
    },
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/safety/reports', {
    method: 'POST',
    body: {
      target_type: 'user',
      target_id: 'user-1',
      reason: 'other',
      description: 'Important details',
    },
  });
});
