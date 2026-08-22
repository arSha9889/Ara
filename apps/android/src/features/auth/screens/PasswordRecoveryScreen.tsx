import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { runtimeConfig } from '../../../config/runtimeConfig';
import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { colors } from '../../../theme/theme';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../authError';
import { confirmPasswordReset, startPasswordReset } from '../api/authApi';
import { AuthLayout, authStyles } from './AuthLayout';

interface PasswordRecoveryScreenProps {
  onBack(): void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^[A-Za-z0-9]{5,30}$/;

export function PasswordRecoveryScreen({ onBack }: PasswordRecoveryScreenProps) {
  const { language, t } = useI18n();
  const [email, setEmail] = useState('');
  const [requested, setRequested] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = Boolean(runtimeConfig.apiBaseUrl);

  async function requestCode(): Promise<void> {
    if (!configured || isSubmitting) {
      return;
    }

    if (!emailPattern.test(email.trim())) {
      setError(t('validationEmail'));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      await startPasswordReset(email, deviceId, language);
      setRequested(true);
      setStatus(t('recoveryNeutral'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetPassword(): Promise<void> {
    if (!configured || isSubmitting) {
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError(t('validationCode'));
      return;
    }

    if (!passwordPattern.test(password)) {
      setError(t('validationPassword'));
      return;
    }

    if (password !== passwordRepeat) {
      setError(t('validationPasswordMatch'));
      return;
    }

    setError('');
    setStatus('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      await confirmPasswordReset(email, code, password, deviceId);
      setCompleted(true);
      setStatus(t('passwordResetSuccess'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description={t('recoveryDescription')}
      eyebrow={t('recoveryEyebrow')}
      title={t('recoveryTitle')}
    >
      <Text style={authStyles.label}>{t('email')}</Text>
      <TextInput
        accessibilityLabel={t('email')}
        autoCapitalize="none"
        autoComplete="email"
        editable={!requested && !completed}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder={t('emailPlaceholder')}
        placeholderTextColor={colors.textFaint}
        style={authStyles.input}
        textContentType="emailAddress"
        value={email}
      />
      {requested && !completed ? (
        <>
          <Text style={authStyles.label}>{t('verificationCode')}</Text>
          <TextInput
            accessibilityLabel={t('verificationCode')}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('verificationCodePlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={authStyles.input}
            textContentType="oneTimeCode"
            value={code}
          />
          <Text style={authStyles.label}>{t('newPassword')}</Text>
          <TextInput
            accessibilityLabel={t('newPassword')}
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder={t('enterPassword')}
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            style={authStyles.input}
            textContentType="newPassword"
            value={password}
          />
          <Text style={authStyles.label}>{t('repeatPassword')}</Text>
          <TextInput
            accessibilityLabel={t('repeatPassword')}
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPasswordRepeat}
            placeholder={t('repeatPassword')}
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            style={authStyles.input}
            textContentType="newPassword"
            value={passwordRepeat}
          />
        </>
      ) : null}
      {!configured ? <Text style={authStyles.configurationMessage}>{t('apiNotConfigured')}</Text> : null}
      {status ? <Text accessibilityRole="alert" style={authStyles.success}>{status}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
      {completed ? (
        <PrimaryButton label={t('backToSignIn')} onPress={onBack} />
      ) : (
        <PrimaryButton
          disabled={!configured || !email.trim() || isSubmitting}
          label={
            isSubmitting
              ? requested
                ? t('resettingPassword')
                : t('sendingCode')
              : requested
                ? t('resetPassword')
                : t('requestCode')
          }
          onPress={requested ? resetPassword : requestCode}
        />
      )}
      <Pressable onPress={onBack} style={authStyles.link}>
        <Text style={authStyles.linkLabel}>{t('backToSignIn')}</Text>
      </Pressable>
    </AuthLayout>
  );
}
