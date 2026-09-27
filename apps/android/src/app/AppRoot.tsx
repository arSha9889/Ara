import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../features/auth/session/useSession';
import { CallOverlay } from '../features/calls/CallOverlay';
import { DirectCallProvider } from '../features/calls/DirectCallProvider';
import { AppNavigator } from '../navigation/AppNavigator';
import { LegalAcceptanceScreen } from '../features/auth/screens/LegalAcceptanceScreen';
import { PasswordRecoveryScreen } from '../features/auth/screens/PasswordRecoveryScreen';
import { RegisterScreen } from '../features/auth/screens/RegisterScreen';
import { RegistrationSetupScreen } from '../features/auth/screens/RegistrationSetupScreen';
import { SignInScreen } from '../features/auth/screens/SignInScreen';
import type { RegistrationCountry } from '../features/auth/registrationCountry';
import { RealtimeProvider } from '../features/realtime/RealtimeProvider';
import { useI18n } from '../localization/I18nProvider';
import { colors } from '../theme/theme';
import { HaloMark } from '../ui/HaloMark';

export function AppRoot() {
  const { session, status } = useSession();
  const { isLoading: isI18nLoading } = useI18n();
  const [screen, setScreen] = useState<'signIn' | 'registrationSetup' | 'register' | 'recovery'>('signIn');
  const [registrationCountry, setRegistrationCountry] = useState<RegistrationCountry | null>(null);

  function returnToSignIn(): void {
    setRegistrationCountry(null);
    setScreen('signIn');
  }

  function startRegistration(): void {
    setRegistrationCountry(null);
    setScreen('registrationSetup');
  }

  if (status === 'loading' || isI18nLoading) {
    return <BootScreen />;
  }

  if (status === 'signedIn') {
    return session?.user.legalDocumentsCurrent ? (
      <RealtimeProvider accessToken={session.accessToken}>
        <DirectCallProvider>
          <AppNavigator />
          <CallOverlay />
        </DirectCallProvider>
      </RealtimeProvider>
    ) : (
      <LegalAcceptanceScreen />
    );
  }

  if (screen === 'register') {
    if (!registrationCountry) {
      return (
        <RegistrationSetupScreen
          onBack={returnToSignIn}
          onContinue={country => {
            setRegistrationCountry(country);
            setScreen('register');
          }}
        />
      );
    }

    return (
      <RegisterScreen
        country={registrationCountry}
        onBack={returnToSignIn}
      />
    );
  }

  if (screen === 'registrationSetup') {
    return (
      <RegistrationSetupScreen
        onBack={returnToSignIn}
        onContinue={country => {
          setRegistrationCountry(country);
          setScreen('register');
        }}
      />
    );
  }

  if (screen === 'recovery') {
    return <PasswordRecoveryScreen onBack={() => setScreen('signIn')} />;
  }

  return (
    <SignInScreen
      onCreateAccount={startRegistration}
      onRecoverPassword={() => setScreen('recovery')}
    />
  );
}

function BootScreen() {
  return (
    <View style={styles.container}>
      <HaloMark />
      <Text style={styles.brand}>AraChat</Text>
      <ActivityIndicator color={colors.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 20,
  },
  loader: {
    marginTop: 20,
  },
});
