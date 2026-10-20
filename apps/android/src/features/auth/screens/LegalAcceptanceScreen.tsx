import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, spacing } from '../../../theme/theme';
import { Icon } from '../../../ui/Icon';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../authError';
import { legalDocumentUrls } from '../legalDocuments';
import { useSession } from '../session/useSession';
import { AuthLayout, authStyles } from './AuthLayout';
import { LegalDocumentLink } from './LegalDocumentLink';

export function LegalAcceptanceScreen() {
  const { t } = useI18n();
  const { acceptLegalDocuments, signOut } = useSession();
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function acceptDocuments(): Promise<void> {
    if (!acceptedPrivacy || !acceptedTerms || isSubmitting) {
      if (!acceptedPrivacy || !acceptedTerms) {
        setError(t('validationLegal'));
      }
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await acceptLegalDocuments();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } catch {
      setError(t('signOutError'));
    }
  }

  return (
    <AuthLayout
      description={t('legalUpdateDescription')}
      eyebrow={t('legalUpdateEyebrow')}
      title={t('legalUpdateTitle')}
    >
      <Text style={styles.documentName}>{t('privacyPolicy')}</Text>
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
      <Text style={styles.documentName}>{t('termsOfUse')}</Text>
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
      {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
      <PrimaryButton
        disabled={!acceptedPrivacy || !acceptedTerms || isSubmitting}
        label={isSubmitting ? t('saving') : t('acceptAndContinue')}
        onPress={acceptDocuments}
      />
      <Pressable onPress={handleSignOut} style={authStyles.link}>
        <Text style={authStyles.linkLabel}>{t('signOut')}</Text>
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
  documentName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  consent: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  pressed: {
    opacity: 0.78,
  },
});
