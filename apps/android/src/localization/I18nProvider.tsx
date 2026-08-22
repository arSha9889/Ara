import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NativeModules } from 'react-native';

import { systemLanguage, type AppLanguage } from './language';
import { languageStore } from './languageStore';
import { translate, type TranslationKey } from './messages';

interface AppConfigModule {
  deviceLanguage?: unknown;
}

interface I18nContextValue {
  language: AppLanguage;
  isLoading: boolean;
  setLanguage(language: AppLanguage): Promise<void>;
  t(key: TranslationKey): string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLanguage(): AppLanguage {
  const appConfig = NativeModules.AppConfig as AppConfigModule | undefined;
  return systemLanguage(appConfig?.deviceLanguage);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<AppLanguage>(initialLanguage);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    languageStore
      .load(initialLanguage())
      .then(setCurrentLanguage)
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    try {
      await languageStore.save(nextLanguage);
    } catch {
      // The current application session can still use the selected language.
    }
    setCurrentLanguage(nextLanguage);
  }, []);

  const value = useMemo(
    () => ({
      language,
      isLoading,
      setLanguage,
      t: (key: TranslationKey) => translate(language, key),
    }),
    [isLoading, language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider.');
  }

  return context;
}
