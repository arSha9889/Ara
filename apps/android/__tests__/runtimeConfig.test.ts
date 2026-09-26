jest.mock('react-native', () => ({
  NativeModules: {
    AppConfig: {},
  },
}));

import { NativeModules } from 'react-native';

import {
  androidInstallSource,
  appVersionCode,
  ApiConfigurationError,
  normalizeApiBaseUrl,
} from '../src/config/runtimeConfig';

const appConfig = NativeModules.AppConfig as Record<string, unknown>;

beforeEach(() => {
  Object.keys(appConfig).forEach(key => {
    delete appConfig[key];
  });
});

describe('normalizeApiBaseUrl', () => {
  it('accepts HTTPS URLs and strips a trailing slash', () => {
    expect(normalizeApiBaseUrl('https://api.example.test/')).toBe('https://api.example.test');
  });

  it('leaves an absent build setting empty', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('');
  });

  it('rejects insecure and credential-bearing URLs', () => {
    expect(() => normalizeApiBaseUrl('http://api.example.test')).toThrow(
      ApiConfigurationError,
    );
    expect(() => normalizeApiBaseUrl('https://token@api.example.test')).toThrow(
      ApiConfigurationError,
    );
  });
});

describe('Android build metadata', () => {
  it('reads only a positive safe Android version code', () => {
    appConfig.appVersionCode = 42;
    expect(appVersionCode()).toBe(42);

    appConfig.appVersionCode = 0;
    expect(appVersionCode()).toBeNull();

    appConfig.appVersionCode = Number.MAX_SAFE_INTEGER + 1;
    expect(appVersionCode()).toBeNull();
  });

  it('recognizes RuStore only from the exact server-configured installer package', () => {
    appConfig.installSource = {
      installerPackageName: 'ru.vk.store',
      isFileInstall: true,
    };

    expect(androidInstallSource('ru.vk.store')).toBe('rustore');
    expect(androidInstallSource('ru.vk.store.beta')).toBe('direct');
  });

  it('uses direct only for Android file installs and keeps all other sources unknown', () => {
    appConfig.installSource = { isFileInstall: true };
    expect(androidInstallSource(null)).toBe('direct');

    appConfig.installSource = {
      installerPackageName: 'com.example.unknown',
      isFileInstall: false,
    };
    expect(androidInstallSource('ru.vk.store')).toBe('unknown');
  });
});
