import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type AppColors } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { Icon } from '../../../ui/Icon';
import { legalDocumentUrls } from '../legalDocuments';
import { LegalDocumentLink } from '../screens/LegalDocumentLink';
import { useI18n } from '../../../localization/I18nProvider';

interface LegalDocumentsConsentProps {
  acceptedPrivacy: boolean;
  acceptedTerms: boolean;
  onAcceptedPrivacyChange(): void;
  onAcceptedTermsChange(): void;
  onOpenError(): void;
}

export function LegalDocumentsConsent({
  acceptedPrivacy,
  acceptedTerms,
  onAcceptedPrivacyChange,
  onAcceptedTermsChange,
  onOpenError,
}: LegalDocumentsConsentProps) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <Text style={styles.description}>{t('legalDescription')}</Text>
      <LegalDocument
        accepted={acceptedPrivacy}
        consentLabel={t('legalPrivacy')}
        documentName={t('privacyPolicy')}
        linkLabel={t('openPrivacyPolicy')}
        onChange={onAcceptedPrivacyChange}
        onOpenError={onOpenError}
        url={legalDocumentUrls.privacy}
      />
      <LegalDocument
        accepted={acceptedTerms}
        consentLabel={t('legalTerms')}
        documentName={t('termsOfUse')}
        linkLabel={t('openTermsOfUse')}
        onChange={onAcceptedTermsChange}
        onOpenError={onOpenError}
        url={legalDocumentUrls.terms}
      />
    </View>
  );
}

function LegalDocument({
  accepted,
  consentLabel,
  documentName,
  linkLabel,
  onChange,
  onOpenError,
  url,
}: {
  accepted: boolean;
  consentLabel: string;
  documentName: string;
  linkLabel: string;
  onChange(): void;
  onOpenError(): void;
  url: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.document}>
      <Text style={styles.documentName}>{documentName}</Text>
      <LegalDocumentLink label={linkLabel} onOpenError={onOpenError} url={url} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={onChange}
        style={({ pressed }) => [styles.consent, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
          {accepted ? <Icon color={colors.onAccent} name="check" size={16} /> : null}
        </View>
        <Text style={styles.consentLabel}>{consentLabel}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    description: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    document: {
      backgroundColor: colors.input,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    documentName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
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
}
