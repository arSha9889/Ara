import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import {
  deleteMessage,
  editTextMessage,
  getMessages,
  markMessagesRead,
  sendTextMessage,
  toggleMessageReaction,
  type ChatMessage,
} from '../api/chatApi';
import { mergeChatMessages, upsertChatMessage } from '../messageState';
import { useI18n } from '../../../localization/I18nProvider';
import { useDirectCall } from '../../calls/DirectCallProvider';
import { useRealtime } from '../../realtime/RealtimeProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { ReportUserSheet } from '../../safety/components/ReportUserSheet';
import { blockUser } from '../../safety/api/safetyApi';

export interface ChatRouteParams {
  chatId: string;
  title: string;
  peerUserId?: string;
  peerIsOnline?: boolean;
  peerLastSeenAt?: string | null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢'] as const;
const PEER_TYPING_EXPIRY_MS = 6_000;
const TYPING_EVENT_REFRESH_MS = 3_000;

interface PeerPresence {
  isOnline: boolean;
  lastSeenAt: string | null;
}

export function ChatScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { session } = useSession();
  const { call, startCall } = useDirectCall();
  const { send, subscribeToChat, subscribeToEvents } = useRealtime();
  const messageList = useRef<FlatList<ChatMessage>>(null);
  const typingExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSentTypingRef = useRef(false);
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const statusTranslateY = useRef(new Animated.Value(0)).current;
  const typingDotValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isSafetyActionsVisible, setIsSafetyActionsVisible] = useState(false);
  const [isReportVisible, setIsReportVisible] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PeerPresence>(() => ({
    isOnline: Boolean(route.params.peerIsOnline),
    lastSeenAt: route.params.peerLastSeenAt ?? null,
  }));
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const stopTyping = useCallback((): void => {
    if (typingRefreshTimer.current) {
      clearInterval(typingRefreshTimer.current);
      typingRefreshTimer.current = null;
    }
    if (hasSentTypingRef.current && route.params.peerUserId) {
      send({ event: 'typing.stopped', chat_id: route.params.chatId });
    }
    hasSentTypingRef.current = false;
  }, [route.params.chatId, route.params.peerUserId, send]);

  const startTyping = useCallback((): void => {
    if (!route.params.peerUserId || typingRefreshTimer.current) {
      return;
    }

    const sendStarted = (): boolean => {
      if (send({ event: 'typing.started', chat_id: route.params.chatId })) {
        hasSentTypingRef.current = true;
        return true;
      }
      return false;
    };

    if (!sendStarted()) {
      return;
    }
    typingRefreshTimer.current = setInterval(() => {
      if (sendStarted()) {
        return;
      }
      if (typingRefreshTimer.current) {
        clearInterval(typingRefreshTimer.current);
        typingRefreshTimer.current = null;
      }
      hasSentTypingRef.current = false;
    }, TYPING_EVENT_REFRESH_MS);
  }, [route.params.chatId, route.params.peerUserId, send]);

  const updatePeerTyping = useCallback((isTyping: boolean): void => {
    if (typingExpiryTimer.current) {
      clearTimeout(typingExpiryTimer.current);
      typingExpiryTimer.current = null;
    }

    setIsPeerTyping(isTyping);
    if (isTyping) {
      typingExpiryTimer.current = setTimeout(() => {
        setIsPeerTyping(false);
        typingExpiryTimer.current = null;
      }, PEER_TYPING_EXPIRY_MS);
    }
  }, []);

  const peerStatus = isPeerTyping
    ? t('chatTyping')
    : peerPresence.isOnline
      ? t('chatOnline')
      : t('chatLastSeenRecently');

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (active) {
          setReduceMotion(value);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      statusOpacity.setValue(1);
      statusTranslateY.setValue(0);
      return;
    }

    statusOpacity.setValue(0);
    statusTranslateY.setValue(-4);
    Animated.parallel([
      Animated.timing(statusOpacity, {
        duration: 180,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(statusTranslateY, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [peerStatus, reduceMotion, statusOpacity, statusTranslateY]);

  useEffect(() => {
    if (!isPeerTyping || reduceMotion) {
      typingDotValues.forEach(value => value.setValue(0));
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.stagger(
          110,
          typingDotValues.map(value =>
            Animated.sequence([
              Animated.timing(value, {
                duration: 180,
                toValue: 1,
                useNativeDriver: true,
              }),
              Animated.timing(value, {
                duration: 180,
                toValue: 0,
                useNativeDriver: true,
              }),
            ]),
          ),
        ),
        Animated.delay(160),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
      typingDotValues.forEach(value => value.setValue(0));
    };
  }, [isPeerTyping, reduceMotion, typingDotValues]);

  useEffect(() => {
    setPeerPresence({
      isOnline: Boolean(route.params.peerIsOnline),
      lastSeenAt: route.params.peerLastSeenAt ?? null,
    });
    updatePeerTyping(false);
  }, [
    route.params.chatId,
    route.params.peerIsOnline,
    route.params.peerLastSeenAt,
    updatePeerTyping,
  ]);

  useFocusEffect(
    useCallback(() => stopTyping, [stopTyping]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        stopTyping();
      }
    });

    return () => subscription.remove();
  }, [stopTyping]);

  useEffect(() => () => {
    stopTyping();
    updatePeerTyping(false);
  }, [stopTyping, updatePeerTyping]);

  const loadMessages = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (showLoading) {
        setError('');
        setIsLoading(true);
      }

      try {
        const nextMessages = await getMessages(route.params.chatId);
        setMessages(current => mergeChatMessages(current, nextMessages));
        setActionMessage(current =>
          current
            ? nextMessages.find(message => message.id === current.id) ?? current
            : current,
        );

        const unreadIds = nextMessages
          .filter(
            message =>
              !message.deleted_at && message.sender_id !== session?.user.id,
          )
          .map(message => message.id);

        if (unreadIds.length > 0) {
          markMessagesRead(route.params.chatId, unreadIds).catch(
            () => undefined,
          );
        }
      } catch (nextError) {
        setError(t(authErrorKey(nextError)));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [route.params.chatId, session?.user.id, t],
  );

  useEffect(() => {
    loadMessages().catch(() => undefined);
  }, [loadMessages]);

  useEffect(
    () => subscribeToChat(route.params.chatId),
    [route.params.chatId, subscribeToChat],
  );

  useEffect(() => {
    return subscribeToEvents(event => {
      if (event.event === 'connection.authenticated') {
        loadMessages({ showLoading: false }).catch(() => undefined);
        if (text.trim()) {
          startTyping();
        }
        return;
      }

      if (event.chatId !== route.params.chatId) {
        return;
      }

      if (
        route.params.peerUserId &&
        event.userId === route.params.peerUserId &&
        event.event === 'presence.status'
      ) {
        setPeerPresence(current => ({
          isOnline: event.isOnline ?? current.isOnline,
          lastSeenAt: event.lastSeenAt === undefined ? current.lastSeenAt : event.lastSeenAt,
        }));
        return;
      }

      if (
        route.params.peerUserId &&
        event.userId === route.params.peerUserId &&
        event.event === 'typing.started'
      ) {
        updatePeerTyping(true);
        return;
      }

      if (
        route.params.peerUserId &&
        event.userId === route.params.peerUserId &&
        event.event === 'typing.stopped'
      ) {
        updatePeerTyping(false);
        return;
      }

      if (!event.message) {
        return;
      }

      const message = event.message;
      if (event.event === 'message.reactions_updated') {
        // The server summarizes `reacted_by_me` for the actor who changed the reaction.
        // Reloading keeps that flag correct for every connected participant.
        loadMessages({ showLoading: false }).catch(() => undefined);
        return;
      }

      if (
        event.event === 'message.created' ||
        event.event === 'message.updated' ||
        event.event === 'message.deleted'
      ) {
        setMessages(current => upsertChatMessage(current, message));
        setActionMessage(current =>
          current?.id === message.id
            ? event.event === 'message.deleted'
              ? null
              : message
            : current,
        );

        if (
          event.event === 'message.created' &&
          message.sender_id !== session?.user.id
        ) {
          markMessagesRead(route.params.chatId, [message.id]).catch(
            () => undefined,
          );
        }
        return;
      }

      if (event.event === 'message.read') {
        const nextMessage =
          message.sender_id === session?.user.id &&
          event.readerId !== session?.user.id
            ? { ...message, delivery_status: 'read' }
            : message;

        setMessages(current =>
          current.map(currentMessage => {
            if (currentMessage.id !== message.id) {
              return currentMessage;
            }

            return nextMessage;
          }),
        );
        setActionMessage(current =>
          current?.id === message.id ? nextMessage : current,
        );
      }
    });
  }, [
    loadMessages,
    route.params.chatId,
    route.params.peerUserId,
    session?.user.id,
    startTyping,
    subscribeToEvents,
    text,
    updatePeerTyping,
  ]);

  async function handleSend(): Promise<void> {
    const messageText = text.trim();

    if (!messageText || isSending) {
      return;
    }

    setError('');
    setIsSending(true);
    stopTyping();
    try {
      const message = await sendTextMessage(route.params.chatId, messageText);
      setMessages(current => upsertChatMessage(current, message));
      setText('');
      requestAnimationFrame(() =>
        messageList.current?.scrollToEnd({ animated: true }),
      );
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSending(false);
    }
  }

  function openMessageActions(message: ChatMessage): void {
    if (message.deleted_at) {
      return;
    }

    setError('');
    setActionMessage(message);
    setEditText(message.payload);
    setIsEditing(false);
  }

  function closeMessageActions(): void {
    if (pendingAction) {
      return;
    }

    setActionMessage(null);
    setEditText('');
    setIsEditing(false);
  }

  async function handleReaction(
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const actionId = `reaction:${messageId}:${emoji}`;
    if (pendingAction) {
      return;
    }

    setError('');
    setPendingAction(actionId);
    try {
      const message = await toggleMessageReaction(
        route.params.chatId,
        messageId,
        emoji,
      );
      setMessages(current => upsertChatMessage(current, message));
      setActionMessage(current =>
        current?.id === message.id ? message : current,
      );
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleEdit(): Promise<void> {
    if (!actionMessage || !editText.trim() || pendingAction) {
      return;
    }

    const actionId = `edit:${actionMessage.id}`;
    setError('');
    setPendingAction(actionId);
    try {
      const message = await editTextMessage(
        route.params.chatId,
        actionMessage.id,
        editText,
      );
      setMessages(current => upsertChatMessage(current, message));
      setActionMessage(null);
      setEditText('');
      setIsEditing(false);
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(messageId: string): Promise<void> {
    const actionId = `delete:${messageId}`;
    if (pendingAction) {
      return;
    }

    setError('');
    setPendingAction(actionId);
    try {
      const message = await deleteMessage(route.params.chatId, messageId);
      setMessages(current => upsertChatMessage(current, message));
      setActionMessage(null);
      setEditText('');
      setIsEditing(false);
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction(null);
    }
  }

  function confirmDelete(message: ChatMessage): void {
    Alert.alert(t('deleteMessage'), t('deleteMessageConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteMessage'),
        style: 'destructive',
        onPress: () => {
          handleDelete(message.id).catch(() => undefined);
        },
      },
    ]);
  }

  function confirmBlockUser(): void {
    if (!route.params.peerUserId || isBlocking) {
      return;
    }

    setIsSafetyActionsVisible(false);
    Alert.alert(t('blockUser'), t('blockUserConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('blockUser'),
        style: 'destructive',
        onPress: () => {
          blockChatPeer().catch(() => undefined);
        },
      },
    ]);
  }

  async function blockChatPeer(): Promise<void> {
    if (!route.params.peerUserId || isBlocking) {
      return;
    }

    setError('');
    setIsBlocking(true);
    try {
      await blockUser(route.params.peerUserId);
      navigation.goBack();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsBlocking(false);
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isOwn = item.sender_id === session?.user.id;
    const messageText = item.deleted_at ? t('messageDeleted') : item.payload;
    const reactions = item.reactions ?? [];
    const delivery = isOwn ? deliveryPresentation(item.delivery_status, t) : null;

    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        <View style={styles.messageContent}>
          <Pressable
            accessibilityHint={
              !item.deleted_at ? t('messageActions') : undefined
            }
            accessibilityLabel={messageText}
            accessibilityRole={!item.deleted_at ? 'button' : undefined}
            delayLongPress={350}
            disabled={Boolean(item.deleted_at)}
            onLongPress={() => openMessageActions(item)}
            style={({ pressed }) => [
              styles.messageBubble,
              isOwn ? styles.messageBubbleOwn : styles.messageBubblePeer,
              pressed && !item.deleted_at && styles.messageBubblePressed,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.deleted_at && styles.deletedMessageText,
              ]}
            >
              {messageText}
            </Text>
            <View style={styles.messageMeta}>
              {item.edited_at ? (
                <Text
                  style={[
                    styles.messageMetaText,
                    isOwn && styles.messageMetaTextOwn,
                  ]}
                >
                  {t('messageEdited')}
                </Text>
              ) : null}
              {delivery ? (
                <Text
                  accessibilityLabel={delivery.label}
                  style={[
                    styles.messageMetaText,
                    styles.messageMetaTextOwn,
                    delivery.isRead && styles.messageDeliveryRead,
                  ]}
                >
                  {delivery.symbol}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.messageMetaText,
                  isOwn && styles.messageMetaTextOwn,
                ]}
              >
                {formatMessageTime(item.created_at, language)}
              </Text>
            </View>
          </Pressable>
          {!item.deleted_at && reactions.length > 0 ? (
            <View style={[styles.reactionRow, isOwn && styles.reactionRowOwn]}>
              {reactions.map(reaction => {
                const actionId = `reaction:${item.id}:${reaction.emoji}`;
                return (
                  <Pressable
                    accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
                    accessibilityRole="button"
                    disabled={Boolean(pendingAction)}
                    key={reaction.emoji}
                    onPress={() => {
                      handleReaction(item.id, reaction.emoji).catch(
                        () => undefined,
                      );
                    }}
                    style={({ pressed }) => [
                      styles.reactionChip,
                      reaction.reacted_by_me && styles.reactionChipSelected,
                      pendingAction === actionId && styles.reactionChipPending,
                      pressed && !pendingAction && styles.reactionChipPressed,
                    ]}
                  >
                    <Text style={styles.reactionLabel}>
                      {reaction.emoji} {reaction.count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.keyboardAvoidingView}
    >
      <AppScreen scroll={false} contentStyle={styles.content}>
        <View style={styles.header}>
          <IconButton
            accessibilityLabel={t('backToChats')}
            icon="back"
            onPress={() => navigation.goBack()}
          />
          <View style={styles.headerTitleBlock}>
            <Text numberOfLines={1} style={styles.title}>
              {route.params.title}
            </Text>
            {route.params.peerUserId ? (
              <Animated.View
                accessibilityLabel={peerStatus}
                style={[
                  styles.peerStatus,
                  {
                    opacity: statusOpacity,
                    transform: [{ translateY: statusTranslateY }],
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.peerStatusLabel, isPeerTyping && styles.peerStatusTyping]}
                >
                  {peerStatus}
                </Text>
                {isPeerTyping ? (
                  <View accessibilityElementsHidden style={styles.typingDots}>
                    {typingDotValues.map((value, index) => (
                      <Animated.View
                        key={index}
                        style={[
                          styles.typingDot,
                          {
                            opacity: value.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.42, 1],
                            }),
                            transform: [
                              {
                                translateY: value.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, -2],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    ))}
                  </View>
                ) : null}
              </Animated.View>
            ) : null}
          </View>
          <IconButton
            accessibilityLabel={t('callAudio')}
            disabled={!route.params.peerUserId || Boolean(call)}
            icon="call"
            onPress={() => {
              if (!route.params.peerUserId) {
                return;
              }
              startCall({
                chatId: route.params.chatId,
                peerName: route.params.title,
                peerUserId: route.params.peerUserId,
              }).catch(() => undefined);
            }}
          />
          {route.params.peerUserId ? (
            <IconButton
              accessibilityLabel={t('safetyActions')}
              disabled={isBlocking}
              icon="more"
              onPress={() => setIsSafetyActionsVisible(true)}
            />
          ) : null}
        </View>

        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingLabel}>{t('messagesLoading')}</Text>
          </View>
        ) : (
          <FlatList
            ref={messageList}
            contentContainerStyle={
              messages.length === 0 ? styles.emptyMessages : styles.messagesList
            }
            data={messages}
            keyExtractor={message => message.id}
            ListEmptyComponent={
              !error ? (
                <EmptyState
                  description={t('messagesEmptyDescription')}
                  title={t('messagesEmptyTitle')}
                />
              ) : undefined
            }
            onContentSizeChange={() =>
              messageList.current?.scrollToEnd({ animated: false })
            }
            renderItem={renderMessage}
            showsVerticalScrollIndicator={false}
          />
        )}

        {error ? (
          <View
            accessibilityRole="alert"
            style={[sharedStyles.glassCard, styles.errorCard]}
          >
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                loadMessages().catch(() => undefined);
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>{t('messagesRetry')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[sharedStyles.glassPanel, styles.composer]}>
          <TextInput
            accessibilityLabel={t('messageInputPlaceholder')}
            editable={!isSending}
            multiline
            onBlur={stopTyping}
            onFocus={() => {
              if (text.trim()) {
                startTyping();
              }
            }}
            onChangeText={nextText => {
              setText(nextText);
              if (nextText.trim()) {
                startTyping();
              } else {
                stopTyping();
              }
            }}
            placeholder={t('messageInputPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={styles.composerInput}
            value={text}
          />
          <Pressable
            accessibilityLabel={
              isSending ? t('sendingMessage') : t('sendMessage')
            }
            accessibilityRole="button"
            disabled={!text.trim() || isSending}
            onPress={() => {
              handleSend().catch(() => undefined);
            }}
            style={({ pressed }) => [
              styles.sendButton,
              (!text.trim() || isSending) && styles.sendButtonDisabled,
              pressed && text.trim() && !isSending && styles.sendButtonPressed,
            ]}
          >
            {isSending ? <ActivityIndicator color={colors.canvas} size="small" /> : <Icon color={colors.canvas} name="send" size={20} />}
          </Pressable>
        </View>
      </AppScreen>

      <Modal
        animationType="slide"
        onRequestClose={closeMessageActions}
        transparent
        visible={Boolean(actionMessage)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel={t('closeMessageActions')}
            accessibilityRole="button"
            disabled={Boolean(pendingAction)}
            onPress={closeMessageActions}
            style={styles.sheetBackdrop}
          />
          {actionMessage ? (
            <View
              accessibilityViewIsModal
              style={[sharedStyles.glassPanel, styles.sheet]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>
                  {isEditing ? t('editMessageTitle') : t('messageActions')}
                </Text>
                <IconButton
                  accessibilityLabel={t('closeMessageActions')}
                  disabled={Boolean(pendingAction)}
                  icon="close"
                  onPress={closeMessageActions}
                />
              </View>
              <Text numberOfLines={2} style={styles.sheetMessagePreview}>
                {actionMessage.payload}
              </Text>

              <Text style={styles.reactionPickerTitle}>
                {t('messageReactions')}
              </Text>
              <View style={styles.reactionPicker}>
                {REACTION_EMOJIS.map(emoji => {
                  const actionId = `reaction:${actionMessage.id}:${emoji}`;
                  const reactedByMe = actionMessage.reactions.some(
                    reaction =>
                      reaction.emoji === emoji && reaction.reacted_by_me,
                  );

                  return (
                    <Pressable
                      accessibilityLabel={emoji}
                      accessibilityRole="button"
                      disabled={Boolean(pendingAction)}
                      key={emoji}
                      onPress={() => {
                        handleReaction(actionMessage.id, emoji).catch(
                          () => undefined,
                        );
                      }}
                      style={({ pressed }) => [
                        styles.reactionPickerButton,
                        reactedByMe && styles.reactionPickerButtonSelected,
                        pendingAction === actionId &&
                          styles.reactionChipPending,
                        pressed &&
                          !pendingAction &&
                          styles.reactionPickerButtonPressed,
                      ]}
                    >
                      <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {actionMessage.sender_id === session?.user.id ? (
                isEditing ? (
                  <View style={styles.editForm}>
                    <TextInput
                      accessibilityLabel={t('editMessagePlaceholder')}
                      autoFocus
                      editable={!pendingAction}
                      multiline
                      onChangeText={setEditText}
                      placeholder={t('editMessagePlaceholder')}
                      placeholderTextColor={colors.textFaint}
                      style={styles.editInput}
                      value={editText}
                    />
                    <View style={styles.editActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(pendingAction)}
                        onPress={() => {
                          setEditText(actionMessage.payload);
                          setIsEditing(false);
                        }}
                        style={({ pressed }) => [
                          styles.secondaryActionButton,
                          pressed && styles.actionButtonPressed,
                        ]}
                      >
                        <Text style={styles.secondaryActionLabel}>
                          {t('cancel')}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={
                          pendingAction ? t('savingMessage') : t('saveMessage')
                        }
                        accessibilityRole="button"
                        disabled={!editText.trim() || Boolean(pendingAction)}
                        onPress={() => {
                          handleEdit().catch(() => undefined);
                        }}
                        style={({ pressed }) => [
                          styles.primaryActionButton,
                          (!editText.trim() || pendingAction) &&
                            styles.primaryActionButtonDisabled,
                          pressed &&
                            editText.trim() &&
                            !pendingAction &&
                            styles.primaryActionButtonPressed,
                        ]}
                      >
                        <Text style={styles.primaryActionLabel}>
                          {pendingAction
                            ? t('savingMessage')
                            : t('saveMessage')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.messageActions}>
                    {actionMessage.type === 'text' ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(pendingAction)}
                        onPress={() => setIsEditing(true)}
                        style={({ pressed }) => [
                          styles.secondaryActionButton,
                          pressed && styles.actionButtonPressed,
                        ]}
                      >
                        <Text style={styles.secondaryActionLabel}>
                          {t('editMessage')}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(pendingAction)}
                      onPress={() => confirmDelete(actionMessage)}
                      style={({ pressed }) => [
                        styles.secondaryActionButton,
                        styles.deleteActionButton,
                        pressed && styles.actionButtonPressed,
                      ]}
                    >
                      <Text style={styles.deleteActionLabel}>
                        {t('deleteMessage')}
                      </Text>
                    </Pressable>
                  </View>
                )
              ) : null}

              {error ? (
                <Text accessibilityRole="alert" style={styles.sheetError}>
                  {error}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsSafetyActionsVisible(false)}
        transparent
        visible={isSafetyActionsVisible}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel={t('closeSafetyActions')}
            accessibilityRole="button"
            disabled={isBlocking}
            onPress={() => setIsSafetyActionsVisible(false)}
            style={styles.sheetBackdrop}
          />
          <View accessibilityViewIsModal style={[sharedStyles.glassPanel, styles.safetySheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('safetyActions')}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={isBlocking}
              onPress={() => {
                setIsSafetyActionsVisible(false);
                setIsReportVisible(true);
              }}
              style={({ pressed }) => [styles.safetyActionButton, pressed && styles.actionButtonPressed]}
            >
              <Text style={styles.secondaryActionLabel}>{t('reportUser')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isBlocking}
              onPress={confirmBlockUser}
              style={({ pressed }) => [
                styles.safetyActionButton,
                styles.deleteActionButton,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.deleteActionLabel}>{isBlocking ? '…' : t('blockUser')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ReportUserSheet
        onClose={() => setIsReportVisible(false)}
        onSubmitted={() => Alert.alert(t('reportSubmitted'))}
        userId={route.params.peerUserId ?? null}
        visible={isReportVisible}
      />
    </KeyboardAvoidingView>
  );
}

function formatMessageTime(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function deliveryPresentation(
  status: string,
  t: (key: 'messageSent' | 'messageDelivered' | 'messageRead') => string,
): { isRead: boolean; label: string; symbol: string } {
  if (status === 'read') {
    return { isRead: true, label: t('messageRead'), symbol: '✓✓' };
  }
  if (status === 'delivered') {
    return { isRead: false, label: t('messageDelivered'), symbol: '✓✓' };
  }
  return { isRead: false, label: t('messageSent'), symbol: '✓' };
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  content: {
    paddingBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerTitleBlock: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  peerStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 2,
    maxWidth: '100%',
  },
  peerStatusLabel: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
  peerStatusTyping: {
    color: colors.primary,
    fontWeight: '600',
  },
  typingDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 16,
  },
  typingDot: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 4,
    width: 4,
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
  messagesList: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  emptyMessages: {
    flexGrow: 1,
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageContent: {
    alignItems: 'flex-start',
    maxWidth: '82%',
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  messageBubbleOwn: {
    backgroundColor: colors.primaryStrong,
    borderBottomRightRadius: 4,
  },
  messageBubblePeer: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageBubblePressed: {
    opacity: 0.76,
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  deletedMessageText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  messageMeta: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: 5,
    marginTop: 3,
  },
  messageMetaText: {
    color: colors.textFaint,
    fontSize: 11,
  },
  messageMetaTextOwn: {
    color: 'rgba(9, 18, 31, 0.68)',
  },
  messageDeliveryRead: {
    color: colors.canvas,
  },
  reactionRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionRowOwn: {
    alignSelf: 'flex-end',
  },
  reactionChip: {
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: spacing.xs,
  },
  reactionChipSelected: {
    backgroundColor: 'rgba(67, 182, 255, 0.24)',
    borderColor: colors.primary,
  },
  reactionChipPending: {
    opacity: 0.5,
  },
  reactionChipPressed: {
    backgroundColor: colors.surfacePressed,
  },
  reactionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  errorCard: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
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
    minWidth: 48,
  },
  retryLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  composer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.xs,
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(74, 168, 240, 0.32)',
  },
  sendButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.54)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: colors.glassStrong,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  safetySheet: {
    backgroundColor: colors.glassStrong,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.textFaint,
    borderRadius: 2,
    height: 4,
    marginBottom: spacing.md,
    opacity: 0.7,
    width: 40,
  },
  sheetHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  sheetMessagePreview: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  reactionPickerTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  reactionPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reactionPickerButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  reactionPickerButtonSelected: {
    backgroundColor: 'rgba(67, 182, 255, 0.24)',
    borderColor: colors.primary,
  },
  reactionPickerButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
  reactionPickerEmoji: {
    fontSize: 22,
  },
  messageActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  secondaryActionButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  safetyActionButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  primaryActionButtonDisabled: {
    backgroundColor: 'rgba(74, 168, 240, 0.32)',
  },
  primaryActionButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  actionButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
  secondaryActionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  primaryActionLabel: {
    color: colors.canvas,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteActionButton: {
    borderColor: 'rgba(255, 158, 175, 0.44)',
  },
  deleteActionLabel: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  editForm: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  editInput: {
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    minHeight: 96,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sheetError: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
  },
});
