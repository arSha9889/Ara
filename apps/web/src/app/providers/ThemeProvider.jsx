import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';

import { themeNames } from '../../shared/config/themes.js';

const ThemeContext = createContext(null);

function normalizeTheme(theme) {
  return themeNames.includes(theme) ? theme : 'comet';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const normalized = normalizeTheme(localStorage.getItem('nexus_theme'));
    localStorage.setItem('nexus_theme', normalized);
    return normalized;
  });

  function setTheme(nextTheme) {
    const normalized = normalizeTheme(nextTheme);
    localStorage.setItem('nexus_theme', normalized);
    setThemeState(normalized);
  }

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = normalizeTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
