import { I18nProvider } from './I18nProvider.jsx';
import { AppFeedbackProvider } from './AppFeedbackProvider.jsx';
import { CallProvider } from './CallProvider.jsx';
import { NotificationsProvider } from './NotificationsProvider.jsx';
import { SessionProvider } from './SessionProvider.jsx';
import { LayoutModeProvider } from './LayoutModeProvider.jsx';
import { ThemeProvider } from './ThemeProvider.jsx';

export function AppProviders({ children }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <LayoutModeProvider>
          <SessionProvider>
            <AppFeedbackProvider>
              <NotificationsProvider>
                <CallProvider>{children}</CallProvider>
              </NotificationsProvider>
            </AppFeedbackProvider>
          </SessionProvider>
        </LayoutModeProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
