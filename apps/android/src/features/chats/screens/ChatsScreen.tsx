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
import { ChatAvatar } from '../components/ChatAvatar';
import { EmptyState } from '../../../ui/EmptyState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { useAppUpdate } from '../../settings/AppUpdateProvider';

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
  const { dismissBanner, isBannerDismissed, isUpdateAvailable, release } = useAppUpdate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy: ChatPresentationCopy = {
    attachment: t('chatsAttachment'),
    call: t('call'),
    directChat: t('chatsDirectFallback'),
    file: t('chatFile'),
    noMessages: t('noMessages'),
    photo: t('chatPhoto'),
    savedMessages: t('chatsSavedMessages'),
    youPrefix: t('youPrefix'),
    video: t('chatVideo'),
    videoNote: t('chatVideoNote'),
    voice: t('chatVoice'),
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
    navigation.navigate('Chat', {
      chatId: chat.id,
      title: chatTitle(chat, copy),
      peerUserId: chat.type === 'direct' ? chat.peer?.id : undefined,
      peerIsOnline: chat.type === 'direct' ? chat.peer?.is_online : undefined,
      peerLastSeenAt: chat.type === 'direct' ? chat.peer?.last_seen_at : undefined,
    });
  }

  function openNewChat(): void {
    navigation.navigate('MainTabs', { params: { mode: undefined }, screen: 'Search' });
  }

  function renderChat({ item }: { item: Chat }) {
    const title = chatTitle(item, copy);
    const preview = chatPreview(item.last_message, session?.user.id, copy);
    const avatarType = item.type === 'saved' ? session?.user.avatarType : item.peer?.avatar_type;
    const avatarRef = item.type === 'saved' ? session?.user.avatarRef : item.peer?.avatar_ref;

    return (
      <Pressable
        accessibilityHint={preview}
        accessibilityLabel={title}
        accessibilityRole="button"
        onPress={() => openChat(item)}
        style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
        >
        <ChatAvatar
          avatarRef={avatarRef}
          avatarType={avatarType}
          isOnline={item.type === 'direct' && item.peer?.is_online}
          label={title}
          size="regular"
        />
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
          <IconButton
            accessibilityLabel={t('chatsRetry')}
            disabled={isLoading}
            icon="refresh"
            onPress={() => {
              loadChats().catch(() => undefined);
            }}
          />
      </View>

      {isUpdateAvailable && release && !isBannerDismissed ? (
        <Pressable
          accessibilityHint={t('appUpdateOpenCenterHint')}
          accessibilityLabel={`${t('appUpdateAvailable')}: ${release.latestVersionName}`}
          accessibilityRole="button"
          onPress={() => navigation.navigate('AppUpdate')}
          style={({ pressed }) => [sharedStyles.elevatedCard, styles.updateBanner, pressed && styles.updateBannerPressed]}
          testID="app-update-banner"
        >
          <Icon color={colors.accent} name="download" size={22} />
          <View style={styles.updateBannerCopy}>
            <Text numberOfLines={1} style={styles.updateBannerTitle}>{t('appUpdateAvailable')}</Text>
            <Text numberOfLines={1} style={styles.updateBannerDescription}>
              {t('appUpdateBannerDescription')} {release.latestVersionName}
            </Text>
          </View>
          <IconButton
            accessibilityLabel={t('appUpdateDismissBanner')}
            icon="close"
            onPress={event => {
              event.stopPropagation();
              dismissBanner();
            }}
            size={48}
          />
        </Pressable>
      ) : null}

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
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingLabel}>{t('chatsLoading')}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={chats.length === 0 ? styles.emptyList : styles.list}
          data={chats}
          keyExtractor={chat => chat.id}
          ListEmptyComponent={
            error ? undefined : <EmptyState description={t('chatsEmptyDescription')} title={t('chatsEmptyTitle')} />
          }
          refreshControl={
            <RefreshControl
              colors={[colors.accent]}
              onRefresh={() => {
                loadChats().catch(() => undefined);
              }}
              refreshing={isLoading}
              tintColor={colors.accent}
            />
          }
          renderItem={renderChat}
          showsVerticalScrollIndicator={false}
        />
      )}
      <Pressable
        accessibilityLabel={t('newChat')}
        accessibilityRole="button"
        onPress={openNewChat}
        style={({ pressed }) => [styles.newChatButton, pressed && styles.newChatButtonPressed]}
      >
        <Icon color={colors.onAccent} name="compose" size={20} />
        <Text style={styles.newChatLabel}>{t('newChat')}</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.lg,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  updateBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingLeft: spacing.md,
  },
  updateBannerPressed: {
    backgroundColor: colors.surfacePressed,
  },
  updateBannerCopy: {
    flex: 1,
    gap: 2,
  },
  updateBannerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  updateBannerDescription: {
    color: colors.textMuted,
    fontSize: 13,
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
    gap: spacing.xs,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xs,
  },
  emptyList: {
    flex: 1,
  },
  chatRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 84,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chatRowPressed: {
    backgroundColor: colors.surfacePressed,
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
    backgroundColor: colors.accent,
    borderRadius: 11,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadLabel: {
    color: colors.onAccent,
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
    minHeight: 48,
    justifyContent: 'center',
  },
  retryLabel: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  newChatButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderRadius: 24,
    borderWidth: 1,
    bottom: spacing.md,
    elevation: 5,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  newChatButtonPressed: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
  },
  newChatLabel: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '800',
  },
});
