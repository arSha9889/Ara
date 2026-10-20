import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { runtimeConfig } from '../../../config/runtimeConfig';
import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, spacing } from '../../../theme/theme';
import { Icon } from '../../../ui/Icon';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { legalDocumentUrls } from '../legalDocuments';
import type { RegistrationCountry } from '../registrationCountry';
import { registrationErrorKey } from '../registrationError';
import {
  completeRegistration,
  confirmEmailVerification,
  startEmailVerification,
} from '../api/authApi';
import { useSession } from '../session/useSession';
import { AuthLayout, authStyles } from './AuthLayout';
import { LegalDocumentLink } from './LegalDocumentLink';

type RegisterStep = 'email' | 'details';

interface RegisterScreenProps {
  country: RegistrationCountry;
  onBack(): void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[A-Za-z0-9]{3,32}$/;
const passwordPattern = /^[A-Za-z0-9]{5,30}$/;

export function RegisterScreen({ country, onBack }: RegisterScreenProps) {
  const { language, t } = useI18n();
  const { saveSession } = useSession();
  const [step, setStep] = useState<RegisterStep>('email');
  const [email, setEmail] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = Boolean(runtimeConfig.apiBaseUrl);

  function updateEmail(value: string): void {
    setEmail(value);
    setVerificationId(null);
    setCode('');
    setStatus('');
  }

  async function requestCode(): Promise<void> {
    if (!configured || isSubmitting) {
      return;
    }

    if (!emailPattern.test(email.trim())) {
      setError(t('validationEmail'));
      return;
    }

    setError('');
    setStatus('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      const response = await startEmailVerification(email, deviceId, language);
      setVerificationId(response.verification_id);
      setStatus(t('codeSent'));
    } catch (nextError) {
      setError(t(registrationErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmEmail(): Promise<void> {
    if (!configured || !verificationId || isSubmitting) {
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError(t('validationCode'));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await confirmEmailVerification(verificationId, code);
      setStatus('');
      setStep('details');
    } catch (nextError) {
      setError(t(registrationErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createAccount(): Promise<void> {
    if (!configured || !verificationId || isSubmitting) {
      return;
    }

    if (!usernamePattern.test(username.trim())) {
      setError(t('validationUsername'));
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

    if (displayName.trim().length > 80) {
      setError(t('validationDisplayName'));
      return;
    }

    if (!acceptedPrivacy || !acceptedTerms) {
      setError(t('validationLegal'));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const deviceId = await sessionStore.getDeviceId();
      const session = await completeRegistration({
        emailVerificationId: verificationId,
        username: username.trim(),
        password,
        displayName,
        deviceId,
        language,
        country,
      });
      await sessionStore
        .markNotificationPermissionRequest(session.user.id)
        .catch(() => undefined);
      await saveSession(session);
    } catch (nextError) {
      setError(t(registrationErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  const content =
    step === 'email' ? (
      <>
        <Text style={authStyles.label}>{t('email')}</Text>
        <TextInput
          accessibilityLabel={t('email')}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          maxLength={255}
          onChangeText={updateEmail}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={authStyles.input}
          textContentType="emailAddress"
          value={email}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!configured || !email.trim() || isSubmitting}
          onPress={requestCode}
          style={({ pressed }) => [
            authStyles.secondaryAction,
            (!configured || !email.trim() || isSubmitting) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={authStyles.secondaryActionLabel}>
            {isSubmitting ? t('sendingCode') : t('requestCode')}
          </Text>
        </Pressable>

        {verificationId ? (
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
            <PrimaryButton
              disabled={!configured || code.length !== 6 || isSubmitting}
              label={isSubmitting ? t('confirmingEmail') : t('confirmEmail')}
              onPress={confirmEmail}
            />
          </>
        ) : null}
      </>
    ) : (
      <>
        <Text style={authStyles.label}>{t('displayName')}</Text>
        <TextInput
          accessibilityLabel={t('displayName')}
          autoCapitalize="words"
          maxLength={80}
          onChangeText={setDisplayName}
          placeholder={t('displayNamePlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={authStyles.input}
          value={displayName}
        />
        <Text style={authStyles.label}>{t('username')}</Text>
        <TextInput
          accessibilityLabel={t('username')}
          autoCapitalize="none"
          onChangeText={setUsername}
          placeholder={t('usernamePlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={authStyles.input}
          value={username}
        />
        <Text style={styles.hint}>{t('usernameHint')}</Text>
        <Text style={authStyles.label}>{t('password')}</Text>
        <TextInput
          accessibilityLabel={t('password')}
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
        <Text style={styles.sectionTitle}>{t('legalTitle')}</Text>
        <Text style={styles.legalDescription}>{t('legalDescription')}</Text>
        <LegalDocumentLink
          label={t('openPrivacyPolicy')}
          onOpenError={() => setError(t('documentOpenError'))}
          url={legalDocumentUrls.privacy}
        />
        <ConsentCheck
          checked={acceptedPrivacy}
          label={t('legalPrivacy')}
          onChange={() => setAcceptedPrivacy(current => !current)}
        />
        <LegalDocumentLink
          label={t('openTermsOfUse')}
          onOpenError={() => setError(t('documentOpenError'))}
          url={legalDocumentUrls.terms}
        />
        <ConsentCheck
          checked={acceptedTerms}
          label={t('legalTerms')}
          onChange={() => setAcceptedTerms(current => !current)}
        />
        <PrimaryButton
          disabled={!configured || isSubmitting}
          label={isSubmitting ? t('creatingAccount') : t('createAccountAction')}
          onPress={createAccount}
        />
      </>
    );

  return (
    <AuthLayout
      description={t(step === 'email' ? 'registrationEmailDescription' : 'registrationProfileDescription')}
      eyebrow={t('registrationEyebrow')}
      title={t(step === 'email' ? 'registrationEmailTitle' : 'registrationProfileTitle')}
    >
      {content}
      {!configured ? <Text style={authStyles.configurationMessage}>{t('apiNotConfigured')}</Text> : null}
      {status ? <Text accessibilityRole="alert" style={authStyles.success}>{status}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
      {step === 'details' ? (
        <Pressable onPress={() => setStep('email')} style={authStyles.link}>
          <Text style={authStyles.linkLabel}>{t('back')}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onBack} style={authStyles.link}>
        <Text style={authStyles.linkLabel}>{t('backToSignIn')}</Text>
      </Pressable>
    </AuthLayout>
  );
}

function ConsentCheck({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(): void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onChange}
      style={({ pressed }) => [styles.consent, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Icon color={colors.onAccent} name="check" size={16} /> : null}
      </View>
      <Text style={styles.consentLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  legalDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  consent: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 48,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  consentLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
