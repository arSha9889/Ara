import { useCallback, useEffect, useRef, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { ChannelChatPanel } from './ChannelChatPanel.jsx';
import {
  deleteMessage,
  editMessage,
  getChatE2eeKeys,
  getChatMessages,
  markMessagesRead,
  pinMessage,
  reactToMessage,
  sendMessage,
  uploadChatMedia,
  uploadE2eeAttachment,
} from '../../features/chats/chatsApi.js';
import { RECORDING_OPTIONS, useMediaRecorder } from '../../features/chats/useMediaRecorder.js';
import { saveE2eeWebKey } from '../../features/security/securityApi.js';
import {
  decryptE2eeMessage,
  encryptE2eeAttachment,
  encryptE2eePayload,
  encryptE2eeText,
  isE2eeDesktopSupported,
  parseE2eeAttachmentDescriptor,
  registerE2eeDesktopIdentity,
} from '../../shared/crypto/e2eeDesktop.js';
import { MessageContent, displayMessageType } from './MessageContent.jsx';

const AVATAR_TONES = ['violet', 'coral', 'yellow', 'blue'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];
const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,image/avif,video/mp4,video/webm,video/quicktime,audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain';

function initials(displayName, username) {
  const value = displayName || username || '?';
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function avatarTone(value) {
  const total = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_TONES[total % AVATAR_TONES.length];
}

function locale() {
  return document.documentElement.lang || 'ru';
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatFileSize(value) {
  if (!Number.isFinite(value) || value < 1) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function deliveryStatusLabel(status, t) {
  const key = { sent: 'deliverySent', delivered: 'deliveryDelivered', read: 'deliveryRead' }[status];
  return key ? t(`workspace.chatPanel.${key}`) : '';
}

const DELIVERY_STATUS_PRIORITY = { sent: 1, delivered: 2, read: 3 };

function messageRevisionTime(message) {
  return Math.max(Date.parse(message.edited_at) || 0, Date.parse(message.deleted_at) || 0);
}

function mergeMessage(existing, nextMessage) {
  if (!existing) return nextMessage;
  const preserveDecryptedPayload = existing.encryption_state === 'e2ee_web_v1'
    && ['verified', 'unverified', 'key_changed'].includes(existing.e2ee_status)
    && nextMessage.encryption_state === 'e2ee_web_v1'
    && nextMessage.e2ee_status === 'unavailable';
  const resolvedNextMessage = preserveDecryptedPayload
    ? { ...nextMessage, payload: existing.payload, e2ee_status: existing.e2ee_status, reply_to: existing.reply_to }
    : nextMessage;
  const existingPriority = DELIVERY_STATUS_PRIORITY[existing.delivery_status] ?? 0;
  const nextPriority = DELIVERY_STATUS_PRIORITY[resolvedNextMessage.delivery_status] ?? 0;
  const newestMessage = messageRevisionTime(resolvedNextMessage) >= messageRevisionTime(existing) ? resolvedNextMessage : existing;
  return {
    ...newestMessage,
    delivery_status: nextPriority >= existingPriority ? resolvedNextMessage.delivery_status : existing.delivery_status,
  };
}

function sortMessages(messages) {
  return [...messages].sort((first, second) => {
    const firstTime = Date.parse(first.created_at) || 0;
    const secondTime = Date.parse(second.created_at) || 0;
    return firstTime === secondTime ? String(first.id).localeCompare(String(second.id)) : firstTime - secondTime;
  });
}

function upsertMessage(messages, nextMessage) {
  let found = false;
  const updated = messages.map((message) => {
    if (message.id !== nextMessage.id) return message;
    found = true;
    return mergeMessage(message, nextMessage);
  });
  return sortMessages(found ? updated : [...updated, nextMessage]);
}

function mergeMessages(history, currentMessages) {
  return currentMessages.reduce((merged, message) => upsertMessage(merged, message), sortMessages(history));
}

function syncPinnedState(messages, pinnedMessageId) {
  return messages.map((message) => ({ ...message, is_pinned: message.id === pinnedMessageId }));
}

function messageTypeForUpload(upload) {
  if (upload.suggested_message_type === 'photo') return 'photo';
  if (upload.suggested_message_type === 'video') return 'video';
  return 'file';
}

function messageTypeLabel(message, t) {
  const key = {
    photo: 'photo', video: 'video', video_note: 'videoNote', audio: 'audio', voice: 'voice', file: 'file', sticker: 'sticker', emoji: 'emoji',
  }[displayMessageType(message)];
  return key ? t(`workspace.chatPanel.type${key[0].toUpperCase()}${key.slice(1)}`) : message.payload;
}

function replyPreview(message, t) {
  if (!message || message.deleted_at) return t('workspace.chatPanel.deletedMessage');
  if (message.encryption_state === 'e2ee_web_v1' && !['verified', 'unverified', 'key_changed'].includes(message.e2ee_status)) {
    return t('workspace.chatPanel.encryptedMessage');
  }
  return message.type === 'text' ? message.payload : message.media_name || messageTypeLabel(message, t);
}

function encryptedMessageStatus(message, t) {
  if (message.encryption_state !== 'e2ee_web_v1') return null;
  if (message.e2ee_status === 'verified') return { label: t('workspace.chatPanel.encryptionVerified'), tone: 'verified' };
  if (message.e2ee_status === 'unverified') return { label: t('workspace.chatPanel.encryptionUnverified'), tone: 'unverified' };
  if (message.e2ee_status === 'key_changed') return { label: t('workspace.chatPanel.encryptionKeyChanged'), tone: 'key-changed' };
  return { label: t('workspace.chatPanel.encryptionUnavailable'), tone: 'unavailable' };
}

function directChatEncryptionLabel(status, t) {
  if (status === 'ready') return { label: t('workspace.chatPanel.encryptionTextReady'), tone: 'ready' };
  if (status === 'checking') return { label: t('workspace.chatPanel.encryptionChecking'), tone: 'checking' };
  if (status === 'unsupported') return { label: t('workspace.chatPanel.encryptionUnsupported'), tone: 'unavailable' };
  if (status === 'unavailable') return { label: t('workspace.chatPanel.encryptionUnavailable'), tone: 'unavailable' };
  return { label: t('workspace.chatPanel.encryptionNotReady'), tone: 'unavailable' };
}

async function decryptChatMessage(message, { chatId, currentUserId, identity, chatKeys }) {
  async function decryptOne(item) {
    if (item.encryption_state !== 'e2ee_web_v1') return { ...item, e2ee_status: 'plain' };
    if (!identity || !currentUserId) return { ...item, payload: '', e2ee_status: 'unavailable' };
    const decrypted = await decryptE2eeMessage({
      message: item,
      chatId,
      currentUserId: String(currentUserId),
      identity,
      chatKeys,
    });
    if (!['file', 'voice', 'video_note'].includes(decrypted.type) || !['verified', 'unverified', 'key_changed'].includes(decrypted.e2ee_status)) {
      return decrypted;
    }
    const attachment = parseE2eeAttachmentDescriptor(decrypted.payload);
    const messageTypeMatchesAttachment = (
      (decrypted.type === 'file' && attachment && !attachment.media_kind)
      || (['voice', 'video_note'].includes(decrypted.type) && attachment?.media_kind === decrypted.type)
    );
    return messageTypeMatchesAttachment
      ? { ...decrypted, payload: attachment.caption, e2ee_attachment: attachment }
      : { ...decrypted, payload: '', e2ee_status: 'unavailable' };
  }

  const decrypted = await decryptOne(message);
  if (!message.reply_to) return decrypted;
  return { ...decrypted, reply_to: await decryptOne(message.reply_to) };
}

function realtimeNotice(status, t) {
  if (status === 'reconnecting') return t('workspace.chatPanel.realtimeReconnecting');
  if (status === 'disconnected') return t('workspace.chatPanel.realtimeDisconnected');
  if (status === 'connecting') return t('workspace.chatPanel.realtimeConnecting');
  return t('workspace.chatPanel.historyNotice');
}

function peerPresence(peer, t) {
  if (peer?.is_online) return t('workspace.chatPanel.online');
  if (!peer?.last_seen_at) return t('workspace.chatPanel.offline');
  const lastSeen = new Date(peer.last_seen_at);
  if (Number.isNaN(lastSeen.getTime())) return t('workspace.chatPanel.offline');
  return t('workspace.chatPanel.lastSeen', { date: new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }).format(lastSeen) });
}

function DirectChatPanel({
  accessToken,
  chat,
  currentUserId,
  focusMessage,
  focusMessageId,
  focusRequestId,
  onBack,
  onChatChanged,
  onMessageFocused,
  onMessageSent,
  onRealtimeSend,
  onStartCall,
  canStartCall,
  callState = 'idle',
  realtimeEvents,
  realtimeResyncVersion,
  realtimeStatus,
  t,
}) {
  const [chatState, setChatState] = useState(chat);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState(null);
  const [activity, setActivity] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [composerError, setComposerError] = useState('');
  const [e2eeStatus, setE2eeStatus] = useState(chat.type === 'direct' ? 'checking' : 'inactive');
  const [readRetryVersion, setReadRetryVersion] = useState(0);
  const fileInputRef = useRef(null);
  const isCurrentRef = useRef(true);
  const messagesRef = useRef([]);
  const e2eeCryptoRef = useRef({ identity: null, keys: [] });
  const messageElementRefs = useRef(new Map());
  const processedRealtimeEventIdRef = useRef(0);
  const readMessageIdsRef = useRef(new Set());
  const readRetryTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const activityTimerRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);
  const handledResyncVersionRef = useRef(realtimeResyncVersion);
  const focusedRequestIdRef = useRef(0);
  const focusHighlightTimerRef = useRef(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [recordedMedia, setRecordedMedia] = useState(null);
  const { recording, start: startRecording, stop: stopRecording, cancel: cancelRecording } = useMediaRecorder();
  const recordingVideoRef = useRef(null);
  const peer = chatState.peer;
  const peerName = peer?.display_name || peer?.username || t('workspace.unknownUser');
  const peerUsername = peer?.username || '';
  const isDirectChat = chat.type === 'direct';
  const isE2eeReady = isDirectChat && e2eeStatus === 'ready';
  const isRecording = recording.status !== 'idle';
  const participantIdsKey = (chat.participant_ids || []).map(String).sort().join(':');

  messagesRef.current = messages;

  const prepareDirectChatEncryption = useCallback(async () => {
    if (!isDirectChat) {
      e2eeCryptoRef.current = { identity: null, keys: [] };
      if (isCurrentRef.current) {
        setE2eeStatus('inactive');
      }
      return { identity: null, keys: [] };
    }
    if (!isE2eeDesktopSupported()) {
      e2eeCryptoRef.current = { identity: null, keys: [] };
      if (isCurrentRef.current) {
        setE2eeStatus('unsupported');
      }
      return { identity: null, keys: [] };
    }

    if (isCurrentRef.current) setE2eeStatus('checking');
    try {
      const identity = await registerE2eeDesktopIdentity(
        String(currentUserId),
        (payload) => saveE2eeWebKey(accessToken, payload),
      );
      const keys = await getChatE2eeKeys(accessToken, chat.id);
      const participantIds = new Set((chat.participant_ids || []).map(String));
      const keyParticipantIds = new Set(keys.map((key) => String(key.user_id)));
      const hasCurrentDeviceKey = keys.some((key) => (
        String(key.user_id) === String(currentUserId)
        && key.encryption_public_key === identity.encryptionPublicKey
        && key.signing_public_key === identity.signingPublicKey
      ));
      const status = participantIds.size === 2
        && participantIds.size === keyParticipantIds.size
        && [...participantIds].every((userId) => keyParticipantIds.has(userId))
        && hasCurrentDeviceKey
        ? 'ready'
        : 'waiting';

      e2eeCryptoRef.current = { identity, keys };
      if (isCurrentRef.current) {
        setE2eeStatus(status);
      }
      return { identity, keys };
    } catch {
      e2eeCryptoRef.current = { identity: null, keys: [] };
      if (isCurrentRef.current) {
        setE2eeStatus('unavailable');
      }
      return { identity: null, keys: [] };
    }
  }, [accessToken, chat.id, currentUserId, isDirectChat, participantIdsKey]);

  const decryptWithCurrentCrypto = useCallback(async (message) => {
    return decryptChatMessage(message, {
      chatId: chat.id,
      currentUserId,
      identity: e2eeCryptoRef.current.identity,
      chatKeys: e2eeCryptoRef.current.keys,
    });
  }, [chat.id, currentUserId]);

  const loadMessages = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setIsLoadingMessages(true);
      setHistoryError('');
    }
    try {
      const cryptoContext = await prepareDirectChatEncryption();
      const history = await getChatMessages(accessToken, chat.id);
      const decryptedHistory = await Promise.all((Array.isArray(history) ? history : []).map((message) => decryptChatMessage(message, {
        chatId: chat.id,
        currentUserId,
        identity: cryptoContext.identity,
        chatKeys: cryptoContext.keys,
      })));
      if (isCurrentRef.current) {
        const pinnedMessage = decryptedHistory.find((message) => message.id === chat.pinned_message_id) || chat.pinned_message;
        setChatState((current) => ({ ...current, pinned_message: pinnedMessage }));
        setMessages((current) => mergeMessages(decryptedHistory, current));
        setHistoryError('');
      }
    } catch (requestError) {
      if (isCurrentRef.current && showLoading) setHistoryError(requestError.message);
    } finally {
      if (isCurrentRef.current && showLoading) setIsLoadingMessages(false);
    }
  }, [accessToken, chat.id, currentUserId, prepareDirectChatEncryption]);

  useEffect(() => {
    setChatState((current) => {
      const pinnedMessage = chat.pinned_message_id
        ? messagesRef.current.find((message) => message.id === chat.pinned_message_id)
          || (current?.pinned_message?.id === chat.pinned_message_id ? current.pinned_message : null)
          || chat.pinned_message
        : null;
      return { ...chat, pinned_message: pinnedMessage };
    });
  }, [chat]);

  useEffect(() => {
    isCurrentRef.current = true;
    void loadMessages();
    return () => {
      isCurrentRef.current = false;
      window.clearTimeout(readRetryTimerRef.current);
      window.clearTimeout(typingStopTimerRef.current);
      window.clearTimeout(activityTimerRef.current);
      window.clearTimeout(focusHighlightTimerRef.current);
      onRealtimeSend?.({ event: 'typing.stopped', chat_id: chat.id });
    };
  }, [chat.id, loadMessages, onRealtimeSend]);

  useEffect(() => {
    const preview = recordingVideoRef.current;
    if (!preview) return undefined;
    preview.srcObject = recording.kind === 'video_note' ? recording.stream : null;
    if (recording.stream) void preview.play().catch(() => undefined);
    return () => {
      preview.srcObject = null;
    };
  }, [recording.kind, recording.stream]);

  useEffect(() => {
    if (callState !== 'idle' && isRecording) void cancelRecording();
  }, [callState, cancelRecording, isRecording]);

  useEffect(() => {
    if (!focusMessage || !focusMessageId || !focusRequestId) return undefined;
    let isCancelled = false;

    void (async () => {
      const cryptoContext = await prepareDirectChatEncryption();
      const decryptedMessage = await decryptChatMessage(focusMessage, {
        chatId: chat.id,
        currentUserId,
        identity: cryptoContext.identity,
        chatKeys: cryptoContext.keys,
      });
      if (!isCurrentRef.current || isCancelled) return;
      setMessages((current) => upsertMessage(current, decryptedMessage));
    })();

    return () => {
      isCancelled = true;
    };
  }, [chat.id, currentUserId, focusMessage, focusMessageId, focusRequestId, prepareDirectChatEncryption]);

  useEffect(() => {
    if (!focusMessageId || !focusRequestId || focusedRequestIdRef.current === focusRequestId) return;
    if (!messages.some((message) => message.id === focusMessageId)) return;
    const messageElement = messageElementRefs.current.get(focusMessageId);
    if (!messageElement) return;

    focusedRequestIdRef.current = focusRequestId;
    setHighlightedMessageId(focusMessageId);
    messageElement.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    window.clearTimeout(focusHighlightTimerRef.current);
    focusHighlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 2_400);
    onMessageFocused?.(focusRequestId);
  }, [focusMessageId, focusRequestId, messages, onMessageFocused]);

  useEffect(() => {
    if (realtimeStatus !== 'connected') return;
    onRealtimeSend?.({ event: 'presence.active', chat_id: chat.id });
  }, [chat.id, onRealtimeSend, realtimeStatus]);

  function showActivity(nextActivity, duration = 2_400) {
    window.clearTimeout(activityTimerRef.current);
    setActivity(nextActivity);
    activityTimerRef.current = window.setTimeout(() => setActivity(''), duration);
  }

  useEffect(() => {
    const nextEvents = realtimeEvents.filter((event) => event.id > processedRealtimeEventIdRef.current);
    if (!nextEvents.length) return;

    nextEvents.forEach(({ id, payload }) => {
      processedRealtimeEventIdRef.current = id;
      void (async () => {
        if (payload.chat_id !== chat.id) return;

        if (['message.created', 'message.updated', 'message.deleted', 'message.reactions_updated'].includes(payload.event) && payload.message) {
          const message = await decryptWithCurrentCrypto(payload.message);
          if (!isCurrentRef.current) return;
          setMessages((current) => upsertMessage(current, message));
          if (message.sender_id !== currentUserId) setActivity('');
          return;
        }

        if (payload.event === 'message.pin_updated' && payload.chat) {
          if (!isCurrentRef.current) return;
          const pinnedMessage = messagesRef.current.find((message) => message.id === payload.chat.pinned_message_id) || null;
          setChatState({ ...payload.chat, pinned_message: pinnedMessage });
          setMessages((current) => syncPinnedState(current, payload.chat.pinned_message_id));
          onChatChanged?.();
          return;
        }

        if (payload.event === 'message.read' && payload.message) {
          const message = await decryptWithCurrentCrypto(payload.message);
          if (!isCurrentRef.current) return;
          setMessages((current) => current.map((currentMessage) => {
            if (currentMessage.id !== message.id) return currentMessage;
            if (currentMessage.sender_id === currentUserId && payload.reader_id !== currentUserId) return { ...currentMessage, delivery_status: 'read' };
            return mergeMessage(currentMessage, message);
          }));
          return;
        }

        if (payload.user_id === currentUserId) return;
        if (payload.event === 'typing.started') showActivity(t('workspace.chatPanel.typing'), 3_500);
        if (payload.event === 'file.uploading') showActivity(t('workspace.chatPanel.sendingFile'), 8_000);
        if (payload.event === 'voice.uploading') showActivity(t('workspace.chatPanel.sendingAudio'), 8_000);
        if (payload.event === 'typing.stopped') setActivity('');
        if (payload.event === 'presence.active') showActivity(t('workspace.chatPanel.peerActive'));
        if (payload.event === 'presence.status' && payload.user_id === peer?.id) {
          setChatState((current) => ({
            ...current,
            peer: { ...current.peer, is_online: Boolean(payload.is_online), last_seen_at: payload.last_seen_at ?? current.peer.last_seen_at },
          }));
        }
      })();
    });
  }, [chat.id, currentUserId, decryptWithCurrentCrypto, onChatChanged, peer?.id, realtimeEvents, t]);

  useEffect(() => {
    if (handledResyncVersionRef.current === realtimeResyncVersion) return;
    handledResyncVersionRef.current = realtimeResyncVersion;
    void loadMessages({ showLoading: false });
  }, [loadMessages, realtimeResyncVersion]);

  useEffect(() => {
    if (!accessToken || !currentUserId || isLoadingMessages) return;
    const messageIds = messages
      .filter((message) => !message.deleted_at && message.sender_id !== currentUserId && !readMessageIdsRef.current.has(message.id))
      .map((message) => message.id);
    if (!messageIds.length) return;
    messageIds.forEach((messageId) => readMessageIdsRef.current.add(messageId));

    async function markUnreadMessagesRead() {
      for (let offset = 0; offset < messageIds.length; offset += 100) {
        const messageIdBatch = messageIds.slice(offset, offset + 100);
        try {
          await markMessagesRead(accessToken, chat.id, messageIdBatch);
        } catch {
          messageIdBatch.forEach((messageId) => readMessageIdsRef.current.delete(messageId));
          if (!isCurrentRef.current) return;
          window.clearTimeout(readRetryTimerRef.current);
          readRetryTimerRef.current = window.setTimeout(() => {
            if (isCurrentRef.current) setReadRetryVersion((current) => current + 1);
          }, 2_000);
        }
      }
    }

    void markUnreadMessagesRead();
  }, [accessToken, chat.id, currentUserId, isLoadingMessages, messages, readRetryVersion]);

  function stopTyping() {
    window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    lastTypingSentAtRef.current = 0;
    onRealtimeSend?.({ event: 'typing.stopped', chat_id: chat.id });
  }

  function updateDraft(value) {
    setDraft(value);
    setComposerError('');
    window.clearTimeout(typingStopTimerRef.current);
    if (!value) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 2_500) {
      lastTypingSentAtRef.current = now;
      onRealtimeSend?.({ event: 'typing.started', chat_id: chat.id });
    }
    typingStopTimerRef.current = window.setTimeout(stopTyping, 1_800);
  }

  async function sendMediaMessage() {
    const mediaDraft = recordedMedia || (selectedFile ? { file: selectedFile, kind: null, durationSeconds: null } : null);
    if (!mediaDraft) return;
    const { file, kind, durationSeconds } = mediaDraft;
    onRealtimeSend?.({ event: kind === 'voice' ? 'voice.uploading' : 'file.uploading', chat_id: chat.id });
    if (isE2eeReady) {
      const attachment = await encryptE2eeAttachment({
        file,
        chatId: chat.id,
        senderId: String(currentUserId),
        caption: draft,
        mediaKind: kind,
        durationSeconds,
      });
      const encryptedPayload = await encryptE2eePayload({
        payload: JSON.stringify(attachment.descriptor),
        chatId: chat.id,
        senderId: String(currentUserId),
        recipientKeys: e2eeCryptoRef.current.keys,
        identity: e2eeCryptoRef.current.identity,
      });
      const uploadedMedia = await uploadE2eeAttachment(accessToken, attachment.encryptedFile);
      const message = await sendMessage(accessToken, chat.id, {
        type: kind || 'file',
        text: encryptedPayload,
        reply_to_message_id: replyingTo?.id ?? null,
        media_url: uploadedMedia.media_url,
        encryption_state: 'e2ee_web_v1',
      });
      const decryptedMessage = await decryptWithCurrentCrypto(message);
      setMessages((current) => upsertMessage(current, decryptedMessage));
      setDraft('');
      setSelectedFile(null);
      setRecordedMedia(null);
      setReplyingTo(null);
      stopTyping();
      void onMessageSent?.();
      return;
    }
    const uploadedMedia = await uploadChatMedia(accessToken, file);
    const messageType = kind || messageTypeForUpload(uploadedMedia);
    const message = await sendMessage(accessToken, chat.id, {
      type: messageType,
      text: draft.trim(),
      reply_to_message_id: replyingTo?.id ?? null,
      media_url: uploadedMedia.media_url,
      media_name: uploadedMedia.media_name,
      media_mime_type: uploadedMedia.media_mime_type,
      media_size_bytes: uploadedMedia.media_size_bytes,
      duration_seconds: ['voice', 'video_note'].includes(messageType) ? durationSeconds : null,
    });
    setMessages((current) => upsertMessage(current, message));
    setDraft('');
    setSelectedFile(null);
    setRecordedMedia(null);
    setReplyingTo(null);
    stopTyping();
    void onMessageSent?.();
  }

  async function submitMessage(event) {
    event.preventDefault();
    if (isSending || isLoadingMessages) return;
    const text = (editingMessage ? editText : draft).trim();
    if (!editingMessage && !selectedFile && !recordedMedia && !text) return;
    if (editingMessage && !text) return;

    setComposerError('');
    setIsSending(true);
    try {
      if (editingMessage) {
        const message = await editMessage(accessToken, chat.id, editingMessage.id, text);
        setMessages((current) => upsertMessage(current, message));
        setEditingMessage(null);
        setEditText('');
      } else if (selectedFile || recordedMedia) {
        await sendMediaMessage();
      } else {
        const encryptedPayload = isE2eeReady
          ? await encryptE2eeText({
            text,
            chatId: chat.id,
            senderId: String(currentUserId),
            recipientKeys: e2eeCryptoRef.current.keys,
            identity: e2eeCryptoRef.current.identity,
          })
          : null;
        const message = await sendMessage(accessToken, chat.id, encryptedPayload
          ? {
            type: 'text',
            text: encryptedPayload,
            reply_to_message_id: replyingTo?.id ?? null,
            encryption_state: 'e2ee_web_v1',
          }
          : {
            type: 'text', text, reply_to_message_id: replyingTo?.id ?? null,
          });
        const decryptedMessage = await decryptWithCurrentCrypto(message);
        setMessages((current) => upsertMessage(current, decryptedMessage));
        setDraft('');
        setReplyingTo(null);
        stopTyping();
        void onMessageSent?.();
      }
    } catch (requestError) {
      setComposerError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDelete(message) {
    setComposerError('');
    try {
      const nextMessage = await deleteMessage(accessToken, chat.id, message.id);
      setMessages((current) => upsertMessage(current, nextMessage));
      if (chatState.pinned_message_id === message.id) setChatState((current) => ({ ...current, pinned_message_id: null, pinned_message: null }));
      void onChatChanged?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    }
  }

  async function handlePin(message) {
    setComposerError('');
    try {
      const nextChat = await pinMessage(accessToken, chat.id, message.id);
      setChatState({ ...nextChat, pinned_message: messagesRef.current.find((item) => item.id === nextChat.pinned_message_id) || null });
      setMessages((current) => syncPinnedState(current, nextChat.pinned_message_id));
      void onChatChanged?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    }
  }

  async function handleReaction(message, emoji) {
    setComposerError('');
    try {
      const nextMessage = await reactToMessage(accessToken, chat.id, message.id, emoji);
      setMessages((current) => upsertMessage(current, nextMessage));
      setOpenReactionPickerMessageId(null);
    } catch (requestError) {
      setComposerError(requestError.message);
    }
  }

  function handleFileSelected(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    setComposerError('');
    setRecordedMedia(null);
    setSelectedFile(file);
  }

  function startMediaRecording(kind) {
    if (isLoadingMessages || isSending || editingMessage || selectedFile || recordedMedia || callState !== 'idle') return;
    setComposerError('');
    stopTyping();
    void startRecording(kind)
      .then(({ media, error }) => {
        if (error) {
          setComposerError(error.message);
          return;
        }
        if (media) {
          setSelectedFile(null);
          setRecordedMedia(media);
        }
      })
      .catch((error) => setComposerError(error.message));
  }

  function startEditing(message) {
    if (message.encryption_state === 'e2ee_web_v1') return;
    setEditingMessage(message);
    setEditText(message.payload || '');
    setSelectedFile(null);
    setRecordedMedia(null);
    setReplyingTo(null);
    setOpenReactionPickerMessageId(null);
  }

  function submitOnEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const composerValue = editingMessage ? editText : draft;
  const composerPlaceholder = editingMessage ? t('workspace.chatPanel.editPlaceholder') : t('workspace.chatPanel.composerPlaceholder');
  const directChatEncryption = directChatEncryptionLabel(isDirectChat ? e2eeStatus : 'inactive', t);
  const canRecordMedia = !isLoadingMessages && !isSending && !editingMessage && !selectedFile && !recordedMedia && callState === 'idle';

  return (
    <section className="workspace-chat-panel" aria-labelledby="chat-title">
      <header className="chat-header">
        <button className="chat-back-button" type="button" onClick={onBack}><Icon name="arrow-left" size={18} />{t('workspace.chatPanel.back')}</button>
        <div className="chat-contact-heading">
          <span className={`workspace-avatar is-${avatarTone(peer?.id || chat.id)}`} aria-hidden="true">{initials(peerName, peerUsername)}</span>
          <div><h1 id="chat-title">{peerName}</h1><span>{activity || `${peerUsername ? `@${peerUsername} · ` : ''}${peerPresence(peer, t)}`}</span>{isDirectChat ? <span className={`chat-e2ee-chat-status is-${directChatEncryption.tone}`} title={directChatEncryption.label}><Icon name="shield" size={12} />{directChatEncryption.label}</span> : null}</div>
        </div>
        <div className="chat-header-actions" aria-label={t('workspace.chatPanel.actionsLabel')}>
          <button type="button" title={canStartCall && !isRecording ? t('workspace.chatPanel.startAudio') : t('workspace.chatPanel.callUnavailable')} aria-label={t('workspace.chatPanel.startAudio')} onClick={() => void onStartCall?.(chat, 'audio')} disabled={!canStartCall || isRecording}><Icon name="calls" size={18} /></button>
          <button type="button" title={canStartCall && !isRecording ? t('workspace.chatPanel.startVideo') : t('workspace.chatPanel.callUnavailable')} aria-label={t('workspace.chatPanel.startVideo')} onClick={() => void onStartCall?.(chat, 'video')} disabled={!canStartCall || isRecording}><Icon name="video" size={18} /></button>
          <button type="button" aria-label={t('workspace.chatPanel.refreshHistory')} onClick={() => loadMessages()} disabled={isLoadingMessages || isSending}><Icon name="refresh" size={18} /></button>
        </div>
      </header>

      <div className="chat-history" aria-label={t('workspace.chatPanel.historyLabel')} aria-busy={isLoadingMessages}>
        <div className={`chat-server-notice is-${realtimeStatus}`} role="status" aria-live="polite" aria-atomic="true"><Icon name="shield" size={15} /><span>{realtimeNotice(realtimeStatus, t)}</span></div>
        {chatState.pinned_message ? <div className="chat-pinned-message"><Icon name="pin" size={15} /><span><strong>{t('workspace.chatPanel.pinnedMessage')}</strong><small>{replyPreview(chatState.pinned_message, t)}</small></span></div> : null}
        {historyError ? <div className="chat-history-error" role="alert"><strong>{t('workspace.chatPanel.historyLoadError')}</strong><span>{historyError}</span><button type="button" onClick={() => loadMessages()}>{t('workspace.retry')}</button></div> : null}
          {isLoadingMessages ? <p className="chat-history-status" role="status">{t('workspace.chatPanel.loadingHistory')}</p> : historyError ? null : messages.length ? messages.map((message) => {
            const isMine = message.sender_id === currentUserId;
            const deliveryStatus = isMine ? deliveryStatusLabel(message.delivery_status, t) : '';
            const e2eeMessageStatus = encryptedMessageStatus(message, t);
            return <article ref={(element) => {
              if (element) messageElementRefs.current.set(message.id, element);
              else messageElementRefs.current.delete(message.id);
            }} className={`chat-message ${isMine ? 'is-mine' : ''} ${message.is_pinned ? 'is-pinned' : ''} ${highlightedMessageId === message.id ? 'is-notification-target' : ''}`} key={message.id}>
            <div className="chat-message-bubble">
              {message.reply_to ? <div className="chat-reply-preview"><span>{message.reply_to.sender_id === currentUserId ? t('workspace.chatPanel.you') : peerName}</span><small>{replyPreview(message.reply_to, t)}</small></div> : null}
              <MessageContent accessToken={accessToken} chatId={chat.id} message={message} t={t} />
              {!message.deleted_at && message.reactions?.length ? <div className="chat-reactions">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} aria-pressed={reaction.reacted_by_me} onClick={() => handleReaction(message, reaction.emoji)}>{reaction.emoji}<span>{reaction.count}</span></button>)}</div> : null}
              {!message.deleted_at ? <div className="chat-message-actions">
                <button type="button" onClick={() => setReplyingTo(message)}><Icon name="reply" size={14} />{t('workspace.chatPanel.reply')}</button>
                <button type="button" aria-expanded={openReactionPickerMessageId === message.id} onClick={() => setOpenReactionPickerMessageId((current) => current === message.id ? null : message.id)}><Icon name="smile" size={14} />{t('workspace.chatPanel.react')}</button>
                <button type="button" aria-pressed={message.is_pinned} onClick={() => handlePin(message)}><Icon name="pin" size={14} />{message.is_pinned ? t('workspace.chatPanel.unpin') : t('workspace.chatPanel.pin')}</button>
                {isMine && message.type === 'text' && message.encryption_state !== 'e2ee_web_v1' ? <button type="button" onClick={() => startEditing(message)}><Icon name="edit" size={14} />{t('workspace.chatPanel.edit')}</button> : null}
                {isMine ? <button className="is-danger" type="button" onClick={() => handleDelete(message)}><Icon name="trash" size={14} />{t('workspace.chatPanel.delete')}</button> : null}
              </div> : null}
              {openReactionPickerMessageId === message.id ? <div className="chat-reaction-picker" aria-label={t('workspace.chatPanel.reactionsLabel')}>{REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => handleReaction(message, emoji)}>{emoji}</button>)}</div> : null}
            </div>
            <footer><time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>{message.edited_at && !message.deleted_at ? <span>{t('workspace.chatPanel.edited')}</span> : null}{message.is_pinned ? <span>{t('workspace.chatPanel.pinned')}</span> : null}{e2eeMessageStatus ? <span className={`chat-message-e2ee-status is-${e2eeMessageStatus.tone}`} title={e2eeMessageStatus.label}><Icon name="shield" size={12} />{e2eeMessageStatus.label}</span> : null}{isMine && deliveryStatus ? <span className="chat-delivery-status" title={deliveryStatus}><Icon name="check-double" size={14} /><span className="sr-only">{deliveryStatus}</span></span> : null}</footer>
          </article>;
        }) : <div className="chat-empty-history"><span className={`workspace-avatar workspace-avatar-large is-${avatarTone(peer?.id || chat.id)}`} aria-hidden="true">{initials(peerName, peerUsername)}</span><strong>{t('workspace.chatPanel.noMessagesTitle')}</strong><p>{t('workspace.chatPanel.noMessagesText')}</p></div>}
      </div>

      <div className="chat-composer-area">
        {composerError ? <p className="chat-composer-error" id="chat-message-error" role="alert">{composerError}</p> : null}
        {replyingTo ? <div className="chat-composer-context"><Icon name="reply" size={15} /><span><strong>{t('workspace.chatPanel.replyingTo')}</strong><small>{replyPreview(replyingTo, t)}</small></span><button type="button" aria-label={t('workspace.chatPanel.cancelReply')} onClick={() => setReplyingTo(null)}><Icon name="close" size={15} /></button></div> : null}
        {editingMessage ? <div className="chat-composer-context"><Icon name="edit" size={15} /><span><strong>{t('workspace.chatPanel.editingMessage')}</strong><small>{t('workspace.chatPanel.editHint')}</small></span><button type="button" aria-label={t('workspace.chatPanel.cancelEdit')} onClick={() => { setEditingMessage(null); setEditText(''); }}><Icon name="close" size={15} /></button></div> : null}
        {recordedMedia ? <div className="chat-draft-type"><span><Icon name={recordedMedia.kind === 'voice' ? 'mic' : 'video'} size={16} /></span><div><strong>{recordedMedia.kind === 'voice' ? t('workspace.chatPanel.voiceDraftReady') : t('workspace.chatPanel.videoNoteDraftReady')}</strong><small>{formatDuration(recordedMedia.durationSeconds)} · {formatFileSize(recordedMedia.file.size)}</small></div><button type="button" aria-label={t('workspace.chatPanel.removeAttachment')} onClick={() => setRecordedMedia(null)} disabled={isSending}><Icon name="close" size={15} /></button></div> : null}
        {selectedFile ? <div className="chat-draft-type"><span><Icon name={selectedFile.type.startsWith('image/') ? 'image' : selectedFile.type.startsWith('video/') ? 'video' : 'document'} size={16} /></span><div><strong>{t('workspace.chatPanel.attachmentReady')}</strong><small>{selectedFile.name}{formatFileSize(selectedFile.size) ? ` · ${formatFileSize(selectedFile.size)}` : ''}</small></div><button type="button" aria-label={t('workspace.chatPanel.removeAttachment')} onClick={() => setSelectedFile(null)} disabled={isSending}><Icon name="close" size={15} /></button></div> : null}
        {isRecording ? <div className="chat-recording-panel" role="status" aria-live="polite">
          {recording.kind === 'video_note' ? <video className="chat-recording-preview" ref={recordingVideoRef} muted playsInline /> : <span className="chat-recording-mark"><Icon name="mic" size={19} /></span>}
          <span className="chat-recording-copy"><strong>{recording.kind === 'video_note' ? t('workspace.chatPanel.recordingVideoNote') : t('workspace.chatPanel.recordingVoice')}</strong><small>{recording.status === 'requesting' ? t('workspace.chatPanel.requestingMediaAccess') : `${formatDuration(recording.elapsedSeconds)} / ${formatDuration(RECORDING_OPTIONS[recording.kind].maxDurationSeconds)}`}</small></span>
          <button type="button" className="chat-recording-cancel" onClick={() => void cancelRecording()} aria-label={t('workspace.chatPanel.cancelRecording')} title={t('workspace.chatPanel.cancelRecording')}><Icon name="close" size={16} /></button>
          <button type="button" className="chat-recording-stop" onClick={() => void stopRecording()} disabled={recording.status !== 'recording'} aria-label={t('workspace.chatPanel.stopRecording')} title={t('workspace.chatPanel.stopRecording')}><Icon name="pause" size={16} /></button>
        </div> : null}
        <form className="chat-composer" onSubmit={submitMessage}>
          <input ref={fileInputRef} className="sr-only" type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFileSelected} disabled={isLoadingMessages || isSending || Boolean(editingMessage) || isRecording || Boolean(recordedMedia)} />
          <button className="chat-composer-icon" type="button" aria-label={t('workspace.chatPanel.attachFile')} title={t('workspace.chatPanel.attachFile')} onClick={() => fileInputRef.current?.click()} disabled={isLoadingMessages || isSending || Boolean(editingMessage) || isRecording || Boolean(recordedMedia)}><Icon name="attachment" size={18} /></button>
          <button className="chat-composer-icon" type="button" aria-label={t('workspace.chatPanel.recordVoice')} title={t('workspace.chatPanel.recordVoice')} onClick={() => startMediaRecording('voice')} disabled={!canRecordMedia}><Icon name="mic" size={18} /></button>
          <button className="chat-composer-icon" type="button" aria-label={t('workspace.chatPanel.recordVideoNote')} title={t('workspace.chatPanel.recordVideoNote')} onClick={() => startMediaRecording('video_note')} disabled={!canRecordMedia}><Icon name="video" size={18} /></button>
          <label className="sr-only" htmlFor="chat-message-input">{t('workspace.chatPanel.composerLabel')}</label>
          <textarea id="chat-message-input" value={composerValue} onChange={(event) => editingMessage ? setEditText(event.target.value) : updateDraft(event.target.value)} onKeyDown={submitOnEnter} rows="1" maxLength="4000" placeholder={composerPlaceholder} aria-invalid={Boolean(composerError)} aria-describedby={composerError ? 'chat-message-error' : undefined} disabled={isLoadingMessages || isSending || isRecording} />
          <button className="chat-send-button" type="submit" disabled={(!composerValue.trim() && !selectedFile && !recordedMedia) || isLoadingMessages || isSending || isRecording || (isDirectChat && e2eeStatus === 'checking')} aria-label={isSending ? t('workspace.chatPanel.sending') : editingMessage ? t('workspace.chatPanel.saveEdit') : t('workspace.chatPanel.send')}><Icon name={editingMessage ? 'save' : 'send'} size={18} /></button>
        </form>
        <p className="chat-composer-hint">{editingMessage ? t('workspace.chatPanel.editHint') : t('workspace.chatPanel.composerHint')}<br />{isE2eeReady ? t('workspace.chatPanel.encryptedAttachmentsHint') : t('workspace.chatPanel.attachmentsHint')}</p>
      </div>
    </section>
  );
}

export function ChatPanel(props) {
  if (props.chat.type === 'branch') return <ChannelChatPanel {...props} />;
  return <DirectChatPanel {...props} />;
}
