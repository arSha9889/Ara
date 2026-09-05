import { ApiConfigurationError } from '../src/config/runtimeConfig';
import { authErrorKey } from '../src/features/auth/authError';
import { ApiError } from '../src/infrastructure/http/apiClient';

test('reports an absent API address as not configured', () => {
  expect(authErrorKey(new ApiConfigurationError('API base URL is absent.'))).toBe('apiNotConfigured');
});

test('uses a local message for interaction-blocked server errors', () => {
  expect(authErrorKey(new ApiError('Request failed.', 403, 'interaction_blocked'))).toBe('interactionBlocked');
});

test('uses a local message when a support ticket is unavailable', () => {
  expect(authErrorKey(new ApiError('Request failed.', 404, 'ticket_not_found'))).toBe('supportTicketNotFound');
});
