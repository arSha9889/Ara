import { ApiError } from '../../infrastructure/http/apiClient';
import type { TranslationKey } from '../../localization/messages';

import { authErrorKey } from './authError';

const registrationDetailKeys: Record<string, TranslationKey> = {
  'Email has invalid format': 'validationEmail',
  'Email is already registered': 'registrationEmailAlreadyRegistered',
  'Early access registration limit is reached': 'registrationLimitReached',
  'E-mail verification request not found': 'registrationEmailVerificationNotFound',
  'E-mail verification request is already used': 'registrationEmailVerificationUsed',
  'E-mail verification request is expired': 'registrationEmailVerificationExpired',
  'E-mail is not verified': 'registrationEmailNotVerified',
  'E-mail verification is not available on this device': 'registrationEmailVerificationDeviceMismatch',
  'E-mail confirmation code is not available': 'registrationEmailCodeUnavailable',
  'Invalid e-mail confirmation code': 'registrationEmailCodeInvalid',
  'Too many e-mail verification requests. Try again later': 'errorRateLimit',
  'Username должен содержать только латинские буквы и цифры, от 3 до 32 символов': 'validationUsername',
  'Пароль должен содержать только латинские буквы и цифры, от 5 до 30 символов': 'validationPassword',
  'Этот username уже занят': 'registrationUsernameTaken',
  'Для регистрации нужно принять Политику конфиденциальности и Пользовательское соглашение':
    'validationLegal',
};

export function registrationErrorKey(error: unknown): TranslationKey {
  if (error instanceof ApiError && error.detail) {
    return registrationDetailKeys[error.detail] ?? authErrorKey(error);
  }

  return authErrorKey(error);
}
