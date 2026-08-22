import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/app/AppRoot';
import { SessionProvider } from './src/features/auth/session/SessionProvider';
import { I18nProvider } from './src/localization/I18nProvider';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <I18nProvider>
        <SessionProvider>
          <AppRoot />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

export default App;
