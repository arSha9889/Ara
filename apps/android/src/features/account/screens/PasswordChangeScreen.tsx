import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../../auth/authError';
import { confirmPasswordChange, startPasswordChange } from '../api/accountApi';
import { AccountScreenLayout, accountStyles } from '../components/AccountScreenLayout';

const passwordPattern = /^[A-Za-z0-9]{5,30}$/;

export function PasswordChangeScreen() {
  const { language, t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
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
    if (!passwordPattern.test(currentPassword) || !passwordPattern.test(newPassword)) {
      setError(t('validationPassword'));
      return;
    }
    if (newPassword !== passwordRepeat) {
      setError(t('validationPasswordMatch'));
      return;
    }

    setError('');
    setStatus('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      const response = await startPasswordChange(currentPassword, newPassword, deviceId, language);
      setVerificationId(response.verification_id);
      setStatus(t('codeRequested'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmCode(): Promise<void> {
    if (isSubmitting || !verificationId) {
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
      await confirmPasswordChange(verificationId, code, deviceId);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordRepeat('');
      setCode('');
      setIsCompleted(true);
      setStatus(t('passwordChanged'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountScreenLayout description={t('passwordChangeDescription')} title={t('changePassword')}>
      <View style={[sharedStyles.elevatedCard, accountStyles.card]}>
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
        <Text style={accountStyles.label}>{t('newPassword')}</Text>
        <TextInput
          accessibilityLabel={t('newPassword')}
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!verificationId}
          onChangeText={setNewPassword}
          placeholder={t('enterPassword')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={accountStyles.input}
          textContentType="newPassword"
          value={newPassword}
        />
        <Text style={accountStyles.label}>{t('repeatPassword')}</Text>
        <TextInput
          accessibilityLabel={t('repeatPassword')}
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!verificationId}
          onChangeText={setPasswordRepeat}
          placeholder={t('repeatPassword')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={accountStyles.input}
          textContentType="newPassword"
          value={passwordRepeat}
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
