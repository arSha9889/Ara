import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { useI18n } from '../../../localization/I18nProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';

export function ChatsScreen() {
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const isTwoPane = width >= 840;

  return (
    <AppScreen scroll={false} contentStyle={styles.content}>
      <View style={styles.heading}>
        <View>
          <Text style={sharedStyles.eyebrow}>AraChat</Text>
          <Text style={sharedStyles.title}>{t('chats')}</Text>
        </View>
        <View accessibilityLabel={t('noMessages')} style={styles.statusDot} />
      </View>

      <View style={[styles.workspace, isTwoPane && styles.twoPaneWorkspace]}>
        <View style={[styles.listPane, isTwoPane && styles.twoPaneList]}>
          <EmptyState
            description={t('chatsEmptyDescription')}
            title={t('chatsEmptyTitle')}
          />
        </View>
        {isTwoPane ? (
          <View style={[sharedStyles.glassCard, styles.detailPane]}>
            <Text style={styles.detailTitle}>{t('selectChat')}</Text>
            <Text style={styles.detailBody}>
              {t('selectChatDescription')}
            </Text>
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.md,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  statusDot: {
    backgroundColor: colors.success,
    borderColor: 'rgba(131, 225, 177, 0.32)',
    borderRadius: 16,
    borderWidth: 6,
    height: 18,
    width: 18,
  },
  workspace: {
    flex: 1,
  },
  twoPaneWorkspace: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  listPane: {
    flex: 1,
  },
  twoPaneList: {
    maxWidth: 420,
  },
  detailPane: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  detailTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  detailBody: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.sm,
    maxWidth: 300,
    textAlign: 'center',
  },
});
