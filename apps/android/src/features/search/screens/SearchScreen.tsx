import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { useI18n } from '../../../localization/I18nProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';

export function SearchScreen() {
  const { t } = useI18n();

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('newConnections')}</Text>
      <Text style={sharedStyles.title}>{t('search')}</Text>
      <Text style={styles.intro}>{t('searchIntro')}</Text>

      <View style={styles.searchBox}>
        <Text style={styles.searchSymbol}>⌕</Text>
        <TextInput
          accessibilityLabel={t('searchInput')}
          autoCapitalize="none"
          placeholder={t('searchInput')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
      </View>

      <View style={styles.emptyState}>
        <EmptyState
            description={t('searchEmptyDescription')}
            title={t('searchEmptyTitle')}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.xs,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: spacing.lg,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  searchSymbol: {
    color: colors.primary,
    fontSize: 24,
    marginRight: spacing.sm,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 48,
  },
  emptyState: {
    marginTop: spacing.lg,
  },
});
