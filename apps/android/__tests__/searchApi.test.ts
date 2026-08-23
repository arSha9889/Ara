import { apiClient } from '../src/infrastructure/http/apiClient';
import { normalizeUserSearchQuery, searchPublicUsers } from '../src/features/search/api/searchApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
});

test('normalizes a username search and encodes it for the user search endpoint', async () => {
  request.mockResolvedValue([]);

  expect(normalizeUserSearchQuery('  @hello world  ')).toBe('hello world');
  await searchPublicUsers('  @hello world  ');

  expect(request).toHaveBeenCalledWith('/api/users/search?query=hello%20world');
});
