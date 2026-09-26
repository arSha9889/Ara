import { NativeModules } from 'react-native';

export type AndroidInstallSource = 'direct' | 'rustore' | 'unknown';

interface AppConfigModule {
  apiBaseUrl?: unknown;
  appVersion?: unknown;
  appVersionCode?: unknown;
  installSource?: {
    installerPackageName?: unknown;
    isFileInstall?: unknown;
  };
}

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return '';
  }

  const candidate = value.trim();

  if (
    !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:\/[a-z0-9\-._~%!$&'()*+,;=:@/]*)?$/i.test(
      candidate,
    )
  ) {
    throw new ApiConfigurationError(
      'Адрес API должен быть полным HTTPS-адресом без query-параметров.',
    );
  }

  return candidate.replace(/\/+$/, '');
}

const nativeAppConfig = NativeModules.AppConfig as AppConfigModule | undefined;
const nativeApiBaseUrl = nativeAppConfig?.apiBaseUrl;

function readRuntimeConfig() {
  try {
    return {
      apiBaseUrl: normalizeApiBaseUrl(nativeApiBaseUrl),
      apiBaseUrlError: null,
    };
  } catch (error) {
    return {
      apiBaseUrl: '',
      apiBaseUrlError:
        error instanceof Error
          ? error.message
          : 'Не удалось прочитать адрес API из конфигурации сборки.',
    };
  }
}

export const runtimeConfig = Object.freeze({
  ...readRuntimeConfig(),
});

export function getApiBaseUrl(): string {
  if (!runtimeConfig.apiBaseUrl) {
    throw new ApiConfigurationError(
      'Подключение к AraChat ещё не настроено. Укажите ARACHAT_API_BASE_URL при сборке.',
    );
  }

  return runtimeConfig.apiBaseUrl;
}

export function appVersionCode(): number | null {
  const value = nativeAppConfig?.appVersionCode;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function androidInstallSource(rustoreInstallerPackage: string | null): AndroidInstallSource {
  const installSource = nativeAppConfig?.installSource;
  const installerPackageName =
    typeof installSource?.installerPackageName === 'string'
      ? installSource.installerPackageName.trim()
      : '';

  if (rustoreInstallerPackage && installerPackageName === rustoreInstallerPackage) {
    return 'rustore';
  }

  return installSource?.isFileInstall === true ? 'direct' : 'unknown';
}
