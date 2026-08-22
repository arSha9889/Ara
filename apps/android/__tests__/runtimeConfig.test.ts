import {
  ApiConfigurationError,
  normalizeApiBaseUrl,
} from '../src/config/runtimeConfig';

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
