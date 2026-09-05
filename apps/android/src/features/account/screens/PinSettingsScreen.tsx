import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../../auth/authError';
import { createPin, resetPin } from '../api/accountApi';
import { AccountScreenLayout, accountStyles } from '../components/AccountScreenLayout';

export function PinSettingsScreen() {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function savePin(): Promise<void> {
    if (isSubmitting) {
      return;
    }
    if (currentPassword.length < 5 || currentPassword.length > 30) {
      setError(t('validationPassword'));
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError(t('validationPin'));
      return;
    }
    if (pin !== pinRepeat) {
      setError(t('validationPasswordMatch'));
      return;
    }

    setError('');
    setStatus('');
    setIsSubmitting(true);
    try {
      await createPin(currentPassword, pin, await sessionStore.getDeviceId());
      setPin('');
      setPinRepeat('');
      setStatus(t('pinChanged'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmRemoval(): void {
    if (isSubmitting) {
      return;
    }
    if (currentPassword.length < 5 || currentPassword.length > 30) {
      setError(t('validationPassword'));
      return;
    }

    Alert.alert(t('removePin'), t('pinSettingsDescription'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('removePin'), style: 'destructive', onPress: () => { removePin().catch(() => undefined); } },
    ]);
  }

  async function removePin(): Promise<void> {
    setError('');
    setStatus('');
    setIsSubmitting(true);
    try {
      await resetPin(currentPassword, null, await sessionStore.getDeviceId());
      setCurrentPassword('');
      setPin('');
      setPinRepeat('');
      setStatus(t('pinRemoved'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountScreenLayout description={t('pinSettingsDescription')} title={t('pinSettings')}>
      <View style={[sharedStyles.glassCard, accountStyles.card]}>
        <Text style={accountStyles.label}>{t('currentPassword')}</Text>
        <TextInput
          accessibilityLabel={t('currentPassword')}
          autoCapitalize="none"
          autoComplete="current-password"
          onChangeText={setCurrentPassword}
          placeholder={t('currentPasswordPlaceholder')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={accountStyles.input}
          textContentType="password"
          value={currentPassword}
        />
        <Text style={accountStyles.label}>{t('pin')}</Text>
        <TextInput
          accessibilityLabel={t('pin')}
          keyboardType="number-pad"
          maxLength={8}
          onChangeText={value => setPin(value.replace(/\D/g, '').slice(0, 8))}
          placeholder={t('pinPlaceholder')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={accountStyles.input}
          value={pin}
        />
        <Text style={accountStyles.label}>{t('repeatPin')}</Text>
        <TextInput
          accessibilityLabel={t('repeatPin')}
          keyboardType="number-pad"
          maxLength={8}
          onChangeText={value => setPinRepeat(value.replace(/\D/g, '').slice(0, 8))}
          placeholder={t('pinPlaceholder')}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={accountStyles.input}
          value={pinRepeat}
        />
        {status ? <Text accessibilityRole="alert" style={accountStyles.success}>{status}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={accountStyles.error}>{error}</Text> : null}
        <View style={styles.saveButton}>
          <PrimaryButton
            disabled={isSubmitting}
            label={isSubmitting ? t('savingChanges') : t('setOrReplacePin')}
            onPress={savePin}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={confirmRemoval}
          style={({ pressed }) => [styles.removeButton, pressed && !isSubmitting && styles.pressed]}
        >
          <Text style={styles.removeButtonLabel}>{t('removePin')}</Text>
        </Pressable>
      </View>
    </AccountScreenLayout>
  );
}

const styles = StyleSheet.create({
  saveButton: {
    marginTop: spacing.lg,
  },
  removeButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 158, 175, 0.48)',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 52,
  },
  removeButtonLabel: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.76,
  },
});
