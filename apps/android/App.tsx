import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/app/AppRoot';
import { SessionProvider } from './src/features/auth/session/SessionProvider';
import { NetworkProvider } from './src/features/network/NetworkProvider';
import { MobilePushProvider } from './src/features/notifications/MobilePushProvider';
import { I18nProvider } from './src/localization/I18nProvider';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <I18nProvider>
        <NetworkProvider>
          <SessionProvider>
            <MobilePushProvider>
              <AppRoot />
            </MobilePushProvider>
          </SessionProvider>
        </NetworkProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

export default App;
