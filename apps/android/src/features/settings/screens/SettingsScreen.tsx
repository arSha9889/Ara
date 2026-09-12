import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { useSession } from '../../auth/session/useSession';
import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { LanguageSwitcher } from '../../../localization/LanguageSwitcher';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { Icon } from '../../../ui/Icon';
import { deleteAccount, updateMyProfile } from '../../account/api/accountApi';
import { useMobilePush } from '../../notifications/MobilePushProvider';

export function SettingsScreen() {
  const { session, saveSession, signOut } = useSession();
  const { setLanguage, t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { enableNotifications, status: mobilePushStatus } = useMobilePush();
  const [languageNotice, setLanguageNotice] = useState('');
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);

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
      await saveSession({ ...session, user });
    } catch {
      setLanguageNotice(t('languageSyncError'));
    }
  }

  async function handleEnableNotifications(): Promise<void> {
    setIsEnablingNotifications(true);
    try {
      await enableNotifications();
    } finally {
      setIsEnablingNotifications(false);
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
      await sessionStore.clearSession();
    } catch {
      Alert.alert(t('deleteAccountError'));
    }
  }

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('appManagement')}</Text>
      <Text style={sharedStyles.title}>{t('settings')}</Text>

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
        <Text style={styles.sectionTitle}>{t('notifications')}</Text>
        <Text style={styles.rowTitle}>{t(mobilePushStatus === 'enabled' ? 'notificationsEnabled' : 'notificationsUnavailable')}</Text>
        <Text style={styles.rowDescription}>
          {t(mobilePushStatus === 'enabled' ? 'notificationsEnabledDescription' : 'notificationsDescription')}
        </Text>
        {mobilePushStatus !== 'enabled' && mobilePushStatus !== 'unsupported' ? (
          <Pressable
            accessibilityRole="button"
            disabled={isEnablingNotifications}
            onPress={() => { handleEnableNotifications().catch(() => undefined); }}
            style={({ pressed }) => [styles.notificationButton, pressed && !isEnablingNotifications && styles.notificationButtonPressed]}
          >
            <Text style={styles.notificationButtonLabel}>
              {t(isEnablingNotifications ? 'notificationsEnabling' : 'notificationsEnable')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[sharedStyles.elevatedCard, styles.section]}>
        <Text style={styles.sectionTitle}>{t('help')}</Text>
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
  notificationButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  notificationButtonPressed: {
    opacity: 0.78,
  },
  notificationButtonLabel: {
    color: colors.canvas,
    fontSize: 14,
    fontWeight: '700',
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
  deleteAccount: {
    alignItems: 'center',
    borderColor: 'rgba(255, 158, 175, 0.26)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  deleteAccountPressed: {
    backgroundColor: 'rgba(255, 158, 175, 0.08)',
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
