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
  Image,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
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
  getChat,
  getMessage,
  getMessages,
  markMessagesRead,
  sendMediaMessage,
  sendTextMessage,
  togglePinMessage,
  toggleMessageReaction,
  uploadChatAttachment,
  type ChatMessage,
  type ChatPreviewMessage,
} from '../api/chatApi';
import {
  ChatFileAttachment,
  ChatPhotoAttachment,
  ChatVideoAttachment,
  ChatVideoNoteAttachment,
  ChatVoiceAttachment,
} from '../components/ChatAttachmentContent';
import {
  cancelChatVoiceRecording,
  discardChatAttachmentDraft,
  getRecentChatMedia,
  pickChatDocument,
  pickChatPhoto,
  pickChatVideo,
  recordChatVideoNote,
  selectChatMediaFromLibrary,
  startChatVoiceRecording,
  stopChatVoiceRecording,
  type MediaLibraryItem,
  type PickedChatAttachment,
} from '../media/mediaClient';
import { videoNoteRecordingErrorKey } from '../media/mediaError';
import { callHistoryStatusKey, parseCallHistoryEvent } from '../callHistory';
import { attachmentLabel, type AttachmentPresentationCopy } from '../chatPresentation';
import { mergeChatMessages, upsertChatMessage } from '../messageState';
import { useI18n } from '../../../localization/I18nProvider';
import type { TranslationKey } from '../../../localization/messages';
import { useDirectCall } from '../../calls/DirectCallProvider';
import { clearMessageNotificationsForChat } from '../../notifications/pushClient';
import { useRealtime } from '../../realtime/RealtimeProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { ChatAvatar } from '../components/ChatAvatar';
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
  targetMessageId?: string;
  targetMessage?: ChatMessage;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢'] as const;
const PEER_TYPING_EXPIRY_MS = 6_000;
const TYPING_EVENT_REFRESH_MS = 3_000;

interface PeerPresence {
  isOnline: boolean;
  lastSeenAt: string | null;
}

interface PhotoViewerState {
  name: string;
  uri: string;
}

export function ChatScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { session } = useSession();
  const { call, startCall, startVideoCall } = useDirectCall();
  const { send, subscribeToChat, subscribeToEvents } = useRealtime();
  const messageList = useRef<FlatList<ChatMessage>>(null);
  const highlightedMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetScrollRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionedTargetMessageId = useRef<string | null>(null);
  const targetScrollAttempts = useRef(0);
  const typingExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSentTypingRef = useRef(false);
  const selectedAttachmentRef = useRef<PickedChatAttachment | null>(null);
  const isVoiceRecordingRef = useRef(false);
  const voiceRecordingStartedAt = useRef<number | null>(null);
  const voiceRecordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const statusTranslateY = useRef(new Animated.Value(0)).current;
  const composerActionScale = useRef(new Animated.Value(1)).current;
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
  const [isPickingAttachment, setIsPickingAttachment] = useState(false);
  const [isAttachmentPickerVisible, setIsAttachmentPickerVisible] = useState(false);
  const [isRecordingPickerVisible, setIsRecordingPickerVisible] = useState(false);
  const [isMediaLibraryVisible, setIsMediaLibraryVisible] = useState(false);
  const [isMediaLibraryLoading, setIsMediaLibraryLoading] = useState(false);
  const [mediaLibraryItems, setMediaLibraryItems] = useState<MediaLibraryItem[]>([]);
  const [mediaLibraryError, setMediaLibraryError] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isStoppingVoiceRecording, setIsStoppingVoiceRecording] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [selectedAttachment, setSelectedAttachment] =
    useState<PickedChatAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<ChatPreviewMessage | null>(null);
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
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isTargetMessageUnavailable, setIsTargetMessageUnavailable] = useState(false);
  const composerShowsSend = Boolean(text.trim() || selectedAttachment);
  const attachmentCopy: AttachmentPresentationCopy = {
    attachment: t('chatsAttachment'),
    file: t('chatFile'),
    photo: t('chatPhoto'),
    video: t('chatVideo'),
    videoNote: t('chatVideoNote'),
    voice: t('chatVoice'),
  };

  const clearTargetHighlightTimer = useCallback((): void => {
    if (highlightedMessageTimer.current) {
      clearTimeout(highlightedMessageTimer.current);
      highlightedMessageTimer.current = null;
    }
  }, []);

  const clearTargetScrollRetryTimer = useCallback((): void => {
    if (targetScrollRetryTimer.current) {
      clearTimeout(targetScrollRetryTimer.current);
      targetScrollRetryTimer.current = null;
    }
  }, []);

  const markChatMessagesRead = useCallback((messageIds: string[]): void => {
    if (!messageIds.length) {
      return;
    }

    markMessagesRead(route.params.chatId, messageIds)
      .then(() => {
        clearMessageNotificationsForChat(route.params.chatId);
      })
      .catch(() => undefined);
  }, [route.params.chatId]);

  const scrollToTargetMessage = useCallback((): void => {
    const targetMessageId = route.params.targetMessageId;
    const targetIndex = targetMessageId
      ? messages.findIndex(message => message.id === targetMessageId)
      : -1;
    const list = messageList.current;

    if (
      !targetMessageId ||
      targetIndex < 0 ||
      !list ||
      positionedTargetMessageId.current === targetMessageId
    ) {
      return;
    }

    positionedTargetMessageId.current = targetMessageId;
    requestAnimationFrame(() => {
      messageList.current?.scrollToIndex({
        animated: !reduceMotion,
        index: targetIndex,
        viewPosition: 0.5,
      });
    });
  }, [messages, reduceMotion, route.params.targetMessageId]);

  const clearVoiceRecordingState = useCallback((): void => {
    if (voiceRecordingTimer.current) {
      clearInterval(voiceRecordingTimer.current);
      voiceRecordingTimer.current = null;
    }
    isVoiceRecordingRef.current = false;
    voiceRecordingStartedAt.current = null;
    setIsVoiceRecording(false);
    setIsStoppingVoiceRecording(false);
    setVoiceRecordingSeconds(0);
  }, []);

  const cancelActiveVoiceRecording = useCallback(async (): Promise<void> => {
    if (!isVoiceRecordingRef.current) {
      return;
    }

    clearVoiceRecordingState();
    await cancelChatVoiceRecording();
  }, [clearVoiceRecordingState]);

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
    composerActionScale.stopAnimation();
    if (reduceMotion) {
      composerActionScale.setValue(1);
      return;
    }

    composerActionScale.setValue(0.92);
    Animated.timing(composerActionScale, {
      duration: 160,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [composerActionScale, composerShowsSend, reduceMotion]);

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
        cancelActiveVoiceRecording().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, [cancelActiveVoiceRecording, stopTyping]);

  useEffect(() => () => {
    stopTyping();
    updatePeerTyping(false);
  }, [stopTyping, updatePeerTyping]);

  useEffect(
    () => () => {
      if (voiceRecordingTimer.current) {
        clearInterval(voiceRecordingTimer.current);
        voiceRecordingTimer.current = null;
      }
      if (isVoiceRecordingRef.current) {
        isVoiceRecordingRef.current = false;
        cancelChatVoiceRecording().catch(() => undefined);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      const attachment = selectedAttachmentRef.current;
      if (attachment) {
        discardChatAttachmentDraft(attachment.uri).catch(() => undefined);
      }
    },
    [],
  );

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
          markChatMessagesRead(unreadIds);
        }
      } catch (nextError) {
        setError(t(authErrorKey(nextError)));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [markChatMessagesRead, route.params.chatId, session?.user.id, t],
  );

  useEffect(() => {
    const targetMessageId = route.params.targetMessageId;
    const preloadedMessage = route.params.targetMessage;
    let active = true;

    positionedTargetMessageId.current = null;
    targetScrollAttempts.current = 0;
    clearTargetHighlightTimer();
    clearTargetScrollRetryTimer();
    setHighlightedMessageId(null);
    setIsTargetMessageUnavailable(false);

    if (!targetMessageId) {
      return () => {
        active = false;
      };
    }

    const addTargetMessage = (message: ChatMessage): void => {
      if (!active) {
        return;
      }

      if (
        message.id !== targetMessageId ||
        message.chat_id !== route.params.chatId ||
        message.deleted_at
      ) {
        setIsTargetMessageUnavailable(true);
        return;
      }

      setMessages(current => mergeChatMessages(current, [message]));
      setHighlightedMessageId(message.id);
      highlightedMessageTimer.current = setTimeout(() => {
        if (active) {
          setHighlightedMessageId(current =>
            current === message.id ? null : current,
          );
        }
        highlightedMessageTimer.current = null;
      }, 4_000);
    };

    const isUsablePreloadedMessage =
      preloadedMessage &&
      preloadedMessage.id === targetMessageId &&
      preloadedMessage.chat_id === route.params.chatId &&
      !preloadedMessage.deleted_at;

    if (isUsablePreloadedMessage) {
      addTargetMessage(preloadedMessage);
    } else {
      getMessage(route.params.chatId, targetMessageId)
        .then(addTargetMessage)
        .catch(() => {
          if (active) {
            setIsTargetMessageUnavailable(true);
          }
        });
    }

    return () => {
      active = false;
      clearTargetHighlightTimer();
      clearTargetScrollRetryTimer();
    };
  }, [
    clearTargetHighlightTimer,
    clearTargetScrollRetryTimer,
    route.params.chatId,
    route.params.targetMessage,
    route.params.targetMessageId,
  ]);

  useEffect(() => {
    scrollToTargetMessage();
  }, [scrollToTargetMessage]);

  useEffect(() => {
    loadMessages().catch(() => undefined);
  }, [loadMessages]);

  useEffect(() => {
    let active = true;
    setPinnedMessage(null);

    getChat(route.params.chatId)
      .then(chat => {
        if (active) {
          setPinnedMessage(chat.pinned_message ?? null);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [route.params.chatId]);

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

      if (event.event === 'message.pin_updated' && event.chat) {
        const pinnedMessageId = event.chat.pinned_message_id;
        setPinnedMessage(event.chat.pinned_message ?? null);
        setMessages(current =>
          current.map(currentMessage => ({
            ...currentMessage,
            is_pinned: currentMessage.id === pinnedMessageId,
          })),
        );
        setActionMessage(current =>
          current
            ? { ...current, is_pinned: current.id === pinnedMessageId }
            : current,
        );
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
        if (event.event === 'message.deleted') {
          setReplyToMessage(current =>
            current?.id === message.id ? null : current,
          );
          setPinnedMessage(current =>
            current?.id === message.id ? null : current,
          );
        }

        if (
          event.event === 'message.created' &&
          message.sender_id !== session?.user.id
        ) {
          markChatMessagesRead([message.id]);
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
    markChatMessagesRead,
    route.params.chatId,
    route.params.peerUserId,
    session?.user.id,
    startTyping,
    subscribeToEvents,
    text,
    updatePeerTyping,
  ]);

  async function handleSend(): Promise<void> {
    if (selectedAttachment) {
      await handleAttachmentSend();
      return;
    }

    const messageText = text.trim();

    if (!messageText || isSending) {
      return;
    }

    setError('');
    setIsSending(true);
    stopTyping();
    try {
      const replyToMessageId = replyToMessage?.id;
      const message = await sendTextMessage(route.params.chatId, messageText, {
        replyToMessageId,
      });
      setMessages(current => upsertChatMessage(current, message));
      setText('');
      setReplyToMessage(current =>
        current?.id === replyToMessageId ? null : current,
      );
      requestAnimationFrame(() =>
        messageList.current?.scrollToEnd({ animated: true }),
      );
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSending(false);
    }
  }

  async function selectAttachment(
    picker: () => Promise<PickedChatAttachment | null>,
    errorKey: TranslationKey = 'attachmentPickError',
    resolveErrorKey: (error: unknown) => TranslationKey = () => errorKey,
  ): Promise<void> {
    if (isPickingAttachment || isSending) {
      return;
    }

    setAttachmentError('');
    setIsPickingAttachment(true);
    try {
      const attachment = await picker();
      if (!attachment) {
        return;
      }

      saveSelectedAttachment(attachment);
    } catch (pickerError) {
      setAttachmentError(t(resolveErrorKey(pickerError)));
    } finally {
      setIsPickingAttachment(false);
      setIsAttachmentPickerVisible(false);
      setIsMediaLibraryVisible(false);
    }
  }

  async function openMediaLibrary(): Promise<void> {
    if (isPickingAttachment || isSending) {
      return;
    }

    setAttachmentError('');
    setMediaLibraryError('');
    setMediaLibraryItems([]);
    setIsAttachmentPickerVisible(false);
    setIsMediaLibraryVisible(true);
    setIsMediaLibraryLoading(true);
    try {
      if (Platform.OS === 'android') {
        const permissions = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED,
        ]);
        const hasMediaAccess = Object.values(permissions).some(
          value => value === PermissionsAndroid.RESULTS.GRANTED,
        );
        if (!hasMediaAccess) {
          setMediaLibraryError(t('mediaLibraryPermissionDenied'));
          return;
        }
      }
      setMediaLibraryItems(await getRecentChatMedia());
    } catch {
      setMediaLibraryError(t('mediaLibraryUnavailable'));
    } finally {
      setIsMediaLibraryLoading(false);
    }
  }

  function saveSelectedAttachment(attachment: PickedChatAttachment): void {
    const previousAttachment = selectedAttachmentRef.current;
    selectedAttachmentRef.current = attachment;
    setSelectedAttachment(attachment);
    if (previousAttachment) {
      discardChatAttachmentDraft(previousAttachment.uri).catch(() => undefined);
    }
  }

  async function startVoiceRecording(): Promise<void> {
    if (isPickingAttachment || isSending || isVoiceRecording) {
      return;
    }

    setAttachmentError('');
    setIsPickingAttachment(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setAttachmentError(t('voicePermissionDenied'));
          return;
        }
      }

      await startChatVoiceRecording();
      const startedAt = Date.now();
      voiceRecordingStartedAt.current = startedAt;
      isVoiceRecordingRef.current = true;
      setVoiceRecordingSeconds(0);
      setIsVoiceRecording(true);
      voiceRecordingTimer.current = setInterval(() => {
        const activeStartedAt = voiceRecordingStartedAt.current;
        if (activeStartedAt !== null) {
          setVoiceRecordingSeconds(
            Math.max(0, Math.round((Date.now() - activeStartedAt) / 1_000)),
          );
        }
      }, 500);
    } catch {
      clearVoiceRecordingState();
      setAttachmentError(t('voiceRecordStartError'));
    } finally {
      setIsPickingAttachment(false);
      setIsAttachmentPickerVisible(false);
    }
  }

  async function startVideoNoteRecording(): Promise<void> {
    if (isPickingAttachment || isSending) {
      return;
    }

    setAttachmentError('');
    if (Platform.OS === 'android') {
      const permissions = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      if (
        permissions[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED ||
        permissions[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED
      ) {
        setAttachmentError(t('videoNotePermissionDenied'));
        setIsAttachmentPickerVisible(false);
        setIsRecordingPickerVisible(false);
        return;
      }
    }

    await selectAttachment(
      recordChatVideoNote,
      'videoNoteRecordError',
      videoNoteRecordingErrorKey,
    );
  }

  async function stopVoiceRecording(): Promise<void> {
    if (!isVoiceRecordingRef.current || isStoppingVoiceRecording) {
      return;
    }

    setIsStoppingVoiceRecording(true);
    try {
      const attachment = await stopChatVoiceRecording();
      clearVoiceRecordingState();
      saveSelectedAttachment(attachment);
    } catch {
      clearVoiceRecordingState();
      setAttachmentError(t('voiceRecordStopError'));
    }
  }

  function removeSelectedAttachment(): void {
    const attachment = selectedAttachmentRef.current;
    selectedAttachmentRef.current = null;
    setSelectedAttachment(null);
    setAttachmentError('');
    if (attachment) {
      discardChatAttachmentDraft(attachment.uri).catch(() => undefined);
    }
  }

  async function handleAttachmentSend(): Promise<void> {
    const attachment = selectedAttachmentRef.current;
    if (!attachment || isSending) {
      return;
    }

    setError('');
    setAttachmentError('');
    setIsSending(true);
    stopTyping();
    try {
      const upload = await uploadChatAttachment(attachment);
      const replyToMessageId = replyToMessage?.id;
      const message = await sendMediaMessage(
        route.params.chatId,
        upload,
        text,
        {
          ...(attachment.messageType
            ? {
                durationSeconds: attachment.durationSeconds,
                type: attachment.messageType,
              }
            : {}),
          replyToMessageId,
        },
      );
      setMessages(current => upsertChatMessage(current, message));
      selectedAttachmentRef.current = null;
      setSelectedAttachment(null);
      setText('');
      setReplyToMessage(current =>
        current?.id === replyToMessageId ? null : current,
      );
      discardChatAttachmentDraft(attachment.uri).catch(() => undefined);
      requestAnimationFrame(() =>
        messageList.current?.scrollToEnd({ animated: true }),
      );
    } catch (nextError) {
      setAttachmentError(t(authErrorKey(nextError)));
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

  function startReply(message: ChatMessage): void {
    if (message.deleted_at || pendingAction) {
      return;
    }

    setReplyToMessage(message);
    setActionMessage(null);
    setEditText('');
    setIsEditing(false);
  }

  function openMessageTarget(messageId: string): void {
    const targetMessage = messages.find(message => message.id === messageId);
    navigation.setParams({
      targetMessage,
      targetMessageId: messageId,
    });
  }

  async function handlePin(message: ChatMessage): Promise<void> {
    const actionId = `pin:${message.id}`;
    if (pendingAction) {
      return;
    }

    setError('');
    setPendingAction(actionId);
    try {
      const chat = await togglePinMessage(route.params.chatId, message.id);
      const pinnedMessageId = chat.pinned_message_id;
      setPinnedMessage(chat.pinned_message ?? null);
      setMessages(current =>
        current.map(currentMessage => ({
          ...currentMessage,
          is_pinned: currentMessage.id === pinnedMessageId,
        })),
      );
      setActionMessage(null);
      setEditText('');
      setIsEditing(false);
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
        {
          text: t('pinMessage'),
          onPress: () => {
            handlePin(message).catch(() => undefined);
          },
        },
      ]);
      return;
    }

    handlePin(message).catch(() => undefined);
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

    if (item.type === 'call') {
      const callHistory = parseCallHistoryEvent(item.payload);
      const callTypeLabel = t(callHistory?.callType === 'video' ? 'callVideo' : 'callAudio');
      const statusLabel = t(
        callHistory
          ? callHistoryStatusKey(callHistory, isOwn)
          : 'call',
      );
      const canCallBack = Boolean(callHistory && route.params.peerUserId);

      return (
        <View style={styles.callHistoryRow}>
          <View style={styles.callHistoryIcon}>
            <Icon
              color={colors.danger}
              name={callHistory?.callType === 'video' ? 'video' : 'call'}
              size={20}
            />
          </View>
          <View style={styles.callHistoryCopy}>
            <Text style={styles.callHistoryTitle}>{callTypeLabel}</Text>
            <Text style={styles.callHistoryStatus}>{statusLabel}</Text>
            <Text style={styles.callHistoryTime}>
              {formatMessageTime(item.created_at, language)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`${t('callCallback')}: ${callTypeLabel}`}
            accessibilityRole="button"
            disabled={!canCallBack || Boolean(call)}
            onPress={() => {
              if (!callHistory || !route.params.peerUserId) {
                return;
              }
              const input = {
                chatId: route.params.chatId,
                peerName: route.params.title,
                peerUserId: route.params.peerUserId,
              };
              const start = callHistory.callType === 'video' ? startVideoCall : startCall;
              start(input).catch(() => undefined);
            }}
            style={({ pressed }) => [
              styles.callHistoryCallback,
              (!canCallBack || call) && styles.callHistoryCallbackDisabled,
              pressed && canCallBack && !call && styles.callHistoryCallbackPressed,
            ]}
          >
            <Icon color={colors.accent} name={callHistory?.callType === 'video' ? 'video' : 'call'} size={18} />
            <Text style={styles.callHistoryCallbackLabel}>{t('callCallback')}</Text>
          </Pressable>
        </View>
      );
    }

    const authorName = item.author?.display_name || item.author?.username || route.params.title;
    const messageText = item.deleted_at ? t('messageDeleted') : item.payload;
    const replyTo = item.reply_to;
    const replyAuthor = replyTo?.sender_id === session?.user.id ? t('youPrefix') : route.params.title;
    const replyText = replyTo?.deleted_at
      ? t('messageDeleted')
      : replyTo?.payload || attachmentLabel(replyTo?.type ?? '', attachmentCopy);
    const reactions = item.reactions ?? [];
    const delivery = isOwn ? deliveryPresentation(item.delivery_status, t) : null;
    const isPhoto = !item.deleted_at && item.type === 'photo' && Boolean(item.media_url);
    const isVideo = !item.deleted_at && item.type === 'video' && Boolean(item.media_url);
    const isFile = !item.deleted_at && item.type === 'file' && Boolean(item.media_url);
    const isVoice = !item.deleted_at && item.type === 'voice' && Boolean(item.media_url);
    const isVideoNote =
      !item.deleted_at && item.type === 'video_note' && Boolean(item.media_url);
    const messageAccessibilityLabel =
      messageText || attachmentLabel(item.type, attachmentCopy);

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
            accessibilityHint={
              !item.deleted_at ? t('messageActions') : undefined
            }
            accessibilityLabel={messageAccessibilityLabel}
            accessibilityRole={!item.deleted_at ? 'button' : undefined}
            delayLongPress={350}
            disabled={Boolean(item.deleted_at)}
            onLongPress={() => openMessageActions(item)}
            style={({ pressed }) => [
              styles.messageBubble,
              isOwn ? styles.messageBubbleOwn : styles.messageBubblePeer,
              highlightedMessageId === item.id && styles.messageBubbleTarget,
              pressed && !item.deleted_at && styles.messageBubblePressed,
            ]}
          >
            {replyTo ? (
              <Pressable
                accessibilityHint={t('openReplyTarget')}
                accessibilityLabel={`${t('replyingTo')} ${replyAuthor}: ${replyText}`}
                accessibilityRole="button"
                onPress={() => openMessageTarget(replyTo.id)}
                style={({ pressed }) => [
                  styles.replyPreview,
                  isOwn && styles.replyPreviewOwn,
                  pressed && styles.replyPreviewPressed,
                ]}
              >
                <Icon color={isOwn ? colors.onAccent : colors.accent} name="reply" size={16} />
                <View style={styles.replyPreviewCopy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.replyPreviewAuthor, isOwn && styles.replyPreviewAuthorOwn]}
                  >
                    {replyAuthor}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.replyPreviewText, isOwn && styles.replyPreviewTextOwn]}
                  >
                    {replyText}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {isPhoto && item.media_url ? (
              <ChatPhotoAttachment
                mediaUrl={item.media_url}
                mimeType={item.media_mime_type}
                onOpen={(uri, name) => setPhotoViewer({ uri, name })}
              />
            ) : null}
            {isFile && item.media_url ? (
              <ChatFileAttachment
                mediaSizeBytes={item.media_size_bytes}
                mediaUrl={item.media_url}
                mimeType={item.media_mime_type}
              />
            ) : null}
            {isVideo && item.media_url ? (
              <ChatVideoAttachment
                mediaSizeBytes={item.media_size_bytes}
                mediaUrl={item.media_url}
                mimeType={item.media_mime_type}
              />
            ) : null}
            {isVoice && item.media_url ? (
              <ChatVoiceAttachment
                durationSeconds={item.duration_seconds}
                mediaUrl={item.media_url}
                mimeType={item.media_mime_type}
              />
            ) : null}
            {isVideoNote && item.media_url ? (
              <ChatVideoNoteAttachment
                durationSeconds={item.duration_seconds}
                mediaUrl={item.media_url}
                mimeType={item.media_mime_type}
              />
            ) : null}
            {messageText ? (
              <Text
                style={[
                  styles.messageText,
                  isOwn && styles.messageTextOwn,
                  (isPhoto || isVideo || isFile || isVoice || isVideoNote) &&
                    styles.messageAttachmentCaption,
                  item.deleted_at && styles.deletedMessageText,
                ]}
              >
                {messageText}
              </Text>
            ) : null}
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

  const selectedAttachmentTypeLabel = selectedAttachment
    ? selectedAttachment.messageType === 'voice'
      ? t('chatVoice')
      : selectedAttachment.messageType === 'video_note'
        ? t('chatVideoNote')
        : selectedAttachment.mimeType.startsWith('image/')
          ? t('chatPhoto')
          : selectedAttachment.mimeType.startsWith('video/')
            ? t('chatVideo')
            : t('chatFile')
    : '';

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ android: 'height', ios: 'padding' })}
      style={styles.keyboardAvoidingView}
    >
      <AppScreen bottomSafeArea scroll={false} contentStyle={styles.content}>
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
          {route.params.peerUserId ? (
            <IconButton
              accessibilityLabel={t('callAudio')}
              disabled={Boolean(call)}
              icon="call"
              onPress={() => {
                startCall({
                  chatId: route.params.chatId,
                  peerName: route.params.title,
                  peerUserId: route.params.peerUserId!,
                }).catch(() => undefined);
              }}
            />
          ) : null}
          {route.params.peerUserId ? (
            <IconButton
              accessibilityLabel={t('callVideo')}
              disabled={Boolean(call)}
              icon="video"
              onPress={() => {
                startVideoCall({
                  chatId: route.params.chatId,
                  peerName: route.params.title,
                  peerUserId: route.params.peerUserId!,
                }).catch(() => undefined);
              }}
            />
          ) : null}
          {route.params.peerUserId ? (
            <IconButton
              accessibilityLabel={t('safetyActions')}
              disabled={isBlocking}
              icon="more"
              onPress={() => setIsSafetyActionsVisible(true)}
            />
          ) : null}
        </View>

        {pinnedMessage ? (
          <Pressable
            accessibilityHint={t('openPinnedMessage')}
            accessibilityLabel={`${t('pinnedMessage')}: ${
              pinnedMessage.sender_id === session?.user.id ? t('youPrefix') : route.params.title
            }. ${pinnedMessage.payload || attachmentLabel(pinnedMessage.type, attachmentCopy)}`}
            accessibilityRole="button"
            onPress={() => openMessageTarget(pinnedMessage.id)}
            style={({ pressed }) => [
              sharedStyles.glassCard,
              styles.pinnedMessage,
              pressed && styles.pinnedMessagePressed,
            ]}
          >
            <View style={styles.pinnedMessageIcon}>
              <Icon color={colors.accent} name="pin" size={20} />
            </View>
            <View style={styles.pinnedMessageCopy}>
              <Text numberOfLines={1} style={styles.pinnedMessageTitle}>
                {t('pinnedMessage')}
              </Text>
              <Text numberOfLines={1} style={styles.pinnedMessageText}>
                {pinnedMessage.payload || attachmentLabel(pinnedMessage.type, attachmentCopy)}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {isTargetMessageUnavailable ? (
          <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.targetMessageNotice]}>
            <Text style={styles.targetMessageNoticeText}>{t('notificationMessageUnavailable')}</Text>
          </View>
        ) : null}

        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingLabel}>{t('messagesLoading')}</Text>
          </View>
        ) : (
          <FlatList
            ref={messageList}
            contentContainerStyle={
              messages.length === 0 ? styles.emptyMessages : styles.messagesList
            }
            data={messages}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={message => message.id}
            ListEmptyComponent={
              !error ? (
                <EmptyState
                  description={t('messagesEmptyDescription')}
                  title={t('messagesEmptyTitle')}
                />
              ) : undefined
            }
            onContentSizeChange={() => {
              if (route.params.targetMessageId) {
                scrollToTargetMessage();
                return;
              }
              messageList.current?.scrollToEnd({ animated: false });
            }}
            onScrollToIndexFailed={({ averageItemLength, index }) => {
              const targetMessageId = route.params.targetMessageId;
              if (
                !targetMessageId ||
                messages[index]?.id !== targetMessageId ||
                targetScrollAttempts.current >= 2
              ) {
                return;
              }

              targetScrollAttempts.current += 1;
              positionedTargetMessageId.current = null;
              messageList.current?.scrollToOffset({
                animated: false,
                offset: Math.max(0, averageItemLength * index),
              });
              clearTargetScrollRetryTimer();
              targetScrollRetryTimer.current = setTimeout(() => {
                targetScrollRetryTimer.current = null;
                scrollToTargetMessage();
              }, 80);
            }}
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

        {selectedAttachment ? (
          <View style={[sharedStyles.glassCard, styles.attachmentDraft]}>
            {selectedAttachment.mimeType.startsWith('image/') ? (
              <Image source={{ uri: selectedAttachment.uri }} style={styles.attachmentDraftPreview} />
            ) : (
              <View style={styles.attachmentDraftFileIcon}>
                <Icon
                  color={colors.accent}
                  name={
                    selectedAttachment.messageType === 'voice'
                      ? 'microphone'
                      : selectedAttachment.messageType === 'video_note'
                        ? 'videoNote'
                      : selectedAttachment.mimeType.startsWith('video/')
                        ? 'video'
                        : 'file'
                  }
                  size={23}
                />
              </View>
            )}
            <View style={styles.attachmentDraftDetails}>
              <Text numberOfLines={1} style={styles.attachmentDraftName}>
                {selectedAttachmentTypeLabel}
              </Text>
              <Text style={styles.attachmentDraftMeta}>
                {selectedAttachment.durationSeconds
                  ? `${formatDuration(selectedAttachment.durationSeconds)} · `
                  : ''}
                {formatAttachmentSize(selectedAttachment.sizeBytes)}
              </Text>
              {isSending ? (
                <View style={styles.attachmentUploading}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={styles.attachmentUploadingLabel}>
                    {t('attachmentUploading')}
                  </Text>
                </View>
              ) : null}
            </View>
            <IconButton
              accessibilityLabel={t('removeAttachment')}
              disabled={isSending}
              icon="close"
              onPress={removeSelectedAttachment}
              size={40}
            />
          </View>
        ) : null}

        {attachmentError ? (
          <View accessibilityRole="alert" style={styles.attachmentError}>
            <Text style={styles.attachmentErrorText}>{attachmentError}</Text>
          </View>
        ) : null}

        {replyToMessage ? (
          <View
            accessibilityLabel={`${t('replyingTo')} ${
              replyToMessage.author?.display_name ||
              replyToMessage.author?.username ||
              (replyToMessage.sender_id === session?.user.id ? t('youPrefix') : route.params.title)
            }`}
            style={[sharedStyles.glassCard, styles.replyComposer]}
          >
            <Icon color={colors.accent} name="reply" size={20} />
            <View style={styles.replyComposerCopy}>
              <Text numberOfLines={1} style={styles.replyComposerTitle}>
                {t('replyingTo')}{' '}
                {replyToMessage.author?.display_name ||
                  replyToMessage.author?.username ||
                  (replyToMessage.sender_id === session?.user.id
                    ? t('youPrefix')
                    : route.params.title)}
              </Text>
              <Text numberOfLines={1} style={styles.replyComposerText}>
                {replyToMessage.payload || attachmentLabel(replyToMessage.type, attachmentCopy)}
              </Text>
            </View>
            <IconButton
              accessibilityLabel={t('cancelReply')}
              icon="close"
              onPress={() => setReplyToMessage(null)}
              size={48}
            />
          </View>
        ) : null}

        {isVoiceRecording ? (
          <View style={[sharedStyles.glassPanel, styles.voiceRecordingComposer]}>
            <Pressable
              accessibilityLabel={t('cancelVoiceRecording')}
              accessibilityRole="button"
              disabled={isStoppingVoiceRecording}
              onPress={() => {
                cancelActiveVoiceRecording().catch(() => undefined);
              }}
              style={({ pressed }) => [
                styles.voiceRecordingCancelButton,
                pressed && !isStoppingVoiceRecording && styles.attachmentButtonPressed,
              ]}
            >
              <Icon color={colors.danger} name="close" size={22} />
            </Pressable>
            <View style={styles.voiceRecordingDetails}>
              <Text numberOfLines={1} style={styles.voiceRecordingTitle}>
                {t('voiceRecording')}
              </Text>
              <Text style={styles.voiceRecordingDuration}>
                {formatDuration(voiceRecordingSeconds)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('stopVoiceRecording')}
              accessibilityRole="button"
              disabled={isStoppingVoiceRecording}
              onPress={() => {
                stopVoiceRecording().catch(() => undefined);
              }}
              style={({ pressed }) => [
                styles.voiceRecordingStopButton,
                isStoppingVoiceRecording && styles.voiceRecordingStopButtonDisabled,
                pressed && !isStoppingVoiceRecording && styles.voiceRecordingStopButtonPressed,
              ]}
            >
              {isStoppingVoiceRecording ? (
                <ActivityIndicator color={colors.canvas} size="small" />
              ) : (
                <Icon color={colors.canvas} name="stop" size={19} />
              )}
            </Pressable>
          </View>
        ) : (
          <View style={[sharedStyles.glassPanel, styles.composer]}>
            <Pressable
              accessibilityLabel={t('addAttachment')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSending || isPickingAttachment }}
              disabled={isSending || isPickingAttachment}
              hitSlop={4}
              onPress={() => setIsAttachmentPickerVisible(true)}
              style={({ pressed }) => [
                styles.attachmentButton,
                (isSending || isPickingAttachment) && styles.attachmentButtonDisabled,
                pressed && !isSending && !isPickingAttachment && styles.attachmentButtonPressed,
              ]}
            >
              {isPickingAttachment ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Icon color={colors.accent} name="plus" size={22} />
              )}
            </Pressable>
            <TextInput
              accessibilityLabel={t('messageInputPlaceholder')}
              editable={!isSending}
              multiline
              onContentSizeChange={() => {
                requestAnimationFrame(() =>
                  messageList.current?.scrollToEnd({ animated: false }),
                );
              }}
              onBlur={stopTyping}
              onFocus={() => {
                requestAnimationFrame(() =>
                  messageList.current?.scrollToEnd({ animated: false }),
                );
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
              textAlignVertical="top"
              value={text}
            />
            <View style={styles.composerQuickActions}>
              <Animated.View
                style={{ transform: [{ scale: composerActionScale }] }}
              >
                <Pressable
                  accessibilityHint={composerShowsSend ? undefined : t('recordMessageHint')}
                  accessibilityLabel={
                    isSending
                      ? selectedAttachment
                        ? t('attachmentUploading')
                        : t('sendingMessage')
                      : composerShowsSend
                        ? selectedAttachment
                          ? t('sendAttachment')
                          : t('sendMessage')
                        : t('recordMessage')
                  }
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSending || isPickingAttachment }}
                  disabled={isSending || isPickingAttachment}
                  hitSlop={4}
                  onPress={() => {
                    if (composerShowsSend) {
                      handleSend().catch(() => undefined);
                      return;
                    }
                    setIsRecordingPickerVisible(true);
                  }}
                  style={({ pressed }) => [
                    styles.composerPrimaryButton,
                    (isSending || isPickingAttachment) && styles.composerPrimaryButtonDisabled,
                    pressed &&
                      !isSending &&
                      !isPickingAttachment &&
                      styles.composerPrimaryButtonPressed,
                  ]}
                >
                  {isSending ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <View style={styles.composerPrimaryButtonContent}>
                      <Icon
                        color={colors.onAccent}
                        name={composerShowsSend ? 'send' : 'microphone'}
                        size={20}
                      />
                      {!composerShowsSend ? (
                        <Icon color={colors.onAccent} name="chevronDown" size={14} />
                      ) : null}
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        )}
      </AppScreen>

      <Modal
        animationType="slide"
        onRequestClose={closeMessageActions}
        transparent
        visible={Boolean(actionMessage)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ android: 'height', ios: 'padding' })}
          style={styles.sheetKeyboardAvoidingView}
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

              {!isEditing ? (
                <View style={styles.messageActionStack}>
                  <View style={styles.messageActions}>
                    <Pressable
                      accessibilityLabel={t('replyMessage')}
                      accessibilityRole="button"
                      disabled={Boolean(pendingAction)}
                      onPress={() => startReply(actionMessage)}
                      style={({ pressed }) => [
                        styles.secondaryActionButton,
                        pressed && !pendingAction && styles.actionButtonPressed,
                      ]}
                    >
                      <View style={styles.messageActionButtonContent}>
                        <Icon color={colors.text} name="reply" size={18} />
                        <Text style={styles.secondaryActionLabel}>{t('replyMessage')}</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={
                        pinnedMessage?.id === actionMessage.id
                          ? t('unpinMessage')
                          : t('pinMessage')
                      }
                      accessibilityRole="button"
                      disabled={Boolean(pendingAction)}
                      onPress={() => confirmPin(actionMessage)}
                      style={({ pressed }) => [
                        styles.secondaryActionButton,
                        pressed && !pendingAction && styles.actionButtonPressed,
                      ]}
                    >
                      <View style={styles.messageActionButtonContent}>
                        <Icon color={colors.text} name="pin" size={18} />
                        <Text style={styles.secondaryActionLabel}>
                          {pinnedMessage?.id === actionMessage.id
                            ? t('unpinMessage')
                            : t('pinMessage')}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              ) : null}

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
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsAttachmentPickerVisible(false)}
        transparent
        visible={isAttachmentPickerVisible}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel={t('closeAttachmentPicker')}
            accessibilityRole="button"
            disabled={isPickingAttachment}
            onPress={() => setIsAttachmentPickerVisible(false)}
            style={styles.sheetBackdrop}
          />
          <View
            accessibilityLabel={t('addAttachment')}
            accessibilityViewIsModal
            style={[sharedStyles.glassPanel, styles.attachmentSheet]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('addAttachment')}</Text>
            <Text style={styles.attachmentSheetDescription}>
              {t('attachmentPickerDescription')}
            </Text>
            <View style={styles.attachmentPickerGrid}>
              <View style={styles.attachmentPickerMediaRow}>
                <Pressable
                  accessibilityHint={t('attachmentMediaDescription')}
                  accessibilityLabel={t('attachmentMedia')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPickingAttachment }}
                  disabled={isPickingAttachment}
                  onPress={() => {
                      openMediaLibrary().catch(() => undefined);
                  }}
                  style={({ pressed }) => [
                    styles.attachmentPickerTile,
                    styles.attachmentPickerMediaTile,
                    isPickingAttachment && styles.attachmentPickerTileDisabled,
                    pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                  ]}
                >
                  <View style={styles.attachmentPickerTileIcon}>
                    <Icon color={colors.accent} name="photo" size={23} />
                  </View>
                  <Text numberOfLines={2} style={styles.attachmentPickerTileTitle}>
                    {t('attachmentMedia')}
                  </Text>
                  <Text numberOfLines={2} style={styles.attachmentPickerTileDescription}>
                    {t('attachmentMediaDescription')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityHint={t('attachmentVideoHint')}
                  accessibilityLabel={t('attachmentVideo')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPickingAttachment }}
                  disabled={isPickingAttachment}
                  onPress={() => {
                    startVideoNoteRecording().catch(() => undefined);
                  }}
                  style={({ pressed }) => [
                    styles.attachmentPickerTile,
                    styles.attachmentPickerMediaTile,
                    isPickingAttachment && styles.attachmentPickerTileDisabled,
                    pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                  ]}
                >
                  <View style={styles.attachmentPickerTileIcon}>
                    <Icon color={colors.accent} name="videoNote" size={23} />
                  </View>
                  <Text numberOfLines={2} style={styles.attachmentPickerTileTitle}>
                    {t('attachmentVideoNote')}
                  </Text>
                  <Text numberOfLines={2} style={styles.attachmentPickerTileDescription}>
                    {t('attachmentVideoNoteDescription')}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityHint={t('attachmentFileHint')}
                accessibilityLabel={t('attachmentFile')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isPickingAttachment }}
                disabled={isPickingAttachment}
                onPress={() => {
                  selectAttachment(pickChatDocument).catch(() => undefined);
                }}
                style={({ pressed }) => [
                  styles.attachmentPickerTile,
                  styles.attachmentPickerFileTile,
                  isPickingAttachment && styles.attachmentPickerTileDisabled,
                  pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                ]}
              >
                <View style={styles.attachmentPickerTileIcon}>
                  <Icon color={colors.accent} name="file" size={23} />
                </View>
                <View style={styles.attachmentPickerFileCopy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.attachmentPickerTileTitle, styles.attachmentPickerFileTitle]}
                  >
                    {t('attachmentFile')}
                  </Text>
                  <Text numberOfLines={2} style={styles.attachmentPickerFileDescription}>
                    {t('attachmentFileDescription')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsMediaLibraryVisible(false)}
        transparent
        visible={isMediaLibraryVisible}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel={t('closeMediaLibrary')}
            accessibilityRole="button"
            disabled={isPickingAttachment}
            onPress={() => setIsMediaLibraryVisible(false)}
            style={styles.sheetBackdrop}
          />
          <View
            accessibilityLabel={t('attachmentMedia')}
            accessibilityViewIsModal
            style={[sharedStyles.glassPanel, styles.mediaLibrarySheet]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.mediaLibraryHeader}>
              <View style={styles.mediaLibraryHeading}>
                <Text style={styles.sheetTitle}>{t('attachmentMedia')}</Text>
                <Text style={styles.attachmentSheetDescription}>
                  {t('mediaLibraryDescription')}
                </Text>
              </View>
              <IconButton
                accessibilityLabel={t('closeMediaLibrary')}
                disabled={isPickingAttachment}
                icon="close"
                onPress={() => setIsMediaLibraryVisible(false)}
                size={48}
              />
            </View>

            {isMediaLibraryLoading ? (
              <View style={styles.mediaLibraryState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.mediaLibraryStateLabel}>{t('mediaLibraryLoading')}</Text>
              </View>
            ) : mediaLibraryError ? (
              <View style={styles.mediaLibraryState}>
                <Text accessibilityRole="alert" style={styles.attachmentErrorText}>
                  {mediaLibraryError}
                </Text>
              </View>
            ) : mediaLibraryItems.length === 0 ? (
              <View style={styles.mediaLibraryState}>
                <Text style={styles.mediaLibraryStateLabel}>{t('mediaLibraryEmpty')}</Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.mediaLibraryGrid}
                showsVerticalScrollIndicator={false}
              >
                {mediaLibraryItems.map(item => (
                  <Pressable
                    accessibilityLabel={item.mimeType.startsWith('video/') ? t('chatVideo') : t('chatPhoto')}
                    accessibilityRole="button"
                    disabled={isPickingAttachment}
                    key={item.uri}
                    onPress={() => {
                      selectAttachment(() => selectChatMediaFromLibrary(item.uri)).catch(
                        () => undefined,
                      );
                    }}
                    style={({ pressed }) => [
                      styles.mediaLibraryTile,
                      isPickingAttachment && styles.attachmentPickerTileDisabled,
                      pressed && !isPickingAttachment && styles.mediaLibraryTilePressed,
                    ]}
                  >
                    {item.mimeType.startsWith('image/') ? (
                      <Image source={{ uri: item.uri }} style={styles.mediaLibraryImage} />
                    ) : (
                      <View style={styles.mediaLibraryVideoPlaceholder}>
                        <Icon color={colors.accent} name="video" size={26} />
                        <Text numberOfLines={2} style={styles.mediaLibraryVideoName}>
                          {t('chatVideo')}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.mediaLibraryFallbackActions}>
              <Pressable
                accessibilityHint={t('attachmentPhotoHint')}
                accessibilityLabel={t('attachmentPhoto')}
                accessibilityRole="button"
                disabled={isPickingAttachment}
                onPress={() => {
                  selectAttachment(pickChatPhoto).catch(() => undefined);
                }}
                style={({ pressed }) => [
                  styles.mediaLibraryFallbackButton,
                  pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                ]}
              >
                <Icon color={colors.accent} name="photo" size={20} />
                <Text style={styles.mediaLibraryFallbackLabel}>{t('attachmentPhoto')}</Text>
              </Pressable>
              <Pressable
                accessibilityHint={t('attachmentVideoHint')}
                accessibilityLabel={t('attachmentVideo')}
                accessibilityRole="button"
                disabled={isPickingAttachment}
                onPress={() => {
                  selectAttachment(pickChatVideo).catch(() => undefined);
                }}
                style={({ pressed }) => [
                  styles.mediaLibraryFallbackButton,
                  pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                ]}
              >
                <Icon color={colors.accent} name="video" size={20} />
                <Text style={styles.mediaLibraryFallbackLabel}>{t('attachmentVideo')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsRecordingPickerVisible(false)}
        transparent
        visible={isRecordingPickerVisible}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel={t('closeRecordingPicker')}
            accessibilityRole="button"
            disabled={isPickingAttachment}
            onPress={() => setIsRecordingPickerVisible(false)}
            style={styles.sheetBackdrop}
          />
          <View
            accessibilityLabel={t('recordMessage')}
            accessibilityViewIsModal
            style={[sharedStyles.glassPanel, styles.attachmentSheet]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('recordMessage')}</Text>
            <Text style={styles.attachmentSheetDescription}>{t('recordMessageDescription')}</Text>
            <View style={styles.attachmentPickerMediaRow}>
              <Pressable
                accessibilityHint={t('attachmentVoiceHint')}
                accessibilityLabel={t('attachmentVoice')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isPickingAttachment }}
                disabled={isPickingAttachment}
                onPress={() => {
                  setIsRecordingPickerVisible(false);
                  startVoiceRecording().catch(() => undefined);
                }}
                style={({ pressed }) => [
                  styles.attachmentPickerTile,
                  styles.recordingPickerTile,
                  isPickingAttachment && styles.attachmentPickerTileDisabled,
                  pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                ]}
              >
                <View style={styles.attachmentPickerTileIcon}>
                  <Icon color={colors.accent} name="microphone" size={23} />
                </View>
                <Text numberOfLines={2} style={styles.attachmentPickerTileTitle}>
                  {t('attachmentVoice')}
                </Text>
                <Text numberOfLines={2} style={styles.attachmentPickerTileDescription}>
                  {t('attachmentVoiceDescription')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityHint={t('attachmentVideoNoteHint')}
                accessibilityLabel={t('attachmentVideoNote')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isPickingAttachment }}
                disabled={isPickingAttachment}
                onPress={() => {
                  setIsRecordingPickerVisible(false);
                  startVideoNoteRecording().catch(() => undefined);
                }}
                style={({ pressed }) => [
                  styles.attachmentPickerTile,
                  styles.recordingPickerTile,
                  isPickingAttachment && styles.attachmentPickerTileDisabled,
                  pressed && !isPickingAttachment && styles.attachmentPickerTilePressed,
                ]}
              >
                <View style={styles.attachmentPickerTileIcon}>
                  <Icon color={colors.accent} name="videoNote" size={23} />
                </View>
                <Text numberOfLines={2} style={styles.attachmentPickerTileTitle}>
                  {t('attachmentVideoNote')}
                </Text>
                <Text numberOfLines={2} style={styles.attachmentPickerTileDescription}>
                  {t('attachmentVideoNoteDescription')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setPhotoViewer(null)}
        transparent
        visible={Boolean(photoViewer)}
      >
        <View style={styles.photoViewer}>
          <Pressable
            accessibilityLabel={t('closePhotoViewer')}
            accessibilityRole="button"
            onPress={() => setPhotoViewer(null)}
            style={styles.photoViewerBackdrop}
          />
          {photoViewer ? (
            <View style={styles.photoViewerContent}>
              <Image
                accessibilityLabel={photoViewer.name}
                resizeMode="contain"
                source={{ uri: photoViewer.uri }}
                style={styles.photoViewerImage}
              />
              <View style={styles.photoViewerHeader}>
                <Text numberOfLines={1} style={styles.photoViewerName}>
                  {photoViewer.name}
                </Text>
                <IconButton
                  accessibilityLabel={t('closePhotoViewer')}
                  icon="close"
                  onPress={() => setPhotoViewer(null)}
                />
              </View>
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

function formatAttachmentSize(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
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
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    padding: spacing.xs,
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
    color: colors.accent,
    fontWeight: '600',
  },
  typingDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 16,
  },
  typingDot: {
    backgroundColor: colors.accent,
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
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  emptyMessages: {
    flexGrow: 1,
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageContent: {
    alignItems: 'flex-start',
    maxWidth: '82%',
  },
  callHistoryRow: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '94%',
    padding: spacing.sm,
  },
  callHistoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.dangerSubtle,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  callHistoryCopy: {
    flex: 1,
    minWidth: 0,
  },
  callHistoryTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  callHistoryStatus: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  callHistoryTime: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  callHistoryCallback: {
    alignItems: 'center',
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  callHistoryCallbackDisabled: {
    opacity: 0.46,
  },
  callHistoryCallbackPressed: {
    backgroundColor: colors.accentSelected,
  },
  callHistoryCallbackLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  messageBubble: {
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  messageBubbleOwn: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  messageBubblePeer: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageBubblePressed: {
    opacity: 0.76,
  },
  messageBubbleTarget: {
    borderColor: colors.accent,
    borderWidth: 1,
    elevation: 3,
    shadowColor: colors.accent,
    shadowOpacity: 0.34,
    shadowRadius: 7,
  },
  replyPreview: {
    alignItems: 'center',
    backgroundColor: colors.accentSubtle,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  replyPreviewOwn: {
    backgroundColor: colors.onAccentSubtle,
  },
  replyPreviewPressed: {
    backgroundColor: colors.accentSelected,
  },
  replyPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  replyPreviewAuthor: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  replyPreviewAuthorOwn: {
    color: colors.onAccent,
  },
  replyPreviewText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  replyPreviewTextOwn: {
    color: colors.onAccentMuted,
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextOwn: {
    color: colors.onAccent,
  },
  messageAttachmentCaption: {
    marginTop: spacing.xs,
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
    color: colors.onAccentFaint,
  },
  messageDeliveryRead: {
    color: colors.deliveryRead,
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
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: spacing.xs,
  },
  reactionChipSelected: {
    backgroundColor: colors.accentSelected,
    borderColor: colors.accent,
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
  targetMessageNotice: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  pinnedMessage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 64,
    padding: spacing.xs,
  },
  pinnedMessagePressed: {
    backgroundColor: colors.surfacePressed,
  },
  pinnedMessageIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSubtle,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  pinnedMessageCopy: {
    flex: 1,
    minWidth: 0,
  },
  pinnedMessageTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  pinnedMessageText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  targetMessageNoticeText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
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
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  attachmentDraft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.xs,
  },
  attachmentDraftPreview: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 56,
    width: 56,
  },
  attachmentDraftFileIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSubtle,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  attachmentDraftDetails: {
    flex: 1,
    minWidth: 0,
  },
  attachmentDraftName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  attachmentDraftMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  attachmentUploading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 5,
  },
  attachmentUploadingLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentError: {
    marginBottom: spacing.sm,
  },
  attachmentErrorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  replyComposer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 64,
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
  },
  replyComposerCopy: {
    flex: 1,
    minWidth: 0,
  },
  replyComposerTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  replyComposerText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  composer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.xs,
  },
  voiceRecordingComposer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 64,
    padding: spacing.xs,
  },
  voiceRecordingCancelButton: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  voiceRecordingDetails: {
    flex: 1,
    minWidth: 0,
  },
  voiceRecordingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  voiceRecordingDuration: {
    color: colors.danger,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  voiceRecordingStopButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  voiceRecordingStopButtonDisabled: {
    opacity: 0.65,
  },
  voiceRecordingStopButtonPressed: {
    opacity: 0.82,
  },
  attachmentButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  attachmentButtonDisabled: {
    opacity: 0.5,
  },
  attachmentButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 240,
    minHeight: 120,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  composerQuickActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
  },
  composerPrimaryButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    marginLeft: 3,
  },
  composerPrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  composerPrimaryButtonDisabled: {
    opacity: 0.45,
  },
  composerPrimaryButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetKeyboardAvoidingView: {
    flex: 1,
  },
  sheetBackdrop: {
    backgroundColor: colors.overlay,
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
    borderBottomWidth: 0,
    overflow: 'hidden',
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
  attachmentSheet: {
    backgroundColor: colors.glassStrong,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  mediaLibrarySheet: {
    backgroundColor: colors.glassStrong,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.sm,
    maxHeight: '84%',
    minHeight: 360,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  mediaLibraryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mediaLibraryHeading: {
    flex: 1,
    minWidth: 0,
  },
  mediaLibraryState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    paddingHorizontal: spacing.md,
  },
  mediaLibraryStateLabel: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  mediaLibraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  mediaLibraryTile: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '31.8%',
  },
  mediaLibraryTilePressed: {
    opacity: 0.7,
  },
  mediaLibraryImage: {
    height: '100%',
    width: '100%',
  },
  mediaLibraryVideoPlaceholder: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    padding: spacing.xs,
  },
  mediaLibraryVideoName: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  mediaLibraryFallbackActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mediaLibraryFallbackButton: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  mediaLibraryFallbackLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  attachmentSheetDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  attachmentPickerGrid: {
    gap: spacing.sm,
  },
  attachmentPickerMediaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  attachmentPickerTile: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    justifyContent: 'center',
    padding: spacing.sm,
  },
  attachmentPickerMediaTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 152,
  },
  recordingPickerTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 152,
  },
  attachmentPickerFileTile: {
    flexDirection: 'row',
    minHeight: 76,
  },
  attachmentPickerTilePressed: {
    backgroundColor: colors.surfacePressed,
  },
  attachmentPickerTileDisabled: {
    opacity: 0.45,
  },
  attachmentPickerTileIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSubtle,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  attachmentPickerFileCopy: {
    flex: 1,
    minWidth: 0,
  },
  attachmentPickerTileTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  attachmentPickerFileTitle: {
    textAlign: 'left',
  },
  attachmentPickerTileDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  attachmentPickerFileDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
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
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  reactionPickerButtonSelected: {
    backgroundColor: colors.accentSelected,
    borderColor: colors.accent,
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
  messageActionStack: {
    marginTop: spacing.lg,
  },
  messageActionButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  secondaryActionButton: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  safetyActionButton: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  primaryActionButtonDisabled: {
    backgroundColor: colors.accentDisabled,
  },
  primaryActionButtonPressed: {
    backgroundColor: colors.accentPressed,
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
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteActionButton: {
    borderColor: colors.danger,
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
    borderColor: colors.borderSubtle,
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
  photoViewer: {
    backgroundColor: colors.mediaViewer,
    flex: 1,
  },
  photoViewerBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  photoViewerContent: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  photoViewerImage: {
    flex: 1,
    width: '100%',
  },
  photoViewerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: spacing.xl,
  },
  photoViewerName: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
});
