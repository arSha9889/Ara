import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { NexusLoader } from '../../../shared/ui/NexusLoader.jsx';
import { deleteMessage, editMessage, getChat, getMessages, markMessagesRead, pinMessage, reactToMessage, sendMessage } from '../api/chatApi.js';
import { uploadMedia } from '../api/uploadApi.js';

const REACTION_EMOJIS = [
  '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '😍', '🥰',
  '😁', '😆', '🤣', '😊', '😎', '🤩', '😘', '😋', '😜', '🤪',
  '😇', '🙂', '🙃', '😉', '🤗', '🤭', '🤔', '🫡', '🤝', '💪',
  '🙌', '👌', '✌️', '🤞', '🤟', '🤘', '👀', '💯', '✨', '⭐',
  '🌟', '💫', '⚡', '☄️', '💥', '🎉', '🎊', '🏆', '🥇', '💎',
  '🚀', '🌈', '☀️', '🌙', '🫶', '💖', '💙', '💜', '🧡', '💚',
  '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💘', '😱',
  '😳', '🥺', '😭', '😤', '😡', '🤯', '😴', '🤤', '🤠', '🥳',
  '😈', '👻', '🤖', '👽', '🙈', '🙉', '🙊', '🐱', '🐶', '🦊',
  '🐼', '🦄', '🍀', '🌹', '🍕', '🍓', '🍿', '☕', '🎵', '🎮',
];
const MEDIA_MESSAGE_TYPES = ['photo', 'video', 'video_note', 'voice', 'file'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appendUniqueMessage(messages, nextMessage) {
  if (messages.some((message) => message.id === nextMessage.id)) {
    return messages;
  }
  return [...messages, nextMessage];
}

function upsertMessage(messages, nextMessage) {
  return messages.map((message) => (message.id === nextMessage.id ? nextMessage : message));
}

function syncPinnedState(messages, pinnedMessageId) {
  return messages.map((message) => ({ ...message, is_pinned: message.id === pinnedMessageId }));
}

function upsertMessageKeepingStatus(messages, nextMessage) {
  return messages.map((message) => (
    message.id === nextMessage.id ? { ...nextMessage, delivery_status: message.delivery_status } : message
  ));
}

function formatVoiceTime(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function VoiceMessage({ message, t }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const duration = message.duration_seconds || audioRef.current?.duration || 0;

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    const nextDuration = audio.duration || duration || 0;
    setCurrentTime(audio.currentTime || 0);
    setProgress(nextDuration ? Math.min(1, audio.currentTime / nextDuration) : 0);
  }

  function handleEnded() {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }

  return (
    <div className={`voice-message ${isPlaying ? 'is-playing' : ''}`} style={{ '--voice-progress': progress }}>
      <button className="voice-message-icon" type="button" onClick={togglePlayback} aria-label={isPlaying ? t('messages.pauseVoice') : t('messages.playVoice')}>
        <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>
      </button>
      <div className="voice-message-body">
        <div className="voice-message-head">
          <span>{t('messages.voice')}</span>
          <time>{formatVoiceTime(isPlaying ? currentTime : duration)}</time>
        </div>
        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} style={{ '--bar-index': index }} />
          ))}
        </div>
      </div>
      <audio ref={audioRef} src={message.media_url} preload="metadata" onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} />
    </div>
  );
}

function VideoNoteMessage({ message, t }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const duration = message.duration_seconds || videoRef.current?.duration || 0;

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      return;
    }
    video.pause();
    setIsPlaying(false);
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = video.duration || duration || 0;
    setProgress(nextDuration ? Math.min(1, video.currentTime / nextDuration) : 0);
  }

  function handleEnded() {
    setIsPlaying(false);
    setProgress(0);
  }

  return (
    <button className={`video-note ${isPlaying ? 'is-playing' : ''}`} type="button" onClick={togglePlayback} aria-label={isPlaying ? t('messages.pauseVideoNote') : t('messages.playVideoNote')} style={{ '--video-note-progress': progress }}>
      <video ref={videoRef} src={message.media_url} playsInline preload="metadata" onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} />
      <span className="video-note-ring" aria-hidden="true" />
      <span className="video-note-play" aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>
      <span className="video-note-duration">{formatVoiceTime(duration)}</span>
    </button>
  );
}

function renderMessageContent(message, t) {
  if (message.deleted_at) {
    return <span className="deleted-message-text">{t('messages.deleted')}</span>;
  }
  if (message.type === 'photo') {
    return <img className="message-media" src={message.media_url} alt={message.media_name || t('messages.photoAlt')} />;
  }
  if (message.type === 'video') {
    return <video className="message-media" src={message.media_url} controls />;
  }
  if (message.type === 'video_note') {
    return <VideoNoteMessage message={message} t={t} />;
  }
  if (message.type === 'voice') {
    return <VoiceMessage message={message} t={t} />;
  }
  if (message.type === 'file') {
    return (
      <a className="file-message" href={message.media_url} target="_blank" rel="noreferrer">
        📎 {message.media_name || t('messages.file')}
      </a>
    );
  }
  return message.payload;
}

function deliveryStatusView(status, t) {
  if (status === 'read') {
    return { icon: '✓✓', label: t('messages.read'), tone: 'read' };
  }
  if (status === 'delivered') {
    return { icon: '✓✓', label: t('messages.delivered'), tone: 'delivered' };
  }
  if (status === 'sent') {
    return { icon: '✓', label: t('messages.sent'), tone: 'sent' };
  }
  return { icon: '◷', label: t('messages.sending'), tone: 'pending' };
}

function DeliveryStatus({ status, t }) {
  const view = deliveryStatusView(status, t);
  return (
    <span className={`delivery-status ${view.tone}`} aria-label={view.label} title={view.label}>
      {view.icon}
    </span>
  );
}

function realtimeStatusView(status, t) {
  if (status === true || status === 'online') {
    return { label: t('messages.online'), tone: 'online' };
  }
  if (status === 'connecting') {
    return { label: t('messages.connecting'), tone: 'connecting' };
  }
  return { label: t('messages.offline'), tone: 'offline' };
}

function acceptedFileTypes() {
  return 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,text/plain';
}

function messageTypeForFile(file) {
  if (!file) return 'text';
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'file';
  return 'file';
}

function isValidChatId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function safeSocketSend(socket, payload) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // Socket may close during route changes or browser refresh. The next connection will resync state.
  }
}

function previewPinnedMessage(message, t) {
  if (!message) return '';
  if (message.type === 'photo') return t('messages.photoAlt');
  if (message.type === 'voice') return t('messages.voice');
  if (message.type === 'video_note') return t('messages.videoNote');
  if (message.type === 'file') return message.media_name || t('messages.file');
  if (message.type === 'video') return t('messages.video');
  return message.payload;
}

function isInteractiveMessageTarget(target) {
  return Boolean(target.closest('button, a, input, label, form, .message-actions, .reaction-row'));
}

export function ChatPage() {
  const { t } = useI18n();
  const { chatId } = useParams();
  const { markMessageNotificationsRead } = useNotifications();
  const { session } = useSession();
  const [messages, setMessages] = useState([]);
  const [chat, setChat] = useState(null);
  const [socket, setSocket] = useState(null);
  const [text, setText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [selectedFile, setSelectedFile] = useState(null);
  const [durationSeconds, setDurationSeconds] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [videoRecordingSeconds, setVideoRecordingSeconds] = useState(0);
  const [error, setError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [activityText, setActivityText] = useState('');
  const [activityType, setActivityType] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState(null);
  const [isComposerEmojiPickerOpen, setIsComposerEmojiPickerOpen] = useState(false);
  const [recordingMode, setRecordingMode] = useState('voice');
  const [isRecordMenuOpen, setIsRecordMenuOpen] = useState(false);
  const mediaRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const videoRecordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const videoRecordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const videoRecordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordingCancelledRef = useRef(false);
  const videoRecordingCancelledRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);
  const messageListRef = useRef(null);
  const pendingReadMessageIdsRef = useRef(new Set());
  const readTimerRef = useRef(null);
  const recordHoldTimerRef = useRef(null);
  const recordHoldTriggeredRef = useRef(false);
  const recordPressActiveRef = useRef(false);
  const suppressRecordClickRef = useRef(false);
  const stopAfterPendingRecordStartRef = useRef(false);
  const cancelAfterPendingRecordStartRef = useRef(false);
  const isChatIdValid = isValidChatId(chatId);
  const isSavedChat = chat?.type === 'saved';
  const peerStatus = realtimeStatusView(isSavedChat ? false : chat?.peer?.is_online ?? 'connecting', t);
  const chatDisplayTitle = isSavedChat ? t('chats.savedTitle') : chat?.peer?.display_name || chat?.peer?.username || t('chats.directChat');
  const chatDisplaySubtitle = isSavedChat ? t('chats.savedHeaderSubtitle') : chat?.peer?.username ? `@${chat.peer.username}` : t('chats.directChat');

  async function loadMessages() {
    if (!isChatIdValid) return;
    try {
      setIsLoadingMessages(true);
      const [chatDetails, items] = await Promise.all([
        getChat(session.accessToken, chatId),
        getMessages(session.accessToken, chatId),
      ]);
      setChat(chatDetails);
      setMessages(items);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (!isChatIdValid) {
      setMessages([]);
      setChat(null);
      setError('');
      setRealtimeStatus('invalid_chat');
      return undefined;
    }
    loadMessages().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, isChatIdValid, session.accessToken]);

  useEffect(() => {
    if (!session.accessToken || !chatId || !isChatIdValid) return undefined;
    let isActive = true;
    let reconnectAttempts = 0;

    function connect() {
      const socket = createRealtimeConnection(session.accessToken);
      setSocket(socket);
      setRealtimeStatus(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

      socket.addEventListener('open', () => {
        reconnectAttempts = 0;
        safeSocketSend(socket, { event: 'chat.subscribe', chat_id: chatId });
        safeSocketSend(socket, { event: 'presence.active', chat_id: chatId });
        loadMessages().catch(() => setIsLoadingMessages(false));
      });
      socket.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data);
        if (payload.event === 'connection.authenticated') {
          setRealtimeStatus('connected');
        }
        if (payload.event === 'chat.subscribed') {
          setRealtimeStatus('subscribed');
        }
        if (payload.event === 'message.created' && payload.chat_id === chatId) {
          setMessages((current) => appendUniqueMessage(current, payload.message));
          if (payload.message.sender_id !== session.user?.id) {
            setActivityText('');
          }
        }
        if (payload.event === 'message.reactions_updated' && payload.chat_id === chatId) {
          setMessages((current) => upsertMessageKeepingStatus(current, payload.message));
        }
        if ((payload.event === 'message.updated' || payload.event === 'message.deleted') && payload.chat_id === chatId) {
          setMessages((current) => upsertMessageKeepingStatus(current, payload.message));
          if (payload.message.deleted_at) {
            setChat((current) => current?.pinned_message_id === payload.message.id ? { ...current, pinned_message_id: null, pinned_message: null } : current);
          }
        }
        if (payload.event === 'message.pin_updated' && payload.chat_id === chatId) {
          setChat(payload.chat);
          setMessages((current) => syncPinnedState(current, payload.chat.pinned_message_id));
        }
        if (payload.event === 'message.read' && payload.chat_id === chatId) {
          setMessages((current) => current.map((message) => {
            if (message.id !== payload.message.id) return message;
            if (message.sender_id === session.user?.id && payload.reader_id !== session.user?.id) {
              return { ...message, delivery_status: 'read' };
            }
            return payload.message;
          }));
        }
        if (payload.event === 'typing.started' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText(t('messages.typing'));
          setActivityType('typing');
        }
        if (payload.event === 'file.uploading' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText(t('messages.sendingFile'));
          setActivityType('file');
        }
        if (payload.event === 'voice.uploading' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText(t('messages.sendingVoice'));
          setActivityType('voice');
        }
        if (payload.event === 'typing.stopped' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText('');
          setActivityType('');
        }
        if (payload.event === 'presence.active' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText(t('messages.peerActive'));
          setActivityType('active');
          window.setTimeout(() => {
            setActivityText('');
            setActivityType('');
          }, 2400);
        }
        if (payload.event === 'presence.status' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setChat((current) => current?.peer?.id === payload.user_id
            ? { ...current, peer: { ...current.peer, is_online: Boolean(payload.is_online) } }
            : current);
          if (!payload.is_online) {
            setActivityText('');
            setActivityType('');
          }
        }
        if (payload.event?.startsWith('error.')) {
          setError(payload.reason ?? payload.event);
        }
      });
      socket.addEventListener('close', () => {
        setRealtimeStatus('disconnected');
        if (!isActive) return;
        reconnectAttempts += 1;
        const delay = Math.min(1000 * reconnectAttempts, 5000);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      });
      socket.addEventListener('error', () => setRealtimeStatus('error'));
    }

    connect();

    return () => {
      isActive = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setSocket((currentSocket) => {
        safeSocketSend(currentSocket, { event: 'chat.unsubscribe', chat_id: chatId });
        currentSocket?.close();
        return null;
      });
      setSocket(null);
    };
  }, [chatId, isChatIdValid, session.accessToken, session.user?.id]);

  useEffect(() => () => {
    cancelVoiceRecording();
    cancelVideoRecording();
    if (recordHoldTimerRef.current) window.clearTimeout(recordHoldTimerRef.current);
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !messages.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          pendingReadMessageIdsRef.current.add(entry.target.dataset.messageId);
        }
      }
      if (!pendingReadMessageIdsRef.current.size || readTimerRef.current) return;
      readTimerRef.current = window.setTimeout(() => {
        const messageIds = [...pendingReadMessageIdsRef.current];
        pendingReadMessageIdsRef.current.clear();
        readTimerRef.current = null;
        markMessagesRead(session.accessToken, chatId, messageIds)
          .then(() => markMessageNotificationsRead(chatId, messageIds))
          .catch(() => undefined);
      }, 150);
    }, { root: list, threshold: [0.5] });

    list.querySelectorAll('[data-incoming-message="true"]').forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      if (readTimerRef.current) {
        window.clearTimeout(readTimerRef.current);
        readTimerRef.current = null;
      }
    };
  }, [chatId, messages, session.accessToken]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages.length, activityText, isLoadingMessages]);

  async function sendMediaMessage(file, type, mediaDurationSeconds = null, { clearComposer = false, messageText = '' } = {}) {
    setError('');
    setIsUploading(true);
    try {
      safeSocketSend(socket, { event: type === 'voice' ? 'voice.uploading' : 'file.uploading', chat_id: chatId });
      const uploadedMedia = await uploadMedia(session.accessToken, file);
      const message = await sendMessage(session.accessToken, chatId, {
        type,
        text: messageText,
        media_url: uploadedMedia?.media_url ?? null,
        media_name: uploadedMedia?.media_name ?? null,
        media_mime_type: uploadedMedia?.media_mime_type ?? null,
        media_size_bytes: uploadedMedia?.media_size_bytes ?? null,
        duration_seconds: ['voice', 'video_note'].includes(type) && mediaDurationSeconds ? Number(mediaDurationSeconds) : null,
      });
      setMessages((current) => appendUniqueMessage(current, message));
      if (clearComposer) {
        setText('');
        clearSelectedMedia();
      }
      safeSocketSend(socket, { event: 'typing.stopped', chat_id: chatId });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      safeSocketSend(socket, { event: 'typing.stopped', chat_id: chatId });
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (messageType === 'text' && !text.trim()) return;
    if (MEDIA_MESSAGE_TYPES.includes(messageType) && !selectedFile) return;
    if (isRecording || isVideoRecording) return;
    const isMediaMessage = MEDIA_MESSAGE_TYPES.includes(messageType);
    setError('');
    setIsUploading(true);
    try {
      if (isMediaMessage) {
        await sendMediaMessage(selectedFile, messageType, durationSeconds, {
          clearComposer: true,
          messageText: messageType === 'emoji' ? text : text.trim(),
        });
        return;
      }
      const message = await sendMessage(session.accessToken, chatId, {
        type: messageType,
        text: messageType === 'emoji' ? text : text.trim(),
        media_url: null,
        media_name: null,
        media_mime_type: null,
        media_size_bytes: null,
        duration_seconds: null,
      });
      setMessages((current) => appendUniqueMessage(current, message));
      setText('');
      clearSelectedMedia();
      safeSocketSend(socket, { event: 'typing.stopped', chat_id: chatId });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      if (isMediaMessage) {
        safeSocketSend(socket, { event: 'typing.stopped', chat_id: chatId });
      }
    }
  }

  function startEditing(message) {
    setEditingMessage(message);
    setEditText(message.payload || '');
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingMessage || !editText.trim()) return;
    setError('');
    try {
      const message = await editMessage(session.accessToken, chatId, editingMessage.id, editText.trim());
      setMessages((current) => upsertMessage(current, message));
      setEditingMessage(null);
      setEditText('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(messageId) {
    setError('');
    try {
      const message = await deleteMessage(session.accessToken, chatId, messageId);
      setMessages((current) => upsertMessage(current, message));
      setChat((current) => current?.pinned_message_id === messageId ? { ...current, pinned_message_id: null, pinned_message: null } : current);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePin(messageId) {
    setError('');
    try {
      const nextChat = await pinMessage(session.accessToken, chatId, messageId);
      setChat(nextChat);
      setMessages((current) => syncPinnedState(current, nextChat.pinned_message_id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReaction(messageId, emoji) {
    try {
      const message = await reactToMessage(session.accessToken, chatId, messageId, emoji);
      setMessages((current) => upsertMessage(current, message));
      setOpenReactionPickerMessageId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleMessageBubbleClick(event, message) {
    if (message.deleted_at || isInteractiveMessageTarget(event.target)) return;
    setOpenReactionPickerMessageId((current) => current === message.id ? null : message.id);
  }

  function handleMessageBubbleKeyDown(event, message) {
    if (message.deleted_at || isInteractiveMessageTarget(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setOpenReactionPickerMessageId((current) => current === message.id ? null : message.id);
  }

  function handleTextChange(value) {
    if (!selectedFile && messageType === 'emoji') {
      setMessageType('text');
    }
    setText(value);
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (!value) {
      lastTypingSentAtRef.current = 0;
      safeSocketSend(socket, { event: 'typing.stopped', chat_id: chatId });
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 2500) {
      lastTypingSentAtRef.current = now;
      safeSocketSend(socket, { event: 'typing.started', chat_id: chatId });
    }
    typingStopTimerRef.current = window.setTimeout(() => {
      lastTypingSentAtRef.current = 0;
      safeSocketSend(socket, { event: 'typing.stopped', chat_id: chatId });
      typingStopTimerRef.current = null;
    }, 1800);
  }

  function clearSelectedMedia() {
    setSelectedFile(null);
    setDurationSeconds('');
    setRecordingSeconds(0);
    setVideoRecordingSeconds(0);
    setMessageType('text');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleFileChange(file) {
    setSelectedFile(file ?? null);
    setMessageType(messageTypeForFile(file));
    setDurationSeconds('');
    setVideoRecordingSeconds(0);
  }

  function selectedRecordingLabel() {
    return recordingMode === 'video_note' ? t('messages.videoNote') : t('messages.voiceMessage');
  }

  function selectedRecordingIcon() {
    return recordingMode === 'video_note' ? '◉' : '🎙';
  }

  function startSelectedRecording() {
    setIsRecordMenuOpen(false);
    if (recordingMode === 'video_note') {
      startVideoRecording();
      return;
    }
    startVoiceRecording();
  }

  function stopActiveRecording() {
    if (videoRecorderRef.current || isVideoRecording) {
      stopVideoRecording();
      return;
    }
    if (mediaRecorderRef.current || isRecording) {
      stopVoiceRecording();
    }
  }

  function cancelActiveRecording() {
    if (videoRecorderRef.current || isVideoRecording) {
      cancelVideoRecording();
      return;
    }
    if (mediaRecorderRef.current || isRecording) {
      cancelVoiceRecording();
    }
  }

  function handleRecordPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isRecording || isVideoRecording || isUploading) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    recordPressActiveRef.current = true;
    recordHoldTriggeredRef.current = false;
    stopAfterPendingRecordStartRef.current = false;
    cancelAfterPendingRecordStartRef.current = false;
    if (recordHoldTimerRef.current) window.clearTimeout(recordHoldTimerRef.current);
    recordHoldTimerRef.current = window.setTimeout(() => {
      if (!recordPressActiveRef.current) return;
      recordHoldTriggeredRef.current = true;
      suppressRecordClickRef.current = true;
      startSelectedRecording();
    }, 320);
  }

  function handleRecordPointerUp() {
    recordPressActiveRef.current = false;
    if (recordHoldTimerRef.current) {
      window.clearTimeout(recordHoldTimerRef.current);
      recordHoldTimerRef.current = null;
    }
    if (recordHoldTriggeredRef.current) {
      stopActiveRecording();
      if (!mediaRecorderRef.current && !videoRecorderRef.current) {
        stopAfterPendingRecordStartRef.current = true;
      }
      window.setTimeout(() => {
        suppressRecordClickRef.current = false;
      }, 0);
    }
  }

  function handleRecordPointerCancel() {
    recordPressActiveRef.current = false;
    if (recordHoldTimerRef.current) {
      window.clearTimeout(recordHoldTimerRef.current);
      recordHoldTimerRef.current = null;
    }
    if (recordHoldTriggeredRef.current) {
      cancelActiveRecording();
      if (!mediaRecorderRef.current && !videoRecorderRef.current) {
        cancelAfterPendingRecordStartRef.current = true;
      }
      suppressRecordClickRef.current = false;
    }
  }

  function handleRecordButtonClick() {
    if (suppressRecordClickRef.current) {
      suppressRecordClickRef.current = false;
      return;
    }
    if (isRecording || isVideoRecording) {
      stopActiveRecording();
      return;
    }
    setIsRecordMenuOpen((current) => !current);
  }

  function chooseRecordingMode(nextMode) {
    setRecordingMode(nextMode);
    setIsRecordMenuOpen(false);
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('messages.voiceUnsupported'));
      return;
    }

    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recordingCancelledRef.current = false;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        if (recordingCancelledRef.current) {
          stopRecordingTracks();
          recordingChunksRef.current = [];
          return;
        }
        const mimeType = recorder.mimeType || 'audio/webm';
        const recordedSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        setRecordingSeconds(recordedSeconds);
        stopRecordingTracks();
        void sendMediaMessage(file, 'voice', recordedSeconds);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      clearSelectedMedia();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)));
      }, 500);
      if (stopAfterPendingRecordStartRef.current) {
        stopAfterPendingRecordStartRef.current = false;
        stopVoiceRecording();
      }
      if (cancelAfterPendingRecordStartRef.current) {
        cancelAfterPendingRecordStartRef.current = false;
        cancelVoiceRecording();
      }
    } catch (err) {
      setError(err.message || t('messages.voiceStartError'));
      stopRecordingTracks();
    }
  }

  function stopVoiceRecording() {
    recordingCancelledRef.current = false;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingTracks();
    }
  }

  function cancelVoiceRecording() {
    recordingCancelledRef.current = true;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingTracks();
    }
  }

  function stopRecordingTracks() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  async function startVideoRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('messages.videoNoteUnsupported'));
      return;
    }

    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      });
      const recorder = new MediaRecorder(stream);
      videoRecordingChunksRef.current = [];
      videoRecordingCancelledRef.current = false;
      videoRecordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoRecordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        if (videoRecordingCancelledRef.current) {
          stopVideoRecordingTracks();
          videoRecordingChunksRef.current = [];
          return;
        }
        const mimeType = recorder.mimeType || 'video/webm';
        const recordedSeconds = Math.max(1, Math.round((Date.now() - videoRecordingStartedAtRef.current) / 1000));
        const blob = new Blob(videoRecordingChunksRef.current, { type: mimeType });
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `video-note-${Date.now()}.${extension}`, { type: mimeType });
        setVideoRecordingSeconds(recordedSeconds);
        stopVideoRecordingTracks();
        void sendMediaMessage(file, 'video_note', recordedSeconds);
      };
      videoRecorderRef.current = recorder;
      recorder.start();
      clearSelectedMedia();
      setIsVideoRecording(true);
      setVideoRecordingSeconds(0);
      videoRecordingTimerRef.current = window.setInterval(() => {
        setVideoRecordingSeconds(Math.max(1, Math.round((Date.now() - videoRecordingStartedAtRef.current) / 1000)));
      }, 500);
      if (stopAfterPendingRecordStartRef.current) {
        stopAfterPendingRecordStartRef.current = false;
        stopVideoRecording();
      }
      if (cancelAfterPendingRecordStartRef.current) {
        cancelAfterPendingRecordStartRef.current = false;
        cancelVideoRecording();
      }
    } catch (err) {
      setError(err.message || t('messages.videoNoteStartError'));
      stopVideoRecordingTracks();
    }
  }

  function stopVideoRecording() {
    videoRecordingCancelledRef.current = false;
    if (videoRecorderRef.current?.state === 'recording') {
      videoRecorderRef.current.stop();
    } else {
      stopVideoRecordingTracks();
    }
  }

  function cancelVideoRecording() {
    videoRecordingCancelledRef.current = true;
    if (videoRecorderRef.current?.state === 'recording') {
      videoRecorderRef.current.stop();
    } else {
      stopVideoRecordingTracks();
    }
  }

  function stopVideoRecordingTracks() {
    if (videoRecordingTimerRef.current) {
      window.clearInterval(videoRecordingTimerRef.current);
      videoRecordingTimerRef.current = null;
    }
    videoRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    videoRecorderRef.current = null;
    setIsVideoRecording(false);
  }

  if (!isChatIdValid) {
    return (
      <section className="panel chat-panel">
        <div className="empty-state">
          <h1>{t('messages.chatNotFound')}</h1>
          <p>{t('messages.chatNotFoundText')}</p>
          <Link className="button button-secondary" to="/app">{t('messages.backToChats')}</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel chat-panel">
      <header className="chat-header">
        <div className="chat-avatar-wrap">
          {isSavedChat ? (
            <div className="avatar saved-avatar" aria-hidden="true">★</div>
          ) : (
            <UserAvatar profile={chat?.peer} fallback={chat?.peer?.display_name?.[0] || chat?.peer?.username?.[0] || 'N'} />
          )}
          {!isSavedChat ? <span className={`presence-dot ${peerStatus.tone}`} aria-hidden="true" /> : null}
        </div>
        <div>
          <h1>{chatDisplayTitle}</h1>
          <div className="chat-subtitle">
            <span>{chatDisplaySubtitle}</span>
            {!isSavedChat ? (
              <span className={`presence-pill ${peerStatus.tone}`}>
                <span aria-hidden="true" />
                {peerStatus.label}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {chat?.pinned_message ? (
        <button className="pinned-message-bar" type="button" onClick={() => document.getElementById(`message-${chat.pinned_message_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <span className="pinned-message-icon" aria-hidden="true">📌</span>
          <span className="pinned-message-copy">
            <strong>{t('messages.pinned')}</strong>
            <span>{previewPinnedMessage(chat.pinned_message, t)}</span>
          </span>
          <span className="pinned-message-jump" aria-hidden="true">↗</span>
        </button>
      ) : null}
      <div className="message-list" ref={messageListRef}>
        {isLoadingMessages ? <NexusLoader compact title={t('messages.openingTitle')} text={t('messages.openingText')} /> : null}
        {messages.map((message) => (
          <article
            id={`message-${message.id}`}
            data-message-id={message.id}
            data-incoming-message={message.sender_id !== session.user?.id}
            className={`message-bubble ${message.sender_id === session.user?.id ? 'outgoing' : 'incoming'} ${message.deleted_at ? 'deleted' : ''} ${message.is_pinned ? 'pinned' : ''}`}
            key={message.id}
            role={!message.deleted_at ? 'button' : undefined}
            tabIndex={!message.deleted_at ? 0 : undefined}
            onClick={(event) => handleMessageBubbleClick(event, message)}
            onKeyDown={(event) => handleMessageBubbleKeyDown(event, message)}
            aria-label={!message.deleted_at ? t('messages.openReactions') : undefined}
          >
            {!message.deleted_at ? (
              <div className="message-actions">
                <button className="message-action-button" type="button" onClick={() => handlePin(message.id)} aria-label={message.is_pinned ? t('messages.unpin') : t('messages.pin')} title={message.is_pinned ? t('messages.unpin') : t('messages.pin')}>
                  <span aria-hidden="true">{message.is_pinned ? '↧' : '📌'}</span>
                  <span className="action-label">{message.is_pinned ? t('messages.unpin') : t('messages.pin')}</span>
                </button>
                {message.sender_id === session.user?.id && message.type === 'text' ? (
                  <button className="message-action-button" type="button" onClick={() => startEditing(message)} aria-label={t('messages.edit')} title={t('messages.edit')}>
                    <span aria-hidden="true">✎</span>
                    <span className="action-label">{t('messages.edit')}</span>
                  </button>
                ) : null}
                {message.sender_id === session.user?.id ? (
                  <button className="message-action-button danger" type="button" onClick={() => handleDelete(message.id)} aria-label={t('messages.delete')} title={t('messages.delete')}>
                    <span aria-hidden="true">🗑</span>
                    <span className="action-label">{t('messages.delete')}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            {editingMessage?.id === message.id ? (
              <form className="message-edit-form" onSubmit={handleEditSubmit}>
                <input className="message-edit-input" value={editText} onChange={(event) => setEditText(event.target.value)} autoFocus />
                <div className="message-edit-actions">
                  <button className="message-edit-button save" type="submit" aria-label={t('messages.save')}>
                    <span aria-hidden="true">✓</span>
                    <span>{t('messages.save')}</span>
                  </button>
                  <button className="message-edit-button cancel" type="button" onClick={() => setEditingMessage(null)} aria-label={t('messages.cancel')}>
                    <span aria-hidden="true">×</span>
                    <span>{t('messages.cancel')}</span>
                  </button>
                </div>
              </form>
            ) : <div>{renderMessageContent(message, t)}</div>}
            <div className="message-meta">
              {message.is_pinned ? <span>{t('messages.pinnedShort')}</span> : null}
              {message.edited_at && !message.deleted_at ? <span>{t('messages.edited')}</span> : null}
              {message.sender_id === session.user?.id ? <DeliveryStatus status={message.delivery_status} t={t} /> : null}
            </div>
            {!message.deleted_at ? <div className="reaction-row">
              {message.reactions?.map((reaction) => (
                <button className={`reaction-chip ${reaction.reacted_by_me ? 'active' : ''}`} type="button" key={reaction.emoji} onClick={() => handleReaction(message.id, reaction.emoji)}>
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
              {openReactionPickerMessageId === message.id ? (
                <div className="reaction-picker" role="menu" aria-label={t('messages.reactionPicker')}>
                  <div className="reaction-picker-head">
                    <strong>{t('messages.reactionPicker')}</strong>
                    <button type="button" onClick={() => setOpenReactionPickerMessageId(null)} aria-label={t('messages.closeReactions')}>×</button>
                  </div>
                  <div className="reaction-picker-grid">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button className="reaction-button" type="button" role="menuitem" key={emoji} onClick={() => handleReaction(message.id, emoji)}>{emoji}</button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div> : null}
          </article>
        ))}
        {activityText ? (
          <div className={`chat-activity-line ${activityType || 'active'}`} aria-live="polite">
            <span className="chat-activity-icon" aria-hidden="true">
              {activityType === 'file' ? '📎' : activityType === 'voice' ? (
                <span className="activity-wave">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <span className="activity-dots">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </span>
            <span>{activityText}</span>
          </div>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>
      <form className="composer" onSubmit={handleSend}>
        <div className="composer-input-shell">
          <label className="composer-icon-button attachment-button" aria-label={t('messages.attachFile')} title={t('messages.attachFileTitle')}>
            <span aria-hidden="true">＋</span>
            <input ref={fileInputRef} type="file" accept={acceptedFileTypes()} onChange={(event) => handleFileChange(event.target.files?.[0])} />
          </label>
          <input className="composer-input" placeholder={t('messages.placeholder')} value={text} onChange={(event) => handleTextChange(event.target.value)} />
          <div className="composer-emoji-wrap">
            <button
              className={`composer-icon-button composer-emoji-button ${isComposerEmojiPickerOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setIsComposerEmojiPickerOpen((current) => !current)}
              aria-expanded={isComposerEmojiPickerOpen}
              aria-label={t('messages.openEmojiPanel')}
              title={t('messages.openEmojiPanel')}
            >
              <span aria-hidden="true">☺</span>
            </button>
            {isComposerEmojiPickerOpen ? (
              <div className="composer-emoji-panel" role="menu" aria-label={t('messages.emojiPanel')}>
                <div className="reaction-picker-head">
                  <strong>{t('messages.emojiPanel')}</strong>
                  <button type="button" onClick={() => setIsComposerEmojiPickerOpen(false)} aria-label={t('messages.closeReactions')}>×</button>
                </div>
                <div className="reaction-picker-grid">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      className="reaction-button"
                      type="button"
                      role="menuitem"
                      key={emoji}
                      onClick={() => {
                        setMessageType('emoji');
                        setText(emoji);
                        setIsComposerEmojiPickerOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="record-control-wrap">
            <button
              className={`composer-icon-button record-button ${recordingMode === 'video_note' ? 'video-mode' : 'voice-mode'} ${isRecording || isVideoRecording ? 'is-recording' : ''}`}
              type="button"
              onClick={handleRecordButtonClick}
              onPointerDown={handleRecordPointerDown}
              onPointerUp={handleRecordPointerUp}
              onPointerCancel={handleRecordPointerCancel}
              disabled={isUploading}
              aria-expanded={isRecordMenuOpen}
              aria-label={isRecording || isVideoRecording ? t('messages.stopRecording') : t('messages.openRecordMenu')}
              title={isRecording || isVideoRecording ? t('messages.releaseToSend') : `${selectedRecordingLabel()} · ${t('messages.holdToRecord')}`}
            >
              <span aria-hidden="true">{isRecording || isVideoRecording ? '■' : selectedRecordingIcon()}</span>
            </button>
            {isRecordMenuOpen ? (
              <div className="record-mode-menu" role="menu" aria-label={t('messages.recordMenu')}>
                <button className={recordingMode === 'voice' ? 'active' : ''} type="button" role="menuitem" onClick={() => chooseRecordingMode('voice')}>
                  <span aria-hidden="true">🎙</span>
                  <span>{t('messages.voiceMessage')}</span>
                </button>
                <button className={recordingMode === 'video_note' ? 'active' : ''} type="button" role="menuitem" onClick={() => chooseRecordingMode('video_note')}>
                  <span aria-hidden="true">◉</span>
                  <span>{t('messages.videoNote')}</span>
                </button>
                <small>{t('messages.holdToRecordHint')}</small>
              </div>
            ) : null}
          </div>
          <button
            className="send-fab"
            type="submit"
            disabled={isUploading || isRecording || isVideoRecording || (!text.trim() && !selectedFile)}
            aria-label={isUploading ? t('messages.sendingMessage') : t('messages.send')}
            title={t('messages.send')}
          >
            <span aria-hidden="true">{isUploading ? '…' : '➤'}</span>
          </button>
        </div>
        {(selectedFile || isRecording || isVideoRecording) ? (
          <div className="composer-preview">
            <span className="composer-preview-icon" aria-hidden="true">{messageType === 'video_note' || isVideoRecording ? '🎥' : messageType === 'voice' || isRecording ? '🎙' : '📎'}</span>
            <span>{isVideoRecording ? `${t('messages.recordingVideoNote')} · ${videoRecordingSeconds}s` : isRecording ? `${t('messages.recording')} · ${recordingSeconds}s` : selectedFile.name}</span>
            {!isRecording && !isVideoRecording ? <button type="button" onClick={clearSelectedMedia} aria-label={t('messages.removeAttachment')}>×</button> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
