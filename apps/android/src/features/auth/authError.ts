import { ApiConfigurationError, runtimeConfig } from '../../config/runtimeConfig';
import { ApiError } from '../../infrastructure/http/apiClient';
import type { TranslationKey } from '../../localization/messages';

export function authErrorKey(error: unknown, credentials = false): TranslationKey {
  if (error instanceof ApiConfigurationError) {
    return runtimeConfig.apiBaseUrlError ? 'invalidApiConfiguration' : 'apiNotConfigured';
  }

  if (error instanceof ApiError) {
    if (error.code === 'interaction_blocked') {
      return 'interactionBlocked';
    }

    if (error.code === 'ticket_not_found') {
      return 'supportTicketNotFound';
    }

    if (error.status === 400 || error.status === 422) {
      return credentials ? 'errorCredentials' : 'errorValidation';
    }

    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return credentials ? 'errorCredentials' : 'errorUnavailable';
    }

    if (error.status === 429) {
      return 'errorRateLimit';
    }

    if (error.status >= 500) {
      return 'errorUnavailable';
    }
  }

  return 'errorNetwork';
}
