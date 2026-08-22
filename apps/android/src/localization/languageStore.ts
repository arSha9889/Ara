import * as Keychain from 'react-native-keychain';

import { isAppLanguage, type AppLanguage } from './language';

const LANGUAGE_SERVICE = 'arachat.messenger.language';

export class LanguageStore {
  async load(fallback: AppLanguage): Promise<AppLanguage> {
    const credentials = await Keychain.getGenericPassword({ service: LANGUAGE_SERVICE });

    return credentials && isAppLanguage(credentials.password) ? credentials.password : fallback;
  }

  async save(language: AppLanguage): Promise<void> {
    await Keychain.setGenericPassword('language', language, {
      service: LANGUAGE_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export const languageStore = new LanguageStore();
