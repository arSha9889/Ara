import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/app/AppRoot';
import { SessionProvider } from './src/features/auth/session/SessionProvider';
import { NetworkProvider } from './src/features/network/NetworkProvider';
import { MobilePushProvider } from './src/features/notifications/MobilePushProvider';
import { I18nProvider } from './src/localization/I18nProvider';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const { mode } = useTheme();

  return (
    <>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <I18nProvider>
        <NetworkProvider>
          <SessionProvider>
            <MobilePushProvider>
              <AppRoot />
            </MobilePushProvider>
          </SessionProvider>
        </NetworkProvider>
      </I18nProvider>
    </>
  );
}

export default App;
