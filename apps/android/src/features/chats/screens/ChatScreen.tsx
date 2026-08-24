import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useRealtime } from '../../realtime/RealtimeProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';

export interface ChatRouteParams {
  chatId: string;
  title: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢'] as const;

export function ChatScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { session } = useSession();
  const { subscribeToChat, subscribeToEvents } = useRealtime();
  const messageList = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

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
        return;
      }

      if (event.chatId !== route.params.chatId || !event.message) {
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
  }, [loadMessages, route.params.chatId, session?.user.id, subscribeToEvents]);

  async function handleSend(): Promise<void> {
    const messageText = text.trim();

    if (!messageText || isSending) {
      return;
    }

    setError('');
    setIsSending(true);
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

  function renderMessage({ item }: { item: ChatMessage }) {
    const isOwn = item.sender_id === session?.user.id;
    const messageText = item.deleted_at ? t('messageDeleted') : item.payload;
    const reactions = item.reactions ?? [];

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
              {isOwn && item.delivery_status === 'read' ? (
                <Text
                  style={[styles.messageMetaText, styles.messageMetaTextOwn]}
                >
                  {t('messageRead')}
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
          <Pressable
            accessibilityLabel={t('backToChats')}
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>{t('back')}</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.title}>
            {route.params.title}
          </Text>
          <Pressable
            accessibilityLabel={t('call')}
            accessibilityRole="button"
            onPress={() => Alert.alert(t('callsSoon'))}
            style={styles.callButton}
          >
            <Text style={styles.callLabel}>{t('call')}</Text>
          </Pressable>
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

        <View style={[sharedStyles.glassCard, styles.composer]}>
          <TextInput
            accessibilityLabel={t('messageInputPlaceholder')}
            editable={!isSending}
            multiline
            onChangeText={setText}
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
            <Text style={styles.sendLabel}>{isSending ? '…' : '↑'}</Text>
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
              style={[sharedStyles.glassCard, styles.sheet]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>
                  {isEditing ? t('editMessageTitle') : t('messageActions')}
                </Text>
                <Pressable
                  accessibilityLabel={t('closeMessageActions')}
                  accessibilityRole="button"
                  disabled={Boolean(pendingAction)}
                  onPress={closeMessageActions}
                  style={({ pressed }) => [
                    styles.closeSheetButton,
                    pressed && styles.actionButtonPressed,
                  ]}
                >
                  <Text style={styles.closeSheetLabel}>×</Text>
                </Pressable>
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
                            styles.actionButtonPressed,
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
  backButton: {
    justifyContent: 'center',
    minHeight: 48,
  },
  backLabel: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  callButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  callLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: colors.canvasMuted,
    borderBottomLeftRadius: 4,
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
    minHeight: 28,
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
    opacity: 0.74,
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
    minHeight: 36,
    justifyContent: 'center',
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
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(67, 182, 255, 0.28)',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendLabel: {
    color: colors.canvas,
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 25,
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
    backgroundColor: colors.canvasMuted,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
  closeSheetButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeSheetLabel: {
    color: colors.textMuted,
    fontSize: 28,
    lineHeight: 30,
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
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  reactionPickerButtonSelected: {
    backgroundColor: 'rgba(67, 182, 255, 0.24)',
    borderColor: colors.primary,
  },
  reactionPickerButtonPressed: {
    opacity: 0.74,
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
    backgroundColor: 'rgba(67, 182, 255, 0.28)',
  },
  actionButtonPressed: {
    opacity: 0.74,
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
