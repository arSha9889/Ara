import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { sessionStore } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { spacing, type AppColors } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { EmptyState } from '../../../ui/EmptyState';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import { getDeviceSessions, revokeDeviceSession, type DeviceSession } from '../api/accountApi';
import { AccountScreenLayout } from '../components/AccountScreenLayout';

export function DevicesScreen() {
  const { language, t } = useI18n();
  const { colors, sharedStyles } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { signOut } = useSession();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const [items, deviceId] = await Promise.all([getDeviceSessions(), sessionStore.getDeviceId()]);
      setSessions(items);
      setCurrentDeviceId(deviceId);
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    loadSessions().catch(() => undefined);
  }, [loadSessions]));

  function confirmRevoke(item: DeviceSession): void {
    if (pendingDeviceId || item.revoked_at) {
      return;
    }
    const current = item.device_id === currentDeviceId;
    Alert.alert(t('revokeDevice'), t(current ? 'revokeCurrentDeviceConfirm' : 'revokeDeviceConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('revokeDevice'), style: 'destructive', onPress: () => { revoke(item, current).catch(() => undefined); } },
    ]);
  }

  async function revoke(item: DeviceSession, isCurrentDevice: boolean): Promise<void> {
    setError('');
    setPendingDeviceId(item.device_id);
    try {
      await revokeDeviceSession(item.device_id);
      if (isCurrentDevice) {
        await signOut();
        return;
      }
      setSessions(current =>
        current.map(session =>
          session.device_id === item.device_id
            ? { ...session, revoked_at: new Date().toISOString() }
            : session,
        ),
      );
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingDeviceId(null);
    }
  }

  return (
    <AccountScreenLayout description={t('devicesScreenDescription')} title={t('deviceSessions')}>
      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => loadSessions().catch(() => undefined)} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('chatsRetry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : sessions.length === 0 && !error ? (
        <EmptyState description={t('devicesEmptyDescription')} title={t('devicesEmptyTitle')} />
      ) : (
        <View style={styles.list}>
          {sessions.map(item => {
            const isCurrentDevice = item.device_id === currentDeviceId;
            const isRevoked = Boolean(item.revoked_at);
            const isExpired = !isRevoked && isExpiredAt(item.expires_at);
            const isActive = !isRevoked && !isExpired;
            const isPending = pendingDeviceId === item.device_id;
            return (
              <View key={item.id} style={[sharedStyles.elevatedCard, styles.sessionCard]}>
                <View style={styles.sessionHeading}>
                  <Text style={styles.sessionTitle}>{isCurrentDevice ? t('currentDevice') : t('devices')}</Text>
                  <Text style={isActive ? styles.active : styles.revoked}>
                    {isRevoked ? t('sessionRevoked') : isExpired ? t('sessionExpired') : t('sessionActive')}
                  </Text>
                </View>
                <Text style={styles.identifierLabel}>{t('deviceIdentifier')}</Text>
                <Text selectable style={styles.identifier}>{item.device_id}</Text>
                <Text style={styles.date}>{t('sessionCreated')}: {formatDate(item.created_at, language)}</Text>
                <Text style={styles.date}>{t('sessionExpires')}: {formatDate(item.expires_at, language)}</Text>
                {item.revoked_at ? <Text style={styles.date}>{t('sessionRevoked')}: {formatDate(item.revoked_at, language)}</Text> : null}
                {isActive ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPending}
                    onPress={() => confirmRevoke(item)}
                    style={({ pressed }) => [styles.revokeButton, pressed && !isPending && styles.pressed]}
                  >
                    <Text style={styles.revokeLabel}>{isPending ? '…' : t('revokeDevice')}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </AccountScreenLayout>
  );
}

function formatDate(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function isExpiredAt(value: string): boolean {
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp) && timestamp <= Date.now();
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  errorCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48 },
  retryLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  sessionCard: { padding: spacing.md },
  sessionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sessionTitle: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '700' },
  active: { color: colors.success, fontSize: 13, fontWeight: '700' },
  revoked: { color: colors.textFaint, fontSize: 13, fontWeight: '700' },
  identifierLabel: { color: colors.textFaint, fontSize: 12, fontWeight: '600', marginTop: spacing.sm, textTransform: 'uppercase' },
  identifier: { color: colors.text, fontSize: 13, marginTop: 2 },
  date: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  revokeButton: { alignItems: 'center', borderColor: colors.danger, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: spacing.md, minHeight: 48 },
  revokeLabel: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  pressed: { backgroundColor: colors.dangerSubtle },
  });
}
