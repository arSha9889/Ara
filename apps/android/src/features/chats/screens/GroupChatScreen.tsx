import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
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
import { ApiError } from '../../../infrastructure/http/apiClient';
import { useI18n } from '../../../localization/I18nProvider';
import { useRealtime } from '../../realtime/RealtimeProvider';
import { motion, radii, spacing, type AppColors } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { AnimatedBottomSheet } from '../../../ui/AnimatedBottomSheet';
import { AnimatedPhotoViewer } from '../../../ui/AnimatedPhotoViewer';
import { AraGlassSurface } from '../../../ui/AraGlassSurface';
import { EmptyState } from '../../../ui/EmptyState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import {
  deleteMessage,
  editTextMessage,
  getChat,
  getMessages,
  markMessagesRead,
  sendMediaMessage,
  sendTextMessage,
  toggleMessageReaction,
  togglePinMessage,
  uploadChatAttachment,
  type Chat,
  type ChatMessage,
  type ChatPreviewMessage,
} from '../api/chatApi';
import {
  attachmentLabel,
  groupLifecycleText,
  type AttachmentPresentationCopy,
  type ChatPresentationCopy,
} from '../chatPresentation';
import {
  ChatFileAttachment,
  ChatPhotoAttachment,
  ChatVideoAttachment,
  ChatVideoNoteAttachment,
  ChatVoiceAttachment,
} from '../components/ChatAttachmentContent';
import { ChatAvatar } from '../components/ChatAvatar';
import {
  discardChatAttachmentDraft,
  pickChatDocument,
  pickChatPhoto,
  pickChatVideo,
  type PickedChatAttachment,
} from '../media/mediaClient';
import { mergeChatMessages, upsertChatMessage } from '../messageState';

export interface GroupChatRouteParams {
  chatId: string;
  title: string;
  targetMessageId?: string;
  targetMessage?: ChatMessage;
}

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢'] as const;

interface PhotoViewerState {
  name: string;
  uri: string;
}

function messageTime(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function messagePreview(
  message: Pick<ChatPreviewMessage, 'payload' | 'type'>,
  copy: AttachmentPresentationCopy,
): string {
  return message.payload || attachmentLabel(message.type, copy);
}

function isGroupUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function GroupChatScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { colors, sharedStyles } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { session } = useSession();
  const { subscribeToChat, subscribeToEvents } = useRealtime();
  const messageList = useRef<FlatList<ChatMessage>>(null);
  const composerTransition = useRef(new Animated.Value(1)).current;
  const [group, setGroup] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPickingAttachment, setIsPickingAttachment] = useState(false);
  const [isAttachmentPickerVisible, setIsAttachmentPickerVisible] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<PickedChatAttachment | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<ChatPreviewMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const hasLostAccess = useRef(false);
  const composerMode = selectedAttachment
    ? 'attachment'
    : replyToMessage
      ? 'reply'
      : 'default';

  const attachmentCopy: AttachmentPresentationCopy = useMemo(
    () => ({
      attachment: t('chatsAttachment'),
      file: t('chatFile'),
      photo: t('chatPhoto'),
      video: t('chatVideo'),
      videoNote: t('chatVideoNote'),
      voice: t('chatVoice'),
    }),
    [t],
  );
  const presentationCopy: ChatPresentationCopy = useMemo(
    () => ({
      ...attachmentCopy,
      call: t('call'),
      directChat: t('chatsDirectFallback'),
      groupChat: t('groupChat'),
      groupCreated: t('groupCreated'),
      groupCreatedWithMembers: t('groupCreatedWithMembers'),
      groupLifecycleFallback: t('groupLifecycleFallback'),
      groupMemberAdded: t('groupMemberAdded'),
      groupMemberJoined: t('groupMemberJoined'),
      groupMemberLeft: t('groupMemberLeft'),
      groupMemberRemoved: t('groupMemberRemoved'),
      groupMemberRoleChanged: t('groupMemberRoleChanged'),
      groupOwnershipTransferred: t('groupOwnershipTransferred'),
      groupRoleAdmin: t('groupRoleAdmin'),
      groupRoleMember: t('groupRoleMember'),
      noMessages: t('noMessages'),
      savedMessages: t('chatsSavedMessages'),
      youPrefix: t('youPrefix'),
    }),
    [attachmentCopy, t],
  );

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) {
          setReduceMotion(enabled);
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
    composerTransition.stopAnimation();
    if (reduceMotion) {
      composerTransition.setValue(1);
      return;
    }

    composerTransition.setValue(0.96);
    Animated.timing(composerTransition, {
      duration: motion.standard,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [composerMode, composerTransition, reduceMotion]);

  const leaveUnavailableGroup = useCallback(() => {
    if (hasLostAccess.current) {
      return;
    }
    hasLostAccess.current = true;
    navigation.popToTop();
  }, [navigation]);

  const markUnreadMessagesRead = useCallback(
    (nextMessages: ChatMessage[]): void => {
      const unreadIds = nextMessages
        .filter(message => !message.deleted_at && message.sender_id !== session?.user.id)
        .map(message => message.id);
      if (unreadIds.length > 0) {
        markMessagesRead(route.params.chatId, unreadIds).catch(() => undefined);
      }
    },
    [route.params.chatId, session?.user.id],
  );

  const loadGroup = useCallback(async (): Promise<void> => {
    try {
      const nextGroup = await getChat(route.params.chatId);
      if (nextGroup.type !== 'group') {
        leaveUnavailableGroup();
        return;
      }
      setGroup(nextGroup);
      setPinnedMessage(nextGroup.pinned_message ?? null);
      if (nextGroup.title?.trim()) {
        navigation.setParams({ title: nextGroup.title.trim() });
      }
    } catch (nextError) {
      if (isGroupUnavailable(nextError)) {
        leaveUnavailableGroup();
        return;
      }
      setError(t(authErrorKey(nextError)));
    }
  }, [leaveUnavailableGroup, navigation, route.params.chatId, t]);

  const loadMessages = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}): Promise<void> => {
      if (showLoading) {
        setError('');
        setIsLoading(true);
      }
      try {
        const nextMessages = await getMessages(route.params.chatId);
        const targetMessage = route.params.targetMessage;
        const withTarget =
          targetMessage &&
          targetMessage.chat_id === route.params.chatId &&
          !targetMessage.deleted_at
            ? [...nextMessages, targetMessage]
            : nextMessages;
        setMessages(current => mergeChatMessages(current, withTarget));
        markUnreadMessagesRead(nextMessages);
      } catch (nextError) {
        if (isGroupUnavailable(nextError)) {
          leaveUnavailableGroup();
          return;
        }
        setError(t(authErrorKey(nextError)));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [leaveUnavailableGroup, markUnreadMessagesRead, route.params.chatId, route.params.targetMessage, t],
  );

  useEffect(() => {
    hasLostAccess.current = false;
    loadGroup().catch(() => undefined);
    loadMessages().catch(() => undefined);
  }, [loadGroup, loadMessages]);

  useEffect(() => subscribeToChat(route.params.chatId), [route.params.chatId, subscribeToChat]);

  useEffect(() => {
    return subscribeToEvents(event => {
      if (event.event === 'connection.authenticated') {
        loadGroup().catch(() => undefined);
        loadMessages({ showLoading: false }).catch(() => undefined);
        return;
      }
      if (event.chatId !== route.params.chatId) {
        return;
      }

      const isOwnAccessLoss =
        event.event === 'group.deleted' ||
        ((event.event === 'group.member_left' || event.event === 'group.member_removed') &&
          (event.memberUserId === session?.user.id || event.member?.user_id === session?.user.id));
      if (isOwnAccessLoss) {
        leaveUnavailableGroup();
        return;
      }

      if (event.event.startsWith('group.')) {
        if (event.chat) {
          setGroup(event.chat);
          setPinnedMessage(event.chat.pinned_message ?? null);
          if (event.chat.title?.trim()) {
            navigation.setParams({ title: event.chat.title.trim() });
          }
        }
        if (event.message) {
          setMessages(current => upsertChatMessage(current, event.message!));
          markUnreadMessagesRead([event.message]);
        }
        return;
      }

      if (event.event === 'message.pin_updated' && event.chat) {
        const pinnedMessageId = event.chat.pinned_message_id;
        setGroup(current => (current ? { ...current, ...event.chat } : event.chat!));
        setPinnedMessage(event.chat.pinned_message ?? null);
        setMessages(current =>
          current.map(message => ({ ...message, is_pinned: message.id === pinnedMessageId })),
        );
        return;
      }

      if (!event.message) {
        return;
      }

      if (event.event === 'message.reactions_updated') {
        loadMessages({ showLoading: false }).catch(() => undefined);
        return;
      }

      if (
        event.event === 'message.created' ||
        event.event === 'message.updated' ||
        event.event === 'message.deleted'
      ) {
        const message = event.message;
        setMessages(current => upsertChatMessage(current, message));
        setActionMessage(current =>
          current?.id === message.id
            ? event.event === 'message.deleted'
              ? null
              : message
            : current,
        );
        if (event.event === 'message.deleted') {
          setReplyToMessage(current => (current?.id === message.id ? null : current));
          setPinnedMessage(current => (current?.id === message.id ? null : current));
        }
        if (event.event === 'message.created') {
          markUnreadMessagesRead([message]);
        }
      }
    });
  }, [
    leaveUnavailableGroup,
    loadGroup,
    loadMessages,
    markUnreadMessagesRead,
    navigation,
    route.params.chatId,
    session?.user.id,
    subscribeToEvents,
  ]);

  useEffect(() => {
    const targetMessageId = route.params.targetMessageId;
    if (!targetMessageId) {
      return;
    }
    const index = messages.findIndex(message => message.id === targetMessageId);
    if (index < 0) {
      return;
    }
    setHighlightedMessageId(targetMessageId);
    requestAnimationFrame(() => messageList.current?.scrollToIndex({ animated: true, index }));
    const timer = setTimeout(() => setHighlightedMessageId(current => current === targetMessageId ? null : current), 4_000);
    return () => clearTimeout(timer);
  }, [messages, route.params.targetMessageId]);

  async function handleSend(): Promise<void> {
    if (!group?.can_post || isSending) {
      return;
    }
    const messageText = text.trim();
    if (!messageText && !selectedAttachment) {
      return;
    }

    setError('');
    setIsSending(true);
    try {
      const replyToMessageId = replyToMessage?.id;
      const message = selectedAttachment
        ? await sendMediaMessage(
            route.params.chatId,
            await uploadChatAttachment(selectedAttachment),
            messageText,
            { replyToMessageId },
          )
        : await sendTextMessage(route.params.chatId, messageText, { replyToMessageId });
      setMessages(current => upsertChatMessage(current, message));
      setText('');
      setReplyToMessage(null);
      if (selectedAttachment) {
        discardChatAttachmentDraft(selectedAttachment.uri).catch(() => undefined);
        setSelectedAttachment(null);
      }
      requestAnimationFrame(() => messageList.current?.scrollToEnd({ animated: true }));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSending(false);
    }
  }

  async function selectAttachment(
    picker: () => Promise<PickedChatAttachment | null>,
  ): Promise<void> {
    if (isPickingAttachment || isSending || !group?.can_post) {
      return;
    }
    setIsPickingAttachment(true);
    setError('');
    try {
      const attachment = await picker();
      if (attachment) {
        setSelectedAttachment(attachment);
      }
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsPickingAttachment(false);
      setIsAttachmentPickerVisible(false);
    }
  }

  function removeAttachment(): void {
    if (selectedAttachment) {
      discardChatAttachmentDraft(selectedAttachment.uri).catch(() => undefined);
    }
    setSelectedAttachment(null);
  }

  function openMessageActions(message: ChatMessage): void {
    if (message.deleted_at) {
      return;
    }
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

  function startReply(message: ChatMessage): void {
    if (message.deleted_at || pendingAction) {
      return;
    }
    setReplyToMessage(message);
    closeMessageActions();
  }

  async function handlePin(message: ChatMessage): Promise<void> {
    if (pendingAction) {
      return;
    }
    setPendingAction(`pin:${message.id}`);
    try {
      const nextGroup = await togglePinMessage(route.params.chatId, message.id);
      const pinnedMessageId = nextGroup.pinned_message_id;
      setGroup(nextGroup);
      setPinnedMessage(nextGroup.pinned_message ?? null);
      setMessages(current =>
        current.map(currentMessage => ({
          ...currentMessage,
          is_pinned: currentMessage.id === pinnedMessageId,
        })),
      );
      closeMessageActions();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction(null);
    }
  }

  function confirmPin(message: ChatMessage): void {
    if (pinnedMessage && pinnedMessage.id !== message.id) {
      Alert.alert(t('replacePinnedMessage'), t('replacePinnedMessageDescription'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('pinMessage'), onPress: () => { handlePin(message).catch(() => undefined); } },
      ]);
      return;
    }
    handlePin(message).catch(() => undefined);
  }

  async function handleReaction(messageId: string, emoji: string): Promise<void> {
    if (pendingAction) {
      return;
    }
    setPendingAction(`reaction:${messageId}:${emoji}`);
    try {
      const message = await toggleMessageReaction(route.params.chatId, messageId, emoji);
      setMessages(current => upsertChatMessage(current, message));
      setActionMessage(current => current?.id === message.id ? message : current);
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
    setPendingAction(`edit:${actionMessage.id}`);
    try {
      const message = await editTextMessage(route.params.chatId, actionMessage.id, editText);
      setMessages(current => upsertChatMessage(current, message));
      closeMessageActions();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(message: ChatMessage): Promise<void> {
    if (pendingAction) {
      return;
    }
    setPendingAction(`delete:${message.id}`);
    try {
      const nextMessage = await deleteMessage(route.params.chatId, message.id);
      setMessages(current => upsertChatMessage(current, nextMessage));
      setReplyToMessage(current => current?.id === message.id ? null : current);
      setPinnedMessage(current => current?.id === message.id ? null : current);
      closeMessageActions();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction(null);
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    if (item.type === 'system') {
      return (
        <View accessibilityLabel={t('groupSystemMessage')} style={styles.systemMessage}>
          <Text style={styles.systemMessageText}>{groupLifecycleText(item.payload, presentationCopy)}</Text>
          <Text style={styles.systemMessageTime}>{messageTime(item.created_at, language)}</Text>
        </View>
      );
    }

    const isOwn = item.sender_id === session?.user.id;
    const authorName = isOwn
      ? t('youPrefix')
      : item.author?.display_name || item.author?.username || presentationCopy.groupChat;
    const replyTo = item.reply_to;
    const replyAuthor = replyTo?.sender_id === session?.user.id
      ? t('youPrefix')
      : replyTo?.sender_id === item.sender_id
        ? authorName
        : presentationCopy.groupChat;
    const isPhoto = !item.deleted_at && item.type === 'photo' && Boolean(item.media_url);
    const isVideo = !item.deleted_at && item.type === 'video' && Boolean(item.media_url);
    const isFile = !item.deleted_at && item.type === 'file' && Boolean(item.media_url);
    const isVoice = !item.deleted_at && item.type === 'voice' && Boolean(item.media_url);
    const isVideoNote = !item.deleted_at && item.type === 'video_note' && Boolean(item.media_url);
    const messageText = item.deleted_at ? t('messageDeleted') : item.payload;

    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        {!isOwn ? (
          <ChatAvatar
            avatarRef={item.author?.avatar_ref}
            avatarType={item.author?.avatar_type}
            label={authorName}
            size="small"
          />
        ) : null}
        <View style={styles.messageContent}>
          <Pressable
            accessibilityHint={!item.deleted_at ? t('messageActions') : undefined}
            accessibilityLabel={messageText || attachmentLabel(item.type, attachmentCopy)}
            accessibilityRole={!item.deleted_at ? 'button' : undefined}
            delayLongPress={350}
            disabled={Boolean(item.deleted_at)}
            onLongPress={() => openMessageActions(item)}
            style={({ pressed }) => [
              styles.messageBubble,
              isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
              highlightedMessageId === item.id && styles.messageBubbleHighlighted,
              pressed && !item.deleted_at && styles.messageBubblePressed,
            ]}
          >
            {!isOwn ? <Text style={styles.authorName}>{authorName}</Text> : null}
            {replyTo ? (
              <View style={[styles.replyPreview, isOwn && styles.replyPreviewOwn]}>
                <Icon color={isOwn ? colors.onAccent : colors.accent} name="reply" size={16} />
                <View style={styles.replyPreviewCopy}>
                  <Text numberOfLines={1} style={[styles.replyPreviewAuthor, isOwn && styles.replyPreviewAuthorOwn]}>{replyAuthor}</Text>
                  <Text numberOfLines={1} style={[styles.replyPreviewText, isOwn && styles.replyPreviewTextOwn]}>
                    {replyTo.deleted_at ? t('messageDeleted') : messagePreview(replyTo, attachmentCopy)}
                  </Text>
                </View>
              </View>
            ) : null}
            {isPhoto && item.media_url ? <ChatPhotoAttachment mediaUrl={item.media_url} mimeType={item.media_mime_type} onOpen={(uri, name) => setPhotoViewer({ uri, name })} /> : null}
            {isVideo && item.media_url ? <ChatVideoAttachment mediaSizeBytes={item.media_size_bytes} mediaUrl={item.media_url} mimeType={item.media_mime_type} /> : null}
            {isFile && item.media_url ? <ChatFileAttachment mediaSizeBytes={item.media_size_bytes} mediaUrl={item.media_url} mimeType={item.media_mime_type} /> : null}
            {isVoice && item.media_url ? <ChatVoiceAttachment durationSeconds={item.duration_seconds} mediaUrl={item.media_url} mimeType={item.media_mime_type} /> : null}
            {isVideoNote && item.media_url ? <ChatVideoNoteAttachment durationSeconds={item.duration_seconds} mediaUrl={item.media_url} mimeType={item.media_mime_type} /> : null}
            {messageText ? <Text style={[styles.messageText, isOwn && styles.messageTextOwn, item.deleted_at && styles.deletedMessageText]}>{messageText}</Text> : null}
            <View style={styles.messageMeta}>
              {item.is_pinned ? <Icon color={isOwn ? colors.onAccent : colors.accent} name="pin" size={13} /> : null}
              {item.edited_at ? <Text style={[styles.messageMetaText, isOwn && styles.messageMetaTextOwn]}>{t('messageEdited')}</Text> : null}
              <Text style={[styles.messageMetaText, isOwn && styles.messageMetaTextOwn]}>{messageTime(item.created_at, language)}</Text>
            </View>
          </Pressable>
          {!item.deleted_at && item.reactions.length > 0 ? (
            <View style={[styles.reactionRow, isOwn && styles.reactionRowOwn]}>
              {item.reactions.map(reaction => (
                <Pressable
                  accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
                  accessibilityRole="button"
                  disabled={Boolean(pendingAction)}
                  key={reaction.emoji}
                  onPress={() => { handleReaction(item.id, reaction.emoji).catch(() => undefined); }}
                  style={({ pressed }) => [styles.reactionChip, reaction.reacted_by_me && styles.reactionChipSelected, pressed && !pendingAction && styles.reactionChipPressed]}
                >
                  <Text style={styles.reactionLabel}>{reaction.emoji} {reaction.count}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  const groupTitle = group?.title?.trim() || route.params.title;
  const attachmentTypeLabel = selectedAttachment
    ? selectedAttachment.mimeType.startsWith('image/')
      ? t('chatPhoto')
      : selectedAttachment.mimeType.startsWith('video/')
        ? t('chatVideo')
        : t('chatFile')
    : '';

  return (
    <KeyboardAvoidingView behavior={Platform.select({ android: 'height', ios: 'padding' })} style={styles.keyboardAvoidingView}>
      <AppScreen bottomSafeArea scroll={false} contentStyle={styles.content}>
        <View style={styles.header}>
          <IconButton accessibilityLabel={t('backToChats')} icon="back" onPress={() => navigation.goBack()} />
          <Pressable accessibilityLabel={t('groupDetails')} accessibilityRole="button" onPress={() => navigation.navigate('GroupDetails', { chatId: route.params.chatId })} style={({ pressed }) => [styles.headerCopy, pressed && styles.headerCopyPressed]}>
            <ChatAvatar avatarRef={group?.avatar_ref} avatarType="uploaded" label={groupTitle} size="small" />
            <View style={styles.headerTitleCopy}>
              <Text numberOfLines={1} style={styles.headerTitle}>{groupTitle}</Text>
              <Text numberOfLines={1} style={styles.headerSubtitle}>{group?.participant_ids.length ?? 0} {t('groupMembers').toLowerCase()}</Text>
            </View>
          </Pressable>
          <IconButton accessibilityLabel={t('groupDetails')} icon="groups" onPress={() => navigation.navigate('GroupDetails', { chatId: route.params.chatId })} />
        </View>

        {pinnedMessage ? <View style={[sharedStyles.glassCard, styles.pinnedMessage]}><Icon color={colors.accent} name="pin" size={18} /><Text numberOfLines={1} style={styles.pinnedMessageText}>{messagePreview(pinnedMessage, attachmentCopy)}</Text></View> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {isLoading && messages.length === 0 ? (
          <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingLabel}>{t('messagesLoading')}</Text></View>
        ) : (
          <FlatList
            contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messageList}
            data={messages}
            keyExtractor={message => message.id}
            ListEmptyComponent={<EmptyState description={t('messagesEmptyDescription')} title={t('messagesEmptyTitle')} />}
            onContentSizeChange={() => { if (!route.params.targetMessageId) { messageList.current?.scrollToEnd({ animated: false }); } }}
            onScrollToIndexFailed={() => messageList.current?.scrollToEnd({ animated: true })}
            ref={messageList}
            renderItem={renderMessage}
            showsVerticalScrollIndicator={false}
          />
        )}

        <Animated.View style={{ opacity: composerTransition, transform: [{ scale: composerTransition }] }}>
          {replyToMessage ? <View style={[sharedStyles.glassCard, styles.replyComposer]}><Icon color={colors.accent} name="reply" size={20} /><View style={styles.replyComposerCopy}><Text numberOfLines={1} style={styles.replyComposerTitle}>{t('replyingTo')} {replyToMessage.sender_id === session?.user.id ? t('youPrefix') : replyToMessage.author?.display_name || presentationCopy.groupChat}</Text><Text numberOfLines={1} style={styles.replyComposerText}>{messagePreview(replyToMessage, attachmentCopy)}</Text></View><IconButton accessibilityLabel={t('cancelReply')} icon="close" onPress={() => setReplyToMessage(null)} /></View> : null}
          {selectedAttachment ? <View style={[sharedStyles.glassCard, styles.attachmentDraft]}><Icon color={colors.accent} name="file" size={22} /><View style={styles.attachmentDraftCopy}><Text numberOfLines={1} style={styles.attachmentDraftTitle}>{selectedAttachment.name}</Text><Text style={styles.attachmentDraftMeta}>{attachmentTypeLabel}</Text></View><IconButton accessibilityLabel={t('removeAttachment')} disabled={isSending} icon="close" onPress={removeAttachment} /></View> : null}

          {group && !group.can_post ? <Text accessibilityRole="alert" style={styles.cannotPost}>{t('groupCannotPost')}</Text> : (
            <AraGlassSurface style={styles.composer}>
              <IconButton accessibilityLabel={t('addAttachment')} disabled={isSending || isPickingAttachment} icon="plus" onPress={() => setIsAttachmentPickerVisible(true)} />
              <TextInput accessibilityLabel={t('groupMessagePlaceholder')} editable={!isSending} multiline onChangeText={setText} placeholder={t('groupMessagePlaceholder')} placeholderTextColor={colors.textFaint} style={styles.composerInput} textAlignVertical="top" value={text} />
              <IconButton accessibilityLabel={isSending ? t('sendingMessage') : t('sendMessage')} disabled={isSending || (!text.trim() && !selectedAttachment)} icon="send" onPress={() => { handleSend().catch(() => undefined); }} tone="primary" />
            </AraGlassSurface>
          )}
        </Animated.View>
      </AppScreen>

      <AnimatedBottomSheet accessibilityLabel={t('closeMessageActions')} disabled={Boolean(pendingAction)} keyboardAvoiding onClose={closeMessageActions} sheetStyle={styles.sheet} visible={Boolean(actionMessage)}>
          {actionMessage ? <View>
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{isEditing ? t('editMessageTitle') : t('messageActions')}</Text><IconButton accessibilityLabel={t('closeMessageActions')} disabled={Boolean(pendingAction)} icon="close" onPress={closeMessageActions} /></View>
            {!isEditing ? <View style={styles.actionRow}><Pressable accessibilityRole="button" disabled={Boolean(pendingAction)} onPress={() => startReply(actionMessage)} style={({ pressed }) => [styles.secondaryButton, pressed && !pendingAction && styles.secondaryButtonPressed]}><Icon color={colors.text} name="reply" size={18} /><Text style={styles.secondaryButtonLabel}>{t('replyMessage')}</Text></Pressable><Pressable accessibilityRole="button" disabled={Boolean(pendingAction)} onPress={() => confirmPin(actionMessage)} style={({ pressed }) => [styles.secondaryButton, pressed && !pendingAction && styles.secondaryButtonPressed]}><Icon color={colors.text} name="pin" size={18} /><Text style={styles.secondaryButtonLabel}>{pinnedMessage?.id === actionMessage.id ? t('unpinMessage') : t('pinMessage')}</Text></Pressable></View> : null}
            {!isEditing ? <View style={styles.reactionPicker}>{REACTION_EMOJIS.map(emoji => <Pressable accessibilityLabel={emoji} accessibilityRole="button" disabled={Boolean(pendingAction)} key={emoji} onPress={() => { handleReaction(actionMessage.id, emoji).catch(() => undefined); }} style={({ pressed }) => [styles.reactionPickerButton, actionMessage.reactions.some(reaction => reaction.emoji === emoji && reaction.reacted_by_me) && styles.reactionPickerButtonSelected, pressed && !pendingAction && styles.reactionPickerButtonPressed]}><Text style={styles.reactionPickerEmoji}>{emoji}</Text></Pressable>)}</View> : null}
            {actionMessage.sender_id === session?.user.id ? isEditing ? <View style={styles.editForm}><TextInput accessibilityLabel={t('editMessagePlaceholder')} autoFocus editable={!pendingAction} multiline onChangeText={setEditText} placeholder={t('editMessagePlaceholder')} placeholderTextColor={colors.textFaint} style={styles.editInput} value={editText} /><View style={styles.actionRow}><Pressable accessibilityRole="button" disabled={Boolean(pendingAction)} onPress={() => setIsEditing(false)} style={({ pressed }) => [styles.secondaryButton, pressed && !pendingAction && styles.secondaryButtonPressed]}><Text style={styles.secondaryButtonLabel}>{t('cancel')}</Text></Pressable><Pressable accessibilityRole="button" disabled={!editText.trim() || Boolean(pendingAction)} onPress={() => { handleEdit().catch(() => undefined); }} style={({ pressed }) => [styles.primaryButton, (!editText.trim() || pendingAction) && styles.primaryButtonDisabled, pressed && editText.trim() && !pendingAction && styles.primaryButtonPressed]}><Text style={styles.primaryButtonLabel}>{pendingAction ? t('savingMessage') : t('saveMessage')}</Text></Pressable></View></View> : <View style={styles.actionRow}>{actionMessage.type === 'text' ? <Pressable accessibilityRole="button" disabled={Boolean(pendingAction)} onPress={() => setIsEditing(true)} style={({ pressed }) => [styles.secondaryButton, pressed && !pendingAction && styles.secondaryButtonPressed]}><Text style={styles.secondaryButtonLabel}>{t('editMessage')}</Text></Pressable> : null}<Pressable accessibilityRole="button" disabled={Boolean(pendingAction)} onPress={() => Alert.alert(t('deleteMessage'), t('deleteMessageConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('deleteMessage'), style: 'destructive', onPress: () => { handleDelete(actionMessage).catch(() => undefined); } }])} style={({ pressed }) => [styles.dangerButton, pressed && !pendingAction && styles.dangerButtonPressed]}><Text style={styles.dangerButtonLabel}>{t('deleteMessage')}</Text></Pressable></View> : null}
          </View> : null}
      </AnimatedBottomSheet>

      <AnimatedBottomSheet accessibilityLabel={t('closeAttachmentPicker')} disabled={isPickingAttachment} onClose={() => setIsAttachmentPickerVisible(false)} sheetStyle={styles.attachmentSheet} visible={isAttachmentPickerVisible}>
        <View><Text style={styles.sheetTitle}>{t('addAttachment')}</Text><Pressable accessibilityRole="button" disabled={isPickingAttachment} onPress={() => { selectAttachment(pickChatPhoto).catch(() => undefined); }} style={({ pressed }) => [styles.attachmentOption, pressed && styles.secondaryButtonPressed]}><Icon color={colors.accent} name="photo" size={22} /><Text style={styles.attachmentOptionLabel}>{t('attachmentPhoto')}</Text></Pressable><Pressable accessibilityRole="button" disabled={isPickingAttachment} onPress={() => { selectAttachment(pickChatVideo).catch(() => undefined); }} style={({ pressed }) => [styles.attachmentOption, pressed && styles.secondaryButtonPressed]}><Icon color={colors.accent} name="video" size={22} /><Text style={styles.attachmentOptionLabel}>{t('attachmentVideo')}</Text></Pressable><Pressable accessibilityRole="button" disabled={isPickingAttachment} onPress={() => { selectAttachment(pickChatDocument).catch(() => undefined); }} style={({ pressed }) => [styles.attachmentOption, pressed && styles.secondaryButtonPressed]}><Icon color={colors.accent} name="file" size={22} /><Text style={styles.attachmentOptionLabel}>{t('attachmentFile')}</Text></Pressable></View>
      </AnimatedBottomSheet>

      <AnimatedPhotoViewer closeLabel={t('closePhotoViewer')} name={photoViewer?.name ?? null} onClose={() => setPhotoViewer(null)} uri={photoViewer?.uri ?? null} />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  keyboardAvoidingView: { flex: 1 },
  content: { gap: spacing.sm, paddingBottom: spacing.sm },
  header: { alignItems: 'center', backgroundColor: colors.glassStrong, borderColor: colors.borderSubtle, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs, padding: 4 },
  headerCopy: { alignItems: 'center', borderRadius: radii.control, flex: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 48, paddingHorizontal: spacing.xs },
  headerCopyPressed: { backgroundColor: colors.surfacePressed },
  headerTitleCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  pinnedMessage: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pinnedMessageText: { color: colors.textMuted, flex: 1, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  loading: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center' },
  loadingLabel: { color: colors.textMuted, fontSize: 15 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  messageList: { gap: spacing.sm, paddingBottom: spacing.lg, paddingTop: spacing.xs },
  systemMessage: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.accentSubtle, borderRadius: 14, gap: 2, maxWidth: '88%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  systemMessageText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  systemMessageTime: { color: colors.textFaint, fontSize: 11 },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs, maxWidth: '92%' },
  messageRowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  messageContent: { flexShrink: 1 },
  messageBubble: { borderRadius: radii.card, gap: spacing.xs, paddingHorizontal: 14, paddingTop: 10 },
  messageBubbleOther: { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 4, borderColor: colors.borderSubtle, borderWidth: StyleSheet.hairlineWidth },
  messageBubbleOwn: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  messageBubbleHighlighted: { borderColor: colors.accent, borderWidth: 2 },
  messageBubblePressed: { opacity: 0.8 },
  authorName: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  replyPreview: { alignItems: 'center', backgroundColor: colors.accentSubtle, borderRadius: 10, flexDirection: 'row', gap: spacing.xs, padding: spacing.xs },
  replyPreviewOwn: { backgroundColor: colors.onAccentSubtle },
  replyPreviewCopy: { flex: 1, minWidth: 0 },
  replyPreviewAuthor: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  replyPreviewAuthorOwn: { color: colors.onAccent },
  replyPreviewText: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  replyPreviewTextOwn: { color: colors.onAccent },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  messageTextOwn: { color: colors.onAccent },
  deletedMessageText: { color: colors.textFaint, fontStyle: 'italic' },
  messageMeta: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 4 },
  messageMetaText: { color: colors.textFaint, fontSize: 11 },
  messageMetaTextOwn: { color: colors.onAccent },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionRowOwn: { justifyContent: 'flex-end' },
  reactionChip: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 28, paddingHorizontal: spacing.xs, justifyContent: 'center' },
  reactionChipSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  reactionChipPressed: { backgroundColor: colors.surfacePressed },
  reactionLabel: { color: colors.text, fontSize: 12 },
  replyComposer: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, paddingLeft: spacing.sm },
  replyComposerCopy: { flex: 1, minWidth: 0 },
  replyComposerTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  replyComposerText: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  attachmentDraft: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingLeft: spacing.sm },
  attachmentDraftCopy: { flex: 1, minWidth: 0 },
  attachmentDraftTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  attachmentDraftMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cannotPost: { color: colors.textMuted, fontSize: 14, lineHeight: 20, padding: spacing.sm, textAlign: 'center' },
  composer: { alignItems: 'center', borderRadius: radii.card, flexDirection: 'row', gap: spacing.xs, padding: 6 },
  composerInput: { color: colors.text, flex: 1, fontSize: 16, maxHeight: 120, minHeight: 48, paddingVertical: spacing.xs },
   sheet: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, gap: spacing.sm, padding: spacing.md },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: { alignItems: 'center', borderColor: colors.borderInteractive, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.sm },
  secondaryButtonPressed: { backgroundColor: colors.surfacePressed },
  secondaryButtonLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  reactionPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reactionPickerButton: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, height: 48, justifyContent: 'center', width: 48 },
  reactionPickerButtonSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  reactionPickerButtonPressed: { backgroundColor: colors.surfacePressed },
  reactionPickerEmoji: { fontSize: 22 },
  editForm: { gap: spacing.sm },
  editInput: { backgroundColor: colors.input, borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, minHeight: 112, padding: spacing.sm, textAlignVertical: 'top' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 14, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.sm },
  primaryButtonDisabled: { backgroundColor: colors.accentDisabled },
  primaryButtonPressed: { backgroundColor: colors.accentPressed },
  primaryButtonLabel: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  dangerButton: { alignItems: 'center', borderColor: colors.danger, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.sm },
  dangerButtonPressed: { backgroundColor: colors.surfacePressed },
  dangerButtonLabel: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  attachmentSheet: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, gap: spacing.sm, padding: spacing.md },
  attachmentOption: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.sm },
  attachmentOptionLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  });
}
