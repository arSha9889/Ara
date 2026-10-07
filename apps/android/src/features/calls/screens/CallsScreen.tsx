import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { useI18n } from '../../../localization/I18nProvider';
import type { TranslationKey } from '../../../localization/messages';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { authErrorKey } from '../../auth/authError';
import { ChatAvatar } from '../../chats/components/ChatAvatar';
import { useDirectCall } from '../DirectCallProvider';
import {
  getCallHistory,
  type CallHistoryItem,
} from '../api/callApi';
import {
  callSummary,
  groupCallHistory,
  mergeCallHistoryItem,
  type CallHistoryListItem,
} from '../callHistoryPresentation';
import { useRealtime } from '../../realtime/RealtimeProvider';

interface CallHistoryRowProps {
  call: CallHistoryItem;
  language: 'ru' | 'en';
  onOpenChat(call: CallHistoryItem): void;
  onRepeatCall(call: CallHistoryItem): void;
  t(key: TranslationKey): string;
  isCallActive: boolean;
}

const CallHistoryRow = memo(function CallHistoryRow({
  call,
  language,
  onOpenChat,
  onRepeatCall,
  t,
  isCallActive,
}: CallHistoryRowProps) {
  const contactName = call.peer.display_name || call.peer.username || t('callUnknownCaller');
  const isCompleted = call.outcome === 'completed';
  const isVideo = call.call_type === 'video';
  const summary = callSummary(call, t);

  return (
    <View style={styles.callRow}>
      <Pressable
        accessibilityHint={t('callsOpenChatHint')}
        accessibilityLabel={`${contactName}. ${summary}`}
        accessibilityRole="button"
        onPress={() => onOpenChat(call)}
        style={({ pressed }) => [styles.callMain, pressed && styles.callMainPressed]}
      >
        <ChatAvatar
          avatarRef={call.peer.avatar_ref}
          avatarType={call.peer.avatar_type}
          label={contactName}
          size="regular"
        />
        <View style={styles.callCopy}>
          <Text numberOfLines={1} style={styles.contactName}>{contactName}</Text>
          <View style={styles.callMeta}>
            <Icon color={isCompleted ? colors.textFaint : colors.danger} name={isVideo ? 'video' : 'call'} size={15} />
            <Text numberOfLines={1} style={[styles.summary, !isCompleted && styles.summaryMissed]}>{summary}</Text>
          </View>
        </View>
        <Text style={styles.callTime}>{formatCallTime(call.ended_at, language)}</Text>
      </Pressable>
      <IconButton
        accessibilityLabel={`${t('callCallback')}: ${contactName}, ${t(isVideo ? 'callVideo' : 'callAudio')}`}
        disabled={isCallActive}
        icon={isVideo ? 'video' : 'call'}
        onPress={() => onRepeatCall(call)}
      />
    </View>
  );
});

export function CallsScreen() {
  const { language, t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { call, startCall, startVideoCall } = useDirectCall();
  const { subscribeToEvents } = useRealtime();
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHistory = useCallback(async ({ refresh = false, showLoading = true }: {
    refresh?: boolean;
    showLoading?: boolean;
  } = {}): Promise<void> => {
    setError('');
    if (refresh) {
      setIsRefreshing(true);
    } else if (showLoading) {
      setIsLoading(true);
    }

    try {
      setHistory(await getCallHistory());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      if (refresh) {
        setIsRefreshing(false);
      }
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    loadHistory().catch(() => undefined);
  }, [loadHistory]));

  useEffect(() => subscribeToEvents(event => {
    if (event.event === 'connection.authenticated') {
      loadHistory({ showLoading: false }).catch(() => undefined);
      return;
    }

    if (event.event === 'call.history_created' && event.callHistory) {
      setHistory(current => mergeCallHistoryItem(current, event.callHistory!));
    }
  }), [loadHistory, subscribeToEvents]);

  const items = useMemo(
    () => groupCallHistory(history, language, t),
    [history, language, t],
  );

  const openChat = useCallback((historyItem: CallHistoryItem): void => {
    const title = historyItem.peer.display_name || historyItem.peer.username || t('chatsDirectFallback');
    navigation.navigate('Chat', {
      chatId: historyItem.chat_id,
      peerUserId: historyItem.peer.id,
      title,
    });
  }, [navigation, t]);

  const repeatCall = useCallback((historyItem: CallHistoryItem): void => {
    const input = {
      chatId: historyItem.chat_id,
      peerName: historyItem.peer.display_name || historyItem.peer.username || t('callUnknownCaller'),
      peerUserId: historyItem.peer.id,
    };
    const start = historyItem.call_type === 'video' ? startVideoCall : startCall;
    start(input).catch(() => undefined);
  }, [startCall, startVideoCall, t]);

  const renderItem = useCallback(({ item }: { item: CallHistoryListItem }) => {
    if (item.kind === 'header') {
      return <Text accessibilityRole="header" style={styles.dayHeader}>{item.label}</Text>;
    }

    return (
      <CallHistoryRow
        call={item.call}
        isCallActive={Boolean(call)}
        language={language}
        onOpenChat={openChat}
        onRepeatCall={repeatCall}
        t={t}
      />
    );
  }, [call, language, openChat, repeatCall, t]);

  return (
    <AppScreen scroll={false} contentStyle={styles.content}>
      <View style={styles.heading}>
        <View>
          <Text style={sharedStyles.eyebrow}>{t('callsEyebrow')}</Text>
          <Text style={sharedStyles.title}>{t('calls')}</Text>
        </View>
        <IconButton
          accessibilityLabel={t('chatsRetry')}
          disabled={isLoading || isRefreshing}
          icon="refresh"
          onPress={() => {
            loadHistory({ refresh: true, showLoading: false }).catch(() => undefined);
          }}
        />
      </View>

      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityLabel={t('chatsRetry')}
            accessibilityRole="button"
            onPress={() => {
              loadHistory().catch(() => undefined);
            }}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryLabel}>{t('chatsRetry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading && history.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingLabel}>{t('callsLoading')}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
          data={items}
          keyExtractor={item => item.id}
          ListEmptyComponent={error ? undefined : <EmptyState description={t('callsEmptyDescription')} icon="call" title={t('callsEmptyTitle')} />}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => {
                loadHistory({ refresh: true, showLoading: false }).catch(() => undefined);
              }}
              refreshing={isRefreshing}
              tintColor={colors.primary}
            />
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        accessibilityLabel={t('newCall')}
        accessibilityRole="button"
        onPress={() => navigation.navigate('MainTabs', { params: { mode: 'call' }, screen: 'Search' })}
        style={({ pressed }) => [styles.newCallButton, pressed && styles.newCallButtonPressed]}
      >
        <Icon color={colors.canvas} name="call" size={20} />
        <Text style={styles.newCallLabel}>{t('newCall')}</Text>
      </Pressable>
    </AppScreen>
  );
}

function formatCallTime(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
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
  loadingState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  loadingLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
  errorCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 48,
  },
  retryButtonPressed: {
    opacity: 0.72,
  },
  retryLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    paddingBottom: 84,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 84,
  },
  dayHeader: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  callRow: {
    alignItems: 'center',
    borderBottomColor: colors.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 80,
  },
  callMain: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  callMainPressed: {
    backgroundColor: colors.surface,
  },
  callCopy: {
    flex: 1,
    gap: 4,
  },
  contactName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  callMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  summary: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
  },
  summaryMissed: {
    color: colors.danger,
  },
  callTime: {
    alignSelf: 'flex-start',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.md,
  },
  newCallButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 24,
    bottom: spacing.md,
    elevation: 3,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  newCallButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  newCallLabel: {
    color: colors.canvas,
    fontSize: 14,
    fontWeight: '800',
  },
});
