import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';
import { IconButton } from '../../../ui/IconButton';
import { getBlockedUsers, unblockUser, type BlockedUser } from '../api/safetyApi';

export function BlockedUsersScreen() {
  const { language, t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      setUsers(await getBlockedUsers());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    loadUsers().catch(() => undefined);
  }, [loadUsers]));

  function confirmUnblock(user: BlockedUser): void {
    if (pendingUserId) {
      return;
    }

    Alert.alert(t('unblockUser'), t('unblockUserConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('unblockUser'), onPress: () => { unblock(user).catch(() => undefined); } },
    ]);
  }

  async function unblock(user: BlockedUser): Promise<void> {
    if (pendingUserId) {
      return;
    }

    setError('');
    setPendingUserId(user.user_id);
    try {
      await unblockUser(user.user_id);
      setUsers(current => current.filter(item => item.user_id !== user.user_id));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t('back')} icon="back" onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('blockedUsers')}</Text>
      </View>
      <Text style={styles.intro}>{t('blockedUsersDescription')}</Text>
      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => loadUsers().catch(() => undefined)} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('chatsRetry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : users.length === 0 && !error ? (
        <EmptyState description={t('blockedUsersEmptyDescription')} title={t('blockedUsersEmptyTitle')} />
      ) : (
        <View style={styles.list}>
          {users.map(user => (
            <View key={user.user_id} style={[sharedStyles.elevatedCard, styles.userCard]}>
              <View style={styles.avatar}><Text style={styles.avatarLabel}>{user.display_name.trim().charAt(0).toUpperCase() || 'A'}</Text></View>
              <View style={styles.userCopy}>
                <Text numberOfLines={1} style={styles.userName}>{user.display_name}</Text>
                {user.username ? <Text style={styles.username}>@{user.username}</Text> : null}
                <Text style={styles.date}>{formatDate(user.blocked_at, language)}</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={Boolean(pendingUserId)} onPress={() => confirmUnblock(user)} style={({ pressed }) => [styles.unblockButton, pressed && !pendingUserId && styles.pressed]}>
                <Text style={styles.unblockLabel}>{pendingUserId === user.user_id ? '…' : t('unblockUser')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function formatDate(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }).format(date);
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: { color: colors.text, flex: 1, fontSize: 24, fontWeight: '700' },
  intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: spacing.xs },
  loading: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  errorCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  retryLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  userCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  avatar: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarLabel: { color: colors.text, fontSize: 18, fontWeight: '700' },
  userCopy: { flex: 1 },
  userName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  username: { color: colors.primary, fontSize: 14, marginTop: 2 },
  date: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  unblockButton: { alignItems: 'center', borderColor: colors.glassBorder, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.sm },
  unblockLabel: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  pressed: { backgroundColor: colors.surfacePressed },
});
