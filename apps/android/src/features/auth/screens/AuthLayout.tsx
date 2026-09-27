import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { LanguageSwitcher } from '../../../localization/LanguageSwitcher';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { HaloMark } from '../../../ui/HaloMark';

interface AuthLayoutProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  description: string;
}

export function AuthLayout({ eyebrow, title, description, children }: AuthLayoutProps) {
  const { t } = useI18n();

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.keyboardAvoidingView}
    >
      <AppScreen contentStyle={styles.content}>
        <View style={styles.languageSwitcher}>
          <LanguageSwitcher />
        </View>
        <View style={styles.hero}>
          <HaloMark />
          <Text style={styles.brand}>AraChat</Text>
          <Text style={styles.tagline}>{t('tagline')}</Text>
        </View>

        <View style={[sharedStyles.elevatedCard, styles.card]}>
          <Text style={sharedStyles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {children}
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

export const authStyles = StyleSheet.create({
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  configurationMessage: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  success: {
    color: colors.success,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  secondaryActionLabel: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
    justifyContent: 'center',
  },
  linkLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    justifyContent: 'center',
    maxWidth: 560,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    width: '100%',
  },
  languageSwitcher: {
    alignSelf: 'flex-end',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  brand: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: spacing.md,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
});
