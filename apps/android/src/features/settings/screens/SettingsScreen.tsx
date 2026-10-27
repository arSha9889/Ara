import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { useSession } from '../../auth/session/useSession';
import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { clearPrivateChatMediaCache } from '../../chats/media/mediaClient';
import { useI18n } from '../../../localization/I18nProvider';
import { LanguageSwitcher } from '../../../localization/LanguageSwitcher';
import { spacing, type AppColors, type ThemePreference } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { Icon } from '../../../ui/Icon';
import { InterfaceIcon } from '../../../ui/InterfaceIcon';
import { deleteAccount, updateMyProfile } from '../../account/api/accountApi';
import { useMobilePush } from '../../notifications/MobilePushProvider';
import { useAppUpdate } from '../AppUpdateProvider';

export function SettingsScreen() {
  const { session, signOut, updateSessionUser } = useSession();
  const { setLanguage, t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status: mobilePushStatus } = useMobilePush();
  const { isUpdateAvailable, release } = useAppUpdate();
  const { colors, preference, setPreference, sharedStyles } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [languageNotice, setLanguageNotice] = useState('');

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } catch {
      Alert.alert(t('signOutError'));
    }
  }

  async function handleLanguageChange(nextLanguage: 'ru' | 'en'): Promise<void> {
    setLanguageNotice('');
    await setLanguage(nextLanguage);

    if (!session) {
      return;
    }

    try {
      const user = await updateMyProfile({ language: nextLanguage });
      await updateSessionUser(user);
    } catch {
      setLanguageNotice(t('languageSyncError'));
    }
  }

  function confirmDeleteAccount(): void {
    Alert.alert(t('deleteAccount'), t('deleteAccountConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteAccount'), style: 'destructive', onPress: () => { removeAccount().catch(() => undefined); } },
    ]);
  }

  async function removeAccount(): Promise<void> {
    try {
      await deleteAccount();
      await Promise.all([
        clearPrivateChatMediaCache(),
        sessionStore.clearSession(),
      ]);
    } catch {
      Alert.alert(t('deleteAccountError'));
    }
  }

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('appManagement')}</Text>
      <Text style={sharedStyles.title}>{t('settings')}</Text>

      {isUpdateAvailable && release ? (
        <Pressable
          accessibilityHint={t('appUpdateOpenCenterHint')}
          accessibilityLabel={t('appUpdateAvailable')}
          accessibilityRole="button"
          onPress={() => navigation.navigate('AppUpdate')}
          style={({ pressed }) => [sharedStyles.elevatedCard, styles.section, pressed && styles.updateEntryPressed]}
          testID="app-update-card"
        >
          <Text style={styles.sectionTitle}>{t('appUpdateAvailable')}</Text>
          <Text style={styles.rowTitle}>{release.latestVersionName}</Text>
          <Text style={styles.rowDescription}>
            {t('appUpdateOpenCenterDescription')}
          </Text>
        </Pressable>
      ) : null}

      <View style={[sharedStyles.elevatedCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('accountSettings')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('ProfileEdit')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('profile')}</Text>
            <Text style={styles.rowDescription}>{t('profileDetails')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('AccountCredentials')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('emailAndPassword')}</Text>
            <Text style={styles.rowDescription}>{t('emailAndPasswordDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Devices')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('devices')}</Text>
            <Text style={styles.rowDescription}>{t('devicesDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('LoginHistory')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('loginHistory')}</Text>
            <Text style={styles.rowDescription}>{t('loginHistoryDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('PinSettings')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('pinCode')}</Text>
            <Text style={styles.rowDescription}>{t('pinCodeDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
      </View>

      <View style={[sharedStyles.elevatedCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('privacySecurity')}</Text>
        <Text style={styles.rowTitle}>{t('protectedSession')}</Text>
        <Text style={styles.rowDescription}>
          {t('protectedSessionDescription')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('BlockedUsers')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('blockedUsers')}</Text>
            <Text style={styles.rowDescription}>{t('blockedUsersDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('MyReports')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('myReports')}</Text>
            <Text style={styles.rowDescription}>{t('myReportsDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
      </View>

        <View style={[sharedStyles.elevatedCard, styles.section]}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t('notifications')}</Text>
            <InterfaceIcon color={colors.primary} name="bell" size={22} />
          </View>
          <Text style={styles.rowTitle}>{t(mobilePushStatus === 'enabled' ? 'notificationsEnabled' : 'notificationsUnavailable')}</Text>
          <Text style={styles.rowDescription}>
            {t(mobilePushStatus === 'enabled' ? 'notificationsEnabledDescription' : 'notificationsDescription')}
          </Text>
        </View>

        <View style={[sharedStyles.elevatedCard, styles.section]}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t('help')}</Text>
            <InterfaceIcon color={colors.primary} name="bullhorn" size={22} />
          </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('SupportTickets')}
          style={({ pressed }) => [styles.navigationRow, pressed && styles.navigationRowPressed]}
        >
          <View style={styles.navigationCopy}>
            <Text style={styles.rowTitle}>{t('support')}</Text>
            <Text style={styles.rowDescription}>{t('supportSettingsDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
      </View>

      <View style={[sharedStyles.elevatedCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('theme')}</Text>
        <Text style={styles.rowDescription}>{t('themeDescription')}</Text>
        <View accessibilityRole="radiogroup" style={styles.themeOptions}>
          {(['system', 'light', 'dark'] as const).map(option => {
            const selected = preference === option;
            const labelKey: Record<ThemePreference, 'themeSystem' | 'themeLight' | 'themeDark'> = {
              system: 'themeSystem',
              light: 'themeLight',
              dark: 'themeDark',
            };
            return (
              <Pressable
                accessibilityLabel={t(labelKey[option])}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={option}
                onPress={() => { setPreference(option).catch(() => undefined); }}
                style={({ pressed }) => [styles.themeOption, selected && styles.themeOptionSelected, pressed && styles.navigationRowPressed]}
              >
                <Text style={[styles.themeOptionLabel, selected && styles.themeOptionLabelSelected]}>{t(labelKey[option])}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[sharedStyles.elevatedCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        <Text style={styles.rowDescription}>{t('languageDescription')}</Text>
        <View style={styles.languageSwitcher}>
          <LanguageSwitcher onLanguageChange={nextLanguage => { handleLanguageChange(nextLanguage).catch(() => undefined); }} />
        </View>
        {languageNotice ? <Text accessibilityRole="alert" style={styles.languageNotice}>{languageNotice}</Text> : null}
      </View>

      <Pressable
        accessibilityHint={t('signOut')}
        accessibilityRole="button"
        onPress={handleSignOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutLabel}>{t('signOut')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={confirmDeleteAccount}
        style={({ pressed }) => [styles.deleteAccount, pressed && styles.deleteAccountPressed]}
      >
        <Text style={styles.deleteAccountLabel}>{t('deleteAccount')}</Text>
        <Text style={styles.deleteAccountDescription}>{t('deleteAccountDescription')}</Text>
      </Pressable>
    </AppScreen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  updateEntryPressed: {
    backgroundColor: colors.surfacePressed,
  },
  languageSwitcher: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  languageNotice: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  themeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  themeOption: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  themeOptionSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  themeOptionLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  themeOptionLabelSelected: { color: colors.accent },
  navigationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 56,
  },
  navigationRowPressed: {
    backgroundColor: colors.surfacePressed,
    borderRadius: 14,
  },
  navigationCopy: {
    flex: 1,
  },
  signOut: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 52,
  },
  signOutPressed: {
    backgroundColor: colors.dangerSubtle,
  },
  signOutLabel: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteAccount: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  deleteAccountPressed: {
    backgroundColor: colors.dangerSubtle,
  },
  deleteAccountLabel: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteAccountDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
    textAlign: 'center',
  },
  });
}
