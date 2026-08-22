import { isAppLanguage, systemLanguage } from '../src/localization/language';
import { translate } from '../src/localization/messages';

describe('localization', () => {
  it('uses English only for English system locales', () => {
    expect(systemLanguage('en-US')).toBe('en');
    expect(systemLanguage('EN_gb')).toBe('en');
    expect(systemLanguage('ru-RU')).toBe('ru');
    expect(systemLanguage(undefined)).toBe('ru');
  });

  it('accepts only supported application languages', () => {
    expect(isAppLanguage('ru')).toBe(true);
    expect(isAppLanguage('en')).toBe(true);
    expect(isAppLanguage('kk')).toBe(false);
  });

  it('contains localized sign-in text', () => {
    expect(translate('ru', 'signInTitle')).toBe('Войдите в аккаунт');
    expect(translate('en', 'signInTitle')).toBe('Sign in to your account');
  });
});
