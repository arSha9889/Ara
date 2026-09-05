import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';

interface AccountScreenLayoutProps extends PropsWithChildren {
  title: string;
  description?: string;
}

export function AccountScreenLayout({ children, title, description }: AccountScreenLayoutProps) {
  const navigation = useNavigation();
  const { t } = useI18n();

  return (
    <AppScreen>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('back')}
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>{t('back')}</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </AppScreen>
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
    borderRadius: 14,
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
    borderRadius: 16,
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
  chevron: {
    color: colors.textFaint,
    fontSize: 28,
    lineHeight: 28,
  },
});

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backButton: {
    justifyContent: 'center',
    minHeight: 48,
  },
  backLabel: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
});
