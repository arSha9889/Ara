import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { IconButton } from '../../../ui/IconButton';

interface AccountScreenLayoutProps extends PropsWithChildren {
  title: string;
  description?: string;
}

export function AccountScreenLayout({ children, title, description }: AccountScreenLayoutProps) {
  const navigation = useNavigation();
  const { t } = useI18n();

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ android: 'height', ios: 'padding' })}
      style={styles.keyboardAvoidingView}
    >
      <AppScreen bottomSafeArea>
        <View style={styles.header}>
          <IconButton accessibilityLabel={t('back')} icon="back" onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{title}</Text>
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {children}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

export const accountStyles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
  },
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
  hint: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
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
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonLabel: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 56,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  rowDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
});

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 23,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
});
