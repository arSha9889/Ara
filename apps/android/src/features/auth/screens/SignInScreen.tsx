import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { runtimeConfig } from '../../../config/runtimeConfig';
import { useI18n } from '../../../localization/I18nProvider';
import { useTheme } from '../../../theme/ThemeProvider';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../authError';
import { useSession } from '../session/useSession';
import { AuthLayout, useAuthStyles } from './AuthLayout';

interface SignInScreenProps {
  onCreateAccount(): void;
  onRecoverPassword(): void;
}

export function SignInScreen({ onCreateAccount, onRecoverPassword }: SignInScreenProps) {
  const { signIn } = useSession();
  const { t } = useI18n();
  const { colors } = useTheme();
  const authStyles = useAuthStyles();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = Boolean(runtimeConfig.apiBaseUrl);

  async function handleSignIn(): Promise<void> {
    if (!configured || !identifier.trim() || !password || isSubmitting) {
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await signIn(identifier, password);
    } catch (nextError) {
      setError(t(authErrorKey(nextError, true)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description={t('signInDescription')}
      eyebrow={t('welcome')}
      title={t('signInTitle')}
    >
      <Text style={authStyles.label}>{t('identifier')}</Text>
      <TextInput
        accessibilityLabel={t('identifier')}
        autoCapitalize="none"
        autoComplete="username"
        onChangeText={setIdentifier}
        placeholder={t('identifierPlaceholder')}
        placeholderTextColor={colors.textFaint}
        style={authStyles.input}
        textContentType="username"
        value={identifier}
      />

      <Text style={authStyles.label}>{t('password')}</Text>
      <TextInput
        accessibilityLabel={t('password')}
        autoCapitalize="none"
        autoComplete="password"
        onChangeText={setPassword}
        placeholder={t('enterPassword')}
        placeholderTextColor={colors.textFaint}
        secureTextEntry
        style={authStyles.input}
        textContentType="password"
        value={password}
      />

      {!configured ? <Text accessibilityRole="alert" style={authStyles.configurationMessage}>{t('apiNotConfigured')}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}

      <PrimaryButton
        accessibilityHint={t('signInHint')}
        disabled={!configured || !identifier.trim() || !password || isSubmitting}
        label={isSubmitting ? t('signingIn') : t('signIn')}
        onPress={handleSignIn}
      />
      <Pressable onPress={onRecoverPassword} style={authStyles.link}>
        <Text style={authStyles.linkLabel}>{t('forgotPassword')}</Text>
      </Pressable>
      <Pressable onPress={onCreateAccount} style={authStyles.secondaryAction}>
        <Text style={authStyles.secondaryActionLabel}>{t('createAccount')}</Text>
      </Pressable>
    </AuthLayout>
  );
}
