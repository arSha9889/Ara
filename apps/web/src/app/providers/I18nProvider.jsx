import { createContext, useContext, useMemo, useState } from 'react';

import { dictionaries } from '../../shared/i18n/dictionaries.js';

const I18nContext = createContext(null);
export const SUPPORTED_LANGUAGES = ['ru', 'en', 'es', 'fr', 'uk'];

function getDictionaryValue(dictionary, key) {
  return key.split('.').reduce((current, part) => current?.[part], dictionary);
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem('nexus_language') || 'ru');

  function setLanguage(nextLanguage) {
    const normalized = SUPPORTED_LANGUAGES.includes(nextLanguage) ? nextLanguage : 'ru';
    localStorage.setItem('nexus_language', normalized);
    setLanguageState(normalized);
  }

  const value = useMemo(() => {
    function t(key) {
      return getDictionaryValue(dictionaries[language], key)
        ?? getDictionaryValue(dictionaries.en, key)
        ?? getDictionaryValue(dictionaries.ru, key)
        ?? key;
    }

    return { language, setLanguage, t };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }

  return context;
}
