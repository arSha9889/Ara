import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { EmptyState } from '../../../ui/EmptyState';
import { authErrorKey } from '../../auth/authError';
import { getLoginHistory, type LoginHistoryItem } from '../api/accountApi';
import { AccountScreenLayout } from '../components/AccountScreenLayout';

export function LoginHistoryScreen() {
  const { language, t } = useI18n();
  const [items, setItems] = useState<LoginHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      setItems(await getLoginHistory());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    loadHistory().catch(() => undefined);
  }, [loadHistory]));

  return (
    <AccountScreenLayout description={t('loginHistoryScreenDescription')} title={t('loginHistoryTitle')}>
      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => loadHistory().catch(() => undefined)} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('chatsRetry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : items.length === 0 && !error ? (
        <EmptyState description={t('loginHistoryEmptyDescription')} title={t('loginHistoryEmptyTitle')} />
      ) : (
        <View style={styles.list}>
          {items.map(item => (
            <View key={item.id} style={[sharedStyles.glassCard, styles.itemCard]}>
              <View style={styles.heading}>
                <Text style={styles.method}>{methodLabel(item.method, t)}</Text>
                <Text style={item.result === 'success' ? styles.success : styles.failed}>
                  {item.result === 'success' ? t('loginResultSuccess') : t('loginResultFailed')}
                </Text>
              </View>
              {item.device_id ? <Text selectable style={styles.deviceId}>{item.device_id}</Text> : null}
              <Text style={styles.date}>{formatDate(item.created_at, language)}</Text>
            </View>
          ))}
        </View>
      )}
    </AccountScreenLayout>
  );
}

function methodLabel(
  method: string,
  t: (key: 'loginMethodPassword' | 'loginMethodPin' | 'loginMethodRegistration' | 'loginMethodOther') => string,
): string {
  if (method === 'password') {
    return t('loginMethodPassword');
  }
  if (method === 'pin') {
    return t('loginMethodPin');
  }
  if (method === 'email_register') {
    return t('loginMethodRegistration');
  }
  return t('loginMethodOther');
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

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  errorCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 40 },
  retryLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  itemCard: { padding: spacing.md },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  method: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '700' },
  success: { color: colors.success, fontSize: 13, fontWeight: '700' },
  failed: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  deviceId: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  date: { color: colors.textFaint, fontSize: 13, marginTop: 4 },
});
