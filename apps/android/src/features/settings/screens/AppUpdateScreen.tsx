import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { Icon } from '../../../ui/Icon';
import { AccountScreenLayout } from '../../account/components/AccountScreenLayout';
import { useAppUpdate } from '../AppUpdateProvider';

export function AppUpdateScreen() {
  const { t } = useI18n();
  const { isUpdateAvailable, release, source } = useAppUpdate();
  const [notice, setNotice] = useState('');
  const actionUrl =
    source === 'rustore'
      ? release?.rustoreAppUrl ?? null
      : source === 'direct'
        ? release?.directDownloadUrl ?? null
        : null;
  const actionLabel = source === 'rustore' ? t('appUpdateOpenRuStore') : t('appUpdateOpenDownloadPage');
  const actionHint = source === 'rustore' ? t('appUpdateRuStoreHint') : t('appUpdateDirectHint');
  const description =
    source === 'rustore' && actionUrl
      ? t('appUpdateRuStoreDescription')
      : source === 'direct' && actionUrl
        ? t('appUpdateDirectDescription')
        : t('appUpdateUnknownSourceDescription');

  async function openUpdatePage(): Promise<void> {
    if (!actionUrl) {
      return;
    }

    setNotice('');
    try {
      await Linking.openURL(actionUrl);
    } catch {
      setNotice(t('appUpdateOpenError'));
    }
  }

  return (
    <AccountScreenLayout
      description={isUpdateAvailable ? description : t('appUpdateNotAvailableDescription')}
      title={t('appUpdateTitle')}
    >
      {isUpdateAvailable && release ? (
        <View style={[sharedStyles.elevatedCard, styles.card]}>
          <View style={styles.versionRow}>
            <Icon color={colors.primary} name="download" size={22} />
            <View style={styles.versionCopy}>
              <Text style={styles.versionLabel}>{t('appUpdateLatestVersion')}</Text>
              <Text style={styles.version}>{release.latestVersionName}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>{t('appUpdateWhatsNew')}</Text>
          <View style={styles.notes}>
            {release.releaseNotes.map(note => (
              <View key={note} style={styles.noteRow}>
                <View accessibilityElementsHidden style={styles.noteMarker} />
                <Text style={styles.note}>{note}</Text>
              </View>
            ))}
          </View>

          {actionUrl ? (
            <Pressable
              accessibilityHint={actionHint}
              accessibilityLabel={actionLabel}
              accessibilityRole="link"
              onPress={() => {
                openUpdatePage().catch(() => undefined);
              }}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              testID="app-update-action"
            >
              <Icon color={colors.canvas} name="download" size={20} />
              <Text style={styles.actionLabel}>{actionLabel}</Text>
            </Pressable>
          ) : null}
          {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        </View>
      ) : null}
    </AccountScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  versionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  versionCopy: {
    flex: 1,
  },
  versionLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  version: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  notes: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  noteRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noteMarker: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 6,
    marginTop: 8,
    width: 6,
  },
  note: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  action: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 14,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  actionPressed: {
    backgroundColor: colors.primaryPressed,
  },
  actionLabel: {
    color: colors.canvas,
    fontSize: 16,
    fontWeight: '700',
  },
  notice: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
