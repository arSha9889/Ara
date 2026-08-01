import { I18nProvider } from './I18nProvider.jsx';
import { AppFeedbackProvider } from './AppFeedbackProvider.jsx';
import { NotificationsProvider } from './NotificationsProvider.jsx';
import { SessionProvider } from './SessionProvider.jsx';
import { ThemeProvider } from './ThemeProvider.jsx';

export function AppProviders({ children }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <SessionProvider>
          <AppFeedbackProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </AppFeedbackProvider>
        </SessionProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
