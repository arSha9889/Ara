import { I18nProvider } from './I18nProvider.jsx';
import { SessionProvider } from './SessionProvider.jsx';
import { ThemeProvider } from './ThemeProvider.jsx';

export function AppProviders({ children }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <SessionProvider>{children}</SessionProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
