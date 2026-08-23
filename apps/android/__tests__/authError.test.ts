import { ApiConfigurationError } from '../src/config/runtimeConfig';
import { authErrorKey } from '../src/features/auth/authError';

test('reports an absent API address as not configured', () => {
  expect(authErrorKey(new ApiConfigurationError('API base URL is absent.'))).toBe('apiNotConfigured');
});
