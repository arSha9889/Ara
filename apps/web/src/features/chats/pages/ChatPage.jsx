import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
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
const MEDIA_MESSAGE_TYPES = ['photo', 'video', 'voice', 'file'];
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
  if (message.type === 'voice') {
    const duration = message.duration_seconds ?? 0;

    return (
      <div className="voice-message">
        <div className="voice-message-icon" aria-hidden="true">▶</div>
        <div className="voice-message-body">
          <div className="voice-message-head">
            <span>{t('messages.voice')}</span>
            <time>{duration}s</time>
          </div>
          <div className="voice-wave" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
          <audio className="voice-player" src={message.media_url} controls preload="metadata" />
        </div>
      </div>
    );
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
  if (status === 'subscribed' || status === 'connected') {
    return { label: t('messages.online'), tone: 'online' };
  }
  if (status === 'connecting' || status === 'reconnecting') {
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
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [activityText, setActivityText] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState(null);
  const [isComposerEmojiPickerOpen, setIsComposerEmojiPickerOpen] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordingCancelledRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const messageListRef = useRef(null);
  const pendingReadMessageIdsRef = useRef(new Set());
  const readTimerRef = useRef(null);
  const isChatIdValid = isValidChatId(chatId);
  const peerStatus = realtimeStatusView(realtimeStatus, t);
  const isSavedChat = chat?.type === 'saved';
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
        }
        if (payload.event === 'file.uploading' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText(t('messages.sendingFile'));
        }
        if (payload.event === 'typing.stopped' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText('');
        }
        if (payload.event === 'presence.active' && payload.chat_id === chatId && payload.user_id !== session.user?.id) {
          setActivityText(t('messages.peerActive'));
          window.setTimeout(() => setActivityText(''), 2400);
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

  useEffect(() => () => cancelVoiceRecording(), []);

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

  async function handleSend(event) {
    event.preventDefault();
    if (messageType === 'text' && !text.trim()) return;
    if (MEDIA_MESSAGE_TYPES.includes(messageType) && !selectedFile) return;
    if (isRecording) return;
    const isMediaMessage = MEDIA_MESSAGE_TYPES.includes(messageType);
    setError('');
    setIsUploading(true);
    try {
      if (isMediaMessage) {
        safeSocketSend(socket, { event: 'file.uploading', chat_id: chatId });
      }
      const uploadedMedia = isMediaMessage
        ? await uploadMedia(session.accessToken, selectedFile)
        : null;
      const message = await sendMessage(session.accessToken, chatId, {
        type: messageType,
        text: messageType === 'emoji' ? text : text.trim(),
        media_url: uploadedMedia?.media_url ?? null,
        media_name: uploadedMedia?.media_name ?? null,
        media_mime_type: uploadedMedia?.media_mime_type ?? null,
        media_size_bytes: uploadedMedia?.media_size_bytes ?? null,
        duration_seconds: messageType === 'voice' && durationSeconds ? Number(durationSeconds) : null,
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
    safeSocketSend(socket, { event: value ? 'typing.started' : 'typing.stopped', chat_id: chatId });
  }

  function clearSelectedMedia() {
    setSelectedFile(null);
    setDurationSeconds('');
    setRecordingSeconds(0);
    setMessageType('text');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleFileChange(file) {
    setSelectedFile(file ?? null);
    setMessageType(messageTypeForFile(file));
    setDurationSeconds('');
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
        setMessageType('voice');
        setSelectedFile(file);
        setDurationSeconds(String(recordedSeconds));
        setRecordingSeconds(recordedSeconds);
        stopRecordingTracks();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      clearSelectedMedia();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)));
      }, 500);
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
          <div className={`avatar ${isSavedChat ? 'saved-avatar' : ''}`} aria-hidden="true">{isSavedChat ? '★' : chat?.peer?.display_name?.[0] || chat?.peer?.username?.[0] || 'N'}</div>
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
                <input className="text-input" value={editText} onChange={(event) => setEditText(event.target.value)} autoFocus />
                <button className="message-action-button" type="submit">{t('messages.save')}</button>
                <button className="message-action-button" type="button" onClick={() => setEditingMessage(null)}>{t('messages.cancel')}</button>
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
          <div className="chat-activity-line" aria-live="polite">
            <span aria-hidden="true" />
            {activityText}
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
          <button
            className={`composer-icon-button voice-button ${isRecording ? 'is-recording' : ''}`}
            type="button"
            onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
            aria-label={isRecording ? t('messages.stopVoice') : t('messages.recordVoice')}
            title={isRecording ? t('messages.stopRecording') : t('messages.voiceMessage')}
          >
            <span aria-hidden="true">{isRecording ? '■' : '🎙'}</span>
          </button>
          <button
            className="send-fab"
            type="submit"
            disabled={isUploading || isRecording || (!text.trim() && !selectedFile)}
            aria-label={isUploading ? t('messages.sendingMessage') : t('messages.send')}
            title={t('messages.send')}
          >
            <span aria-hidden="true">{isUploading ? '…' : '➤'}</span>
          </button>
        </div>
        {(selectedFile || isRecording) ? (
          <div className="composer-preview">
            <span className="composer-preview-icon" aria-hidden="true">{messageType === 'voice' || isRecording ? '🎙' : '📎'}</span>
            <span>{isRecording ? `${t('messages.recording')} · ${recordingSeconds}s` : selectedFile.name}</span>
            {!isRecording ? <button type="button" onClick={clearSelectedMedia} aria-label={t('messages.removeAttachment')}>×</button> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
