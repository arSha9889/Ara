import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { createSharedStyles, themes, type AppColors, type ThemeMode, type ThemePreference } from './theme';
import { themeStore } from './themeStore';

interface ThemeContextValue {
  colors: AppColors;
  mode: ThemeMode;
  preference: ThemePreference;
  isLoading: boolean;
  sharedStyles: ReturnType<typeof createSharedStyles>;
  setPreference(preference: ThemePreference): Promise<void>;
}

const fallbackColors = themes.dark;
const fallbackTheme: ThemeContextValue = {
  colors: fallbackColors,
  isLoading: false,
  mode: 'dark',
  preference: 'dark',
  setPreference: async () => undefined,
  sharedStyles: createSharedStyles(fallbackColors),
};

const ThemeContext = createContext<ThemeContextValue>(fallbackTheme);

function resolveMode(preference: ThemePreference, systemScheme: 'light' | 'dark' | null | undefined): ThemeMode {
  return preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setCurrentPreference] = useState<ThemePreference>('dark');
  const [isLoading, setIsLoading] = useState(true);
  const mode = resolveMode(preference, systemScheme);
  const palette = themes[mode];

  useEffect(() => {
    themeStore
      .load('dark')
      .then(setCurrentPreference)
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    try {
      await themeStore.save(nextPreference);
    } catch {
      // Applying a visual preference must not depend on secure-storage availability.
    }
    setCurrentPreference(nextPreference);
  }, []);

  const sharedStyles = useMemo(() => createSharedStyles(palette), [palette]);
  const value = useMemo(
    () => ({
      colors: palette,
      mode,
      preference,
      isLoading,
      sharedStyles,
      setPreference,
    }),
    [isLoading, mode, palette, preference, setPreference, sharedStyles],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useThemedStyles<T>(factory: (colors: AppColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
