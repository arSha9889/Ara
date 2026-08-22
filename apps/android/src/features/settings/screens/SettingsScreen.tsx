import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../auth/session/useSession';
import { useI18n } from '../../../localization/I18nProvider';
import { LanguageSwitcher } from '../../../localization/LanguageSwitcher';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';

export function SettingsScreen() {
  const { signOut } = useSession();
  const { t } = useI18n();

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } catch {
      Alert.alert(t('signOutError'));
    }
  }

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('appManagement')}</Text>
      <Text style={sharedStyles.title}>{t('settings')}</Text>

      <View style={[sharedStyles.glassCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('privacySecurity')}</Text>
        <Text style={styles.rowTitle}>{t('protectedSession')}</Text>
        <Text style={styles.rowDescription}>
          {t('protectedSessionDescription')}
        </Text>
      </View>

      <View style={[sharedStyles.glassCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('notifications')}</Text>
        <Text style={styles.rowTitle}>{t('notificationsUnavailable')}</Text>
        <Text style={styles.rowDescription}>
          {t('notificationsDescription')}
        </Text>
      </View>

      <View style={[sharedStyles.glassCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        <Text style={styles.rowDescription}>{t('languageDescription')}</Text>
        <View style={styles.languageSwitcher}>
          <LanguageSwitcher />
        </View>
      </View>

      <Pressable
        accessibilityHint={t('signOut')}
        accessibilityRole="button"
        onPress={handleSignOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutLabel}>{t('signOut')}</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rowTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  rowDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  languageSwitcher: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  signOut: {
    alignItems: 'center',
    borderColor: 'rgba(255, 158, 175, 0.48)',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 52,
  },
  signOutPressed: {
    backgroundColor: 'rgba(255, 158, 175, 0.12)',
  },
  signOutLabel: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
});
