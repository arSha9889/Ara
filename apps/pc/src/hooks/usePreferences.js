import { useEffect, useState } from 'react';

import { localeFromSystem } from '../i18n/copy.js';

const STORAGE_KEY = 'arachat-desktop-preferences';
const COLOR_PALETTES = new Set(['green', 'cyan', 'yellow', 'orange']);

function readPreferences() {
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const fallback = {
    language: localeFromSystem(),
    theme: systemTheme,
    colorPalette: 'green',
    soundEnabled: false,
    hasSeenWelcome: false,
    density: 'comfortable',
    desktopNotifications: true,
    messagePreview: true,
  };

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const preferences = { ...fallback, ...saved };
    return COLOR_PALETTES.has(preferences.colorPalette) ? preferences : { ...preferences, colorPalette: fallback.colorPalette };
  } catch {
    return fallback;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.colorPalette = preferences.colorPalette;
    document.documentElement.lang = preferences.language;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  function updatePreferences(nextValue) {
    setPreferences((current) => ({ ...current, ...nextValue }));
  }

  return [preferences, updatePreferences];
}
