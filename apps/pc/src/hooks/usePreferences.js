import { useEffect, useState } from 'react';

import { localeFromSystem } from '../i18n/copy.js';

const STORAGE_KEY = 'arachat-desktop-preferences';

function readPreferences() {
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const fallback = {
    language: localeFromSystem(),
    theme: systemTheme,
    soundEnabled: false,
    hasSeenWelcome: false,
    density: 'comfortable',
    desktopNotifications: true,
    messagePreview: true,
  };

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback;
    const preferences = { ...saved };
    delete preferences.colorPalette;
    return { ...fallback, ...preferences };
  } catch {
    return fallback;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    delete document.documentElement.dataset.colorPalette;
    document.documentElement.lang = preferences.language;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  function updatePreferences(nextValue) {
    setPreferences((current) => ({ ...current, ...nextValue }));
  }

  return [preferences, updatePreferences];
}
