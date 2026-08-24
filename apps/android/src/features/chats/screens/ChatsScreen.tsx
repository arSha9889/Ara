import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSession } from '../../auth/session/useSession';
import { authErrorKey } from '../../auth/authError';
import { chatPreview, chatTitle, formatConversationTime, type ChatPresentationCopy } from '../chatPresentation';
import { getChats, type Chat } from '../api/chatApi';
import { applyCreatedMessageToChats, applyReadMessageToChats } from '../chatRealtime';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { useI18n } from '../../../localization/I18nProvider';
import { useRealtime } from '../../realtime/RealtimeProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';

function ChatSubscription({ chatId }: { chatId: string }) {
  const { subscribeToChat } = useRealtime();

  useEffect(() => subscribeToChat(chatId), [chatId, subscribeToChat]);

  return null;
}

export function ChatsScreen() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { subscribeToEvents } = useRealtime();
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy: ChatPresentationCopy = {
    attachment: t('chatsAttachment'),
    directChat: t('chatsDirectFallback'),
    noMessages: t('noMessages'),
    savedMessages: t('chatsSavedMessages'),
    youPrefix: t('youPrefix'),
  };

  const loadChats = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) {
      setError('');
      setIsLoading(true);
    }

    try {
      setChats(await getChats());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadChats().catch(() => undefined);
    }, [loadChats]),
  );

  const scheduleResync = useCallback(() => {
    if (resyncTimer.current) {
      clearTimeout(resyncTimer.current);
    }

    resyncTimer.current = setTimeout(() => {
      resyncTimer.current = null;
      loadChats({ showLoading: false }).catch(() => undefined);
    }, 350);
  }, [loadChats]);

  useEffect(() => {
    return () => {
      if (resyncTimer.current) {
        clearTimeout(resyncTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeToEvents(event => {
      if (event.event === 'connection.authenticated') {
        scheduleResync();
        return;
      }

      if (event.event === 'message.created' && event.message) {
        const message = event.message;
        setChats(current => applyCreatedMessageToChats(current, message, session?.user.id));
        scheduleResync();
        return;
      }

      if (event.event === 'message.read' && event.message) {
        const message = event.message;
        setChats(current =>
          applyReadMessageToChats(current, message, event.readerId, session?.user.id),
        );
        return;
      }

      if (event.event === 'presence.status' && event.userId) {
        setChats(current =>
          current.map(chat => {
            const peer = chat.peer;
            if (!peer || peer.id !== event.userId) {
              return chat;
            }

            return {
              ...chat,
              peer: {
                ...peer,
                is_online: event.isOnline ?? peer.is_online,
                last_seen_at:
                  event.lastSeenAt === undefined ? peer.last_seen_at : event.lastSeenAt,
              },
            };
          }),
        );
        return;
      }

      if (event.event.startsWith('message.')) {
        scheduleResync();
      }
    });
  }, [scheduleResync, session?.user.id, subscribeToEvents]);

  function openChat(chat: Chat): void {
    navigation.navigate('Chat', { chatId: chat.id, title: chatTitle(chat, copy) });
  }

  function renderChat({ item }: { item: Chat }) {
    const title = chatTitle(item, copy);
    const preview = chatPreview(item.last_message, session?.user.id, copy);

    return (
      <Pressable
        accessibilityHint={preview}
        accessibilityLabel={title}
        accessibilityRole="button"
        onPress={() => openChat(item)}
        style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
      >
        <View accessibilityElementsHidden style={styles.avatar}>
          <Text style={styles.avatarLabel}>{title.slice(0, 1).toUpperCase()}</Text>
          {item.peer?.is_online ? <View style={styles.onlineDot} /> : null}
        </View>
        <View style={styles.chatCopy}>
          <View style={styles.chatHeading}>
            <Text numberOfLines={1} style={styles.chatTitle}>{title}</Text>
            {item.last_message ? (
              <Text style={styles.chatTime}>
                {formatConversationTime(item.last_message.created_at, language)}
              </Text>
            ) : null}
          </View>
          <View style={styles.chatPreviewRow}>
            <Text numberOfLines={1} style={styles.chatPreview}>{preview}</Text>
            {item.unread_count > 0 ? (
              <View accessibilityLabel={`${item.unread_count}`} style={styles.unreadBadge}>
                <Text style={styles.unreadLabel}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <AppScreen scroll={false} contentStyle={styles.content}>
      {chats.map(chat => <ChatSubscription chatId={chat.id} key={chat.id} />)}
      <View style={styles.heading}>
        <View>
          <Text style={sharedStyles.eyebrow}>AraChat</Text>
          <Text style={sharedStyles.title}>{t('chats')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('chatsRetry')}
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => {
            loadChats().catch(() => undefined);
          }}
          style={({ pressed }) => [styles.refreshButton, pressed && !isLoading && styles.refreshButtonPressed]}
        >
          <Text style={styles.refreshLabel}>↻</Text>
        </Pressable>
      </View>

      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              loadChats().catch(() => undefined);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryLabel}>{t('chatsRetry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading && chats.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingLabel}>{t('chatsLoading')}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={chats.length === 0 ? styles.emptyList : styles.list}
          data={chats}
          keyExtractor={chat => chat.id}
          ListEmptyComponent={
            !error ? (
              <EmptyState description={t('chatsEmptyDescription')} title={t('chatsEmptyTitle')} />
            ) : undefined
          }
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={() => {
                loadChats().catch(() => undefined);
              }}
              refreshing={isLoading}
              tintColor={colors.primary}
            />
          }
          renderItem={renderChat}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  refreshButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  refreshButtonPressed: {
    backgroundColor: colors.glassStrong,
  },
  refreshLabel: {
    color: colors.primary,
    fontSize: 25,
    fontWeight: '500',
    lineHeight: 28,
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
  list: {
    paddingBottom: spacing.md,
  },
  emptyList: {
    flex: 1,
  },
  chatRow: {
    alignItems: 'center',
    borderBottomColor: colors.glassBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 76,
    paddingVertical: spacing.sm,
  },
  chatRowPressed: {
    opacity: 0.72,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    width: 48,
  },
  avatarLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  onlineDot: {
    backgroundColor: colors.success,
    borderColor: colors.canvas,
    borderRadius: 6,
    borderWidth: 2,
    bottom: -1,
    height: 12,
    position: 'absolute',
    right: -1,
    width: 12,
  },
  chatCopy: {
    flex: 1,
    gap: 3,
  },
  chatHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chatTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  chatTime: {
    color: colors.textFaint,
    fontSize: 12,
  },
  chatPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chatPreview: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 16,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 12,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadLabel: {
    color: colors.canvas,
    fontSize: 12,
    fontWeight: '800',
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
    minHeight: 40,
    justifyContent: 'center',
  },
  retryLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
