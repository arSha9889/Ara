import { ApiError } from '../src/infrastructure/http/apiClient';
import { registrationErrorKey } from '../src/features/auth/registrationError';

test('explains a registration error that requires a new e-mail verification code', () => {
  expect(
    registrationErrorKey(
      new ApiError(
        'Request failed.',
        400,
        undefined,
        'E-mail verification request is expired',
      ),
    ),
  ).toBe('registrationEmailVerificationExpired');
});

test('explains a username conflict without exposing arbitrary server text', () => {
  expect(
    registrationErrorKey(new ApiError('Request failed.', 400, undefined, 'Этот username уже занят')),
  ).toBe('registrationUsernameTaken');

  expect(
    registrationErrorKey(new ApiError('Request failed.', 400, undefined, 'Unexpected internal detail')),
  ).toBe('errorValidation');
});
