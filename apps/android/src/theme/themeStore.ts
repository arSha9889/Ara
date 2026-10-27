import * as Keychain from 'react-native-keychain';

import type { ThemePreference } from './theme';

const THEME_SERVICE = 'arachat.messenger.theme';

function isThemePreference(value: string): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export class ThemeStore {
  async load(fallback: ThemePreference): Promise<ThemePreference> {
    const credentials = await Keychain.getGenericPassword({ service: THEME_SERVICE });
    return credentials && isThemePreference(credentials.password) ? credentials.password : fallback;
  }

  async save(preference: ThemePreference): Promise<void> {
    await Keychain.setGenericPassword('theme', preference, {
      service: THEME_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export const themeStore = new ThemeStore();
