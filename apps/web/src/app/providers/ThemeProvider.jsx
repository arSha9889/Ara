import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';

import { themeNames } from '../../shared/config/themes.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('nexus_theme') || 'halo');

  function setTheme(nextTheme) {
    const normalized = themeNames.includes(nextTheme) ? nextTheme : 'halo';
    localStorage.setItem('nexus_theme', normalized);
    setThemeState(normalized);
  }

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeNames.includes(theme) ? theme : 'halo';
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
