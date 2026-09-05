import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import { confirmEmailChange, startEmailChange } from '../api/accountApi';
import { AccountScreenLayout, accountStyles } from '../components/AccountScreenLayout';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailChangeScreen() {
  const { session, saveSession } = useSession();
  const { language, t } = useI18n();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestCode(): Promise<void> {
    if (isSubmitting) {
      return;
    }
    if (!emailPattern.test(email.trim())) {
      setError(t('validationEmail'));
      return;
    }
    if (currentPassword.length < 5 || currentPassword.length > 30) {
      setError(t('validationPassword'));
      return;
    }

    setError('');
    setStatus('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      const response = await startEmailChange(currentPassword, email, deviceId, language);
      setVerificationId(response.verification_id);
      setStatus(t('codeRequested'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmCode(): Promise<void> {
    if (isSubmitting || !verificationId || !session) {
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(t('validationCode'));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      const user = await confirmEmailChange(verificationId, code, deviceId);
      await saveSession({ ...session, user });
      setIsCompleted(true);
      setStatus(t('emailChanged'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountScreenLayout description={t('emailChangeDescription')} title={t('changeEmail')}>
      <View style={[sharedStyles.glassCard, accountStyles.card]}>
        <Text style={accountStyles.label}>{t('email')}</Text>
        <TextInput
          accessibilityLabel={t('email')}
          autoCapitalize="none"
          autoComplete="email"
          editable={!verificationId}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={accountStyles.input}
          textContentType="emailAddress"
          value={email}
        />
        <Text style={accountStyles.label}>{t('currentPassword')}</Text>
        <TextInput
          accessibilityLabel={t('currentPassword')}
          autoCapitalize="none"
          autoComplete="current-password"
          editable={!verificationId}
          onChangeText={setCurrentPassword}
          placeholder={t('currentPasswordPlaceholder')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={accountStyles.input}
          textContentType="password"
          value={currentPassword}
        />
        {verificationId ? (
          <>
            <Text style={accountStyles.label}>{t('verificationCode')}</Text>
            <TextInput
              accessibilityLabel={t('verificationCode')}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('verificationCodePlaceholder')}
              placeholderTextColor={colors.textFaint}
              style={accountStyles.input}
              textContentType="oneTimeCode"
              value={code}
            />
          </>
        ) : null}
        {status ? <Text accessibilityRole="alert" style={accountStyles.success}>{status}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={accountStyles.error}>{error}</Text> : null}
        {!isCompleted ? (
          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton
              disabled={isSubmitting || (Boolean(verificationId) && code.length !== 6)}
              label={isSubmitting ? t('savingChanges') : verificationId ? t('confirmCode') : t('requestCode')}
              onPress={verificationId ? confirmCode : requestCode}
            />
          </View>
        ) : null}
      </View>
    </AccountScreenLayout>
  );
}
