import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../authError';
import { LegalDocumentsConsent } from '../components/LegalDocumentsConsent';
import { useSession } from '../session/useSession';
import { AuthLayout, useAuthStyles } from './AuthLayout';

export function LegalAcceptanceScreen() {
  const { t } = useI18n();
  const authStyles = useAuthStyles();
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
      <LegalDocumentsConsent
        acceptedPrivacy={acceptedPrivacy}
        acceptedTerms={acceptedTerms}
        onAcceptedPrivacyChange={() => setAcceptedPrivacy(current => !current)}
        onAcceptedTermsChange={() => setAcceptedTerms(current => !current)}
        onOpenError={() => setError(t('documentOpenError'))}
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
