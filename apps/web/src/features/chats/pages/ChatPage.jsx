import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useLayoutMode } from '../../../app/providers/LayoutModeProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { createBranchComment, createDirectChatForUser, deleteBranchComment, deleteMessage, editMessage, getBranchComments, getChat, getMessages, hideChat, markMessagesRead, pinMessage, reactToMessage, sendMessage, subscribeToBranch, unsubscribeFromBranch, updateBranchComment } from '../api/chatApi.js';
import { uploadMedia } from '../api/uploadApi.js';
import { CallOverlay } from '../components/CallOverlay.jsx';
import { ChatWorkspaceSidebar } from '../components/ChatWorkspaceSidebar.jsx';
import { useDirectCall } from '../hooks/useDirectCall.js';
import { PublicProfileSheet } from '../../profile/components/PublicProfileSheet.jsx';

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
const CELEBRATION_REACTIONS = new Set(['❤️', '🔥', '🎉']);
const VOICE_RECORDING_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];
const VIDEO_RECORDING_MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];

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
  return messages.map((message) => {
    if (message.id === nextMessage.id) {
      return { ...nextMessage, delivery_status: message.delivery_status };
    }
    if (message.reply_to?.id === nextMessage.id) {
      return { ...message, reply_to: { ...nextMessage, media_name: nextMessage.media_name } };
    }
    return message;
  });
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

function renderMessageContent(message, t, onOpenMedia) {
  if (message.deleted_at) {
    return <span className="deleted-message-text">{t('messages.deleted')}</span>;
  }
  const displayType = displayMessageType(message);
  if (displayType === 'photo') {
    return (
      <button className="message-media-button" type="button" onClick={() => onOpenMedia(message)} aria-label={t('messages.openMedia')}>
        <img className="message-media" src={message.media_url} alt={message.media_name || t('messages.photoAlt')} />
      </button>
    );
  }
  if (displayType === 'video') {
    return (
      <div className="message-video-wrap">
        <video className="message-media" src={message.media_url} controls />
        <button className="message-video-expand" type="button" onClick={() => onOpenMedia(message)} aria-label={t('messages.openMedia')} title={t('messages.openMedia')}>
          <span aria-hidden="true">⛶</span>
        </button>
      </div>
    );
  }
  if (displayType === 'video_note') {
    return <VideoNoteMessage message={message} t={t} />;
  }
  if (displayType === 'voice') {
    return <VoiceMessage message={message} t={t} />;
  }
  if (displayType === 'file') {
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

const DATE_LOCALES = {
  ru: 'ru-RU',
  en: 'en-US',
  kk: 'kk-KZ',
  ky: 'ky-KG',
  uk: 'uk-UA',
  be: 'be-BY',
  uz: 'uz-UZ',
};

function interpolate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template,
  );
}

function calendarDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function realtimeStatusView(status, lastSeenAt, t, language) {
  if (status === true || status === 'online') {
    return { label: t('messages.online'), tone: 'online' };
  }
  if (status === 'connecting') {
    return { label: t('messages.connecting'), tone: 'connecting' };
  }

  const lastSeen = lastSeenAt ? new Date(lastSeenAt) : null;
  if (!lastSeen || Number.isNaN(lastSeen.getTime())) {
    return { label: t('messages.offline'), tone: 'offline' };
  }

  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - lastSeen.getTime()) / 60000));
  const locale = DATE_LOCALES[language] || DATE_LOCALES.ru;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(lastSeen);
  const todayStart = calendarDayStart(now);
  const yesterdayStart = todayStart - 86400000;
  const lastSeenDayStart = calendarDayStart(lastSeen);

  if (elapsedMinutes < 5) {
    return { label: t('messages.lastSeenJustNow'), tone: 'recent', dateTime: lastSeen.toISOString() };
  }
  if (elapsedMinutes < 60) {
    return {
      label: interpolate(t('messages.lastSeenMinutes'), { count: elapsedMinutes }),
      tone: 'recent',
      dateTime: lastSeen.toISOString(),
    };
  }
  if (lastSeenDayStart === todayStart) {
    return {
      label: interpolate(t('messages.lastSeenToday'), { time }),
      tone: 'offline',
      dateTime: lastSeen.toISOString(),
    };
  }
  if (lastSeenDayStart === yesterdayStart) {
    return {
      label: interpolate(t('messages.lastSeenYesterday'), { time }),
      tone: 'offline',
      dateTime: lastSeen.toISOString(),
    };
  }

  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(lastSeen);
  return {
    label: interpolate(t('messages.lastSeenDate'), { date }),
    tone: 'offline',
    dateTime: lastSeen.toISOString(),
  };
}

function PresenceStatus({ status, lastSeenAt, t, language }) {
  const [, setCurrentTime] = useState(Date.now());
  const view = realtimeStatusView(status, lastSeenAt, t, language);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className={`presence-status ${view.tone}`}>
      <span className="presence-status-indicator" aria-hidden="true" />
      {view.dateTime ? <time dateTime={view.dateTime}>{view.label}</time> : <span>{view.label}</span>}
    </span>
  );
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

function displayMessageType(message) {
  if (message.type !== 'file') return message.type;
  if (message.media_mime_type?.startsWith('image/')) return 'photo';
  if (message.media_mime_type?.startsWith('video/')) return 'video';
  if (message.media_mime_type?.startsWith('audio/')) return 'voice';
  return 'file';
}

function createSupportedMediaRecorder(stream, supportedMimeTypes) {
  const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
    ? supportedMimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate))
    : null;
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

function recordedMimeType(recorder, chunks) {
  return recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || '';
}

function mediaFileExtension(mimeType, fallback) {
  const normalized = mimeType.split(';', 1)[0].toLowerCase();
  if (normalized === 'audio/mp4') return 'm4a';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/aac') return 'aac';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'video/mp4') return 'mp4';
  return fallback;
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
  const displayType = displayMessageType(message);
  if (displayType === 'photo') return t('messages.photoAlt');
  if (displayType === 'voice') return t('messages.voice');
  if (displayType === 'video_note') return t('messages.videoNote');
  if (displayType === 'file') return message.media_name || t('messages.file');
  if (displayType === 'video') return t('messages.video');
  return message.payload;
}

function previewReplyMessage(message, t) {
  if (!message || message.deleted_at) return t('messages.deleted');
  const displayType = displayMessageType(message);
  if (displayType === 'photo') return t('messages.photoAlt');
  if (displayType === 'video') return t('messages.video');
  if (displayType === 'video_note') return t('messages.videoNote');
  if (displayType === 'voice') return t('messages.voice');
  if (displayType === 'file') return message.media_name || t('messages.file');
  return message.payload;
}

function draftStorageKey(userId, chatId) {
  return userId && chatId ? `arachat:draft:${userId}:${chatId}` : null;
}

function isInteractiveMessageTarget(target) {
  return Boolean(target.closest('button, a, input, label, form, video, audio, .message-actions, .reaction-row'));
}

function upsertComment(comments, nextComment) {
  const existingIndex = comments.findIndex((comment) => comment.id === nextComment.id);
  if (existingIndex === -1) return [...comments, nextComment];
  return comments.map((comment) => comment.id === nextComment.id ? nextComment : comment);
}

function formatCommentTime(value, language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(DATE_LOCALES[language] || DATE_LOCALES.ru, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function BranchCommentsPanel({ branch, post, session, language, t, event, onClose, onCountChange }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;
    setComments([]);
    setText('');
    setEditingCommentId(null);
    setError('');
    setIsLoading(true);
    getBranchComments(session.accessToken, branch.id, post.id)
      .then((items) => {
        if (isActive) setComments(items);
      })
      .catch((err) => {
        if (isActive) setError(err.message);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => { isActive = false; };
  }, [branch.id, post.id, session.accessToken]);

  useEffect(() => {
    if (!event || event.post_id !== post.id) return;
    if (event.event === 'branch_comment.created' || event.event === 'branch_comment.updated' || event.event === 'branch_comment.deleted') {
      setComments((current) => upsertComment(current, event.comment));
    }
    if (typeof event.comment_count === 'number') onCountChange(post.id, event.comment_count);
  }, [event, onCountChange, post.id]);

  async function submitComment(event) {
    event.preventDefault();
    if (!text.trim() || isSaving) return;
    try {
      setIsSaving(true);
      setError('');
      const comment = await createBranchComment(session.accessToken, branch.id, post.id, text.trim());
      setComments((current) => upsertComment(current, comment));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!editingCommentId || !editingText.trim() || isSaving) return;
    try {
      setIsSaving(true);
      setError('');
      const comment = await updateBranchComment(session.accessToken, branch.id, editingCommentId, editingText.trim());
      setComments((current) => upsertComment(current, comment));
      setEditingCommentId(null);
      setEditingText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeComment(commentId) {
    if (isSaving) return;
    try {
      setIsSaving(true);
      setError('');
      const comment = await deleteBranchComment(session.accessToken, branch.id, commentId);
      setComments((current) => upsertComment(current, comment));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="branch-comments-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="branch-comments-panel" role="dialog" aria-modal="true" aria-labelledby="branch-comments-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="branch-comments-header">
          <div><p className="eyebrow">{branch.title}</p><h2 id="branch-comments-title">{t('chats.comments')}</h2></div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
        </header>
        <div className="branch-comments-post">{renderMessageContent(post, t, () => undefined)}</div>
        <div className="branch-comments-list">
          {isLoading ? <AraChatLoader compact title={t('chats.comments')} text={t('chats.loadingComments')} /> : null}
          {!isLoading && !comments.length ? <p className="branch-comments-empty">{t('chats.commentsEmpty')}</p> : null}
          {comments.map((comment) => (
            <article className={`branch-comment ${comment.deleted_at ? 'deleted' : ''}`} key={comment.id}>
              <div className="branch-comment-head"><strong>{comment.author?.display_name || comment.author?.username || 'AraChat'}</strong><time>{formatCommentTime(comment.created_at, language)}</time></div>
              {editingCommentId === comment.id ? (
                <form className="branch-comment-edit" onSubmit={submitEdit}><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} maxLength="2000" autoFocus /><button type="submit" disabled={isSaving}>{t('messages.save')}</button><button type="button" onClick={() => setEditingCommentId(null)}>{t('messages.cancel')}</button></form>
              ) : <p>{comment.deleted_at ? t('chats.commentDeleted') : comment.text}</p>}
              {!comment.deleted_at && (comment.author_id === session.user?.id || branch.can_post) ? <div className="branch-comment-actions">
                {comment.author_id === session.user?.id ? <button type="button" onClick={() => { setEditingCommentId(comment.id); setEditingText(comment.text); }}>{t('messages.edit')}</button> : null}
                <button type="button" onClick={() => removeComment(comment.id)} disabled={isSaving}>{t('messages.delete')}</button>
              </div> : null}
            </article>
          ))}
        </div>
        {branch.is_subscribed || branch.can_post ? (
          <form className="branch-comment-composer" onSubmit={submitComment}><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength="2000" placeholder={t('chats.commentPlaceholder')} /><button className="button button-primary" type="submit" disabled={!text.trim() || isSaving}>{t('chats.commentSend')}</button></form>
        ) : <p className="branch-comment-subscribe-note">{t('chats.commentSubscribe')}</p>}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}

export function ChatPage() {
  const { language, t } = useI18n();
  const { chatId } = useParams();
  const { lastNotification, markMessageNotificationsRead } = useNotifications();
  const { session } = useSession();
  const { effectiveMode } = useLayoutMode();
  const navigate = useNavigate();
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
  const [isRecordingLocked, setIsRecordingLocked] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [videoRecordingSeconds, setVideoRecordingSeconds] = useState(0);
  const [error, setError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [activityText, setActivityText] = useState('');
  const [activityType, setActivityType] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [mediaViewerMessage, setMediaViewerMessage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState(null);
  const [reactionEffects, setReactionEffects] = useState({});
  const [isComposerEmojiPickerOpen, setIsComposerEmojiPickerOpen] = useState(false);
  const [recordingMode, setRecordingMode] = useState('voice');
  const [selectedVideoPreviewUrl, setSelectedVideoPreviewUrl] = useState('');
  const [isCallUnavailableDialogOpen, setIsCallUnavailableDialogOpen] = useState(false);
  const [isChatActionsOpen, setIsChatActionsOpen] = useState(false);
  const [isHideChatDialogOpen, setIsHideChatDialogOpen] = useState(false);
  const [isHidingChat, setIsHidingChat] = useState(false);
  const [profileCardAuthor, setProfileCardAuthor] = useState(null);
  const [isOpeningProfileChat, setIsOpeningProfileChat] = useState(false);
  const [profileCardError, setProfileCardError] = useState('');
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [isSubscribingToBranch, setIsSubscribingToBranch] = useState(false);
  const [commentPost, setCommentPost] = useState(null);
  const [branchCommentEvent, setBranchCommentEvent] = useState(null);
  const mediaRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const videoRecordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const videoRecordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const videoRecordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoRecordingPreviewRef = useRef(null);
  const recordingCancelledRef = useRef(false);
  const videoRecordingCancelledRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);
  const messageListRef = useRef(null);
  const pendingReadMessageIdsRef = useRef(new Set());
  const readTimerRef = useRef(null);
  const isInitialMessageLoadRef = useRef(true);
  const reactionEffectTimersRef = useRef(new Map());
  const reactionRequestIdsRef = useRef(new Set());
  const recordHoldTimerRef = useRef(null);
  const recordHoldTriggeredRef = useRef(false);
  const recordPressActiveRef = useRef(false);
  const recordingLockedRef = useRef(false);
  const suppressRecordClickRef = useRef(false);
  const stopAfterPendingRecordStartRef = useRef(false);
  const cancelAfterPendingRecordStartRef = useRef(false);
  const isChatIdValid = isValidChatId(chatId);
  const isSavedChat = chat?.type === 'saved';
  const isPublicBranch = chat?.type === 'branch';
  const isDirectChat = chat?.type === 'direct';
  const usesFocusedMobileWorkspace = isDirectChat || isSavedChat;
  const canPost = !isPublicBranch || chat?.can_post;
  const currentDraftStorageKey = draftStorageKey(session.user?.id, chatId);
  const mediaMessages = messages.filter((message) => !message.deleted_at && ['photo', 'video'].includes(displayMessageType(message)) && message.media_url);
  const mediaViewerIndex = mediaViewerMessage ? mediaMessages.findIndex((message) => message.id === mediaViewerMessage.id) : -1;
  const mediaViewerType = mediaViewerMessage ? displayMessageType(mediaViewerMessage) : null;
  const peerStatus = realtimeStatusView(isSavedChat ? false : chat?.peer?.is_online ?? 'connecting', chat?.peer?.last_seen_at, t, language);
  const chatDisplayTitle = isSavedChat ? t('chats.savedTitle') : isPublicBranch ? chat?.title || t('chats.branchTitle') : chat?.peer?.display_name || chat?.peer?.username || t('chats.directChat');
  const chatDisplaySubtitle = isSavedChat ? t('chats.savedHeaderSubtitle') : isPublicBranch ? chat?.description || t('chats.publicBranchSubtitle') : chat?.peer?.username ? `@${chat.peer.username}` : t('chats.directChat');
  const call = useDirectCall({
    chatId,
    currentUserId: session.user?.id,
    peer: chat?.peer,
    socket,
    t,
    onError: setError,
  });

  async function loadMessages({ preserveMessages = false } = {}) {
    if (!isChatIdValid) return;
    try {
      if (!preserveMessages) {
        isInitialMessageLoadRef.current = true;
        setIsLoadingMessages(true);
        setChat(null);
        setMessages([]);
        setError('');
      }
      const [chatDetails, items] = await Promise.all([
        getChat(session.accessToken, chatId),
        getMessages(session.accessToken, chatId),
      ]);
      setChat(chatDetails);
      setMessages((current) => {
        const messagesById = new Map(current.map((message) => [message.id, message]));
        items.forEach((message) => messagesById.set(message.id, message));
        return [...messagesById.values()].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
      });
    } finally {
      if (!preserveMessages) setIsLoadingMessages(false);
    }
  }

  async function handleSubscribeToBranch() {
    if (!chat || isSubscribingToBranch) return;
    setError('');
    setIsSubscribingToBranch(true);
    try {
      setChat(await subscribeToBranch(session.accessToken, chat.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubscribingToBranch(false);
    }
  }

  async function handleUnsubscribeFromBranch() {
    if (!chat || isSubscribingToBranch) return;
    setError('');
    setIsSubscribingToBranch(true);
    try {
      setChat(await unsubscribeFromBranch(session.accessToken, chat.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubscribingToBranch(false);
    }
  }

  function updatePostCommentCount(postId, commentCount) {
    setMessages((current) => current.map((message) => message.id === postId ? { ...message, comment_count: commentCount } : message));
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
    if (!lastNotification?.message_id || lastNotification.chat_id !== chatId || !isChatIdValid) return;
    loadMessages({ preserveMessages: true }).catch((err) => setError(err.message));
    // A notification is an independent delivery channel from the chat WebSocket.
    // Resyncing here recovers a message if that socket missed an event while reconnecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, isChatIdValid, lastNotification?.id, session.accessToken]);

  useLayoutEffect(() => {
    if (!usesFocusedMobileWorkspace) return undefined;

    document.documentElement.dataset.composerChat = 'true';
    return () => {
      delete document.documentElement.dataset.composerChat;
    };
  }, [usesFocusedMobileWorkspace]);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;

    function syncChatViewportHeight() {
      const height = Math.round(viewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty('--chat-viewport-height', `${height}px`);
      document.documentElement.dataset.chatKeyboardOpen = String(window.innerHeight - height > 150);
    }

    syncChatViewportHeight();
    viewport?.addEventListener('resize', syncChatViewportHeight);
    viewport?.addEventListener('scroll', syncChatViewportHeight);
    window.addEventListener('resize', syncChatViewportHeight);

    return () => {
      viewport?.removeEventListener('resize', syncChatViewportHeight);
      viewport?.removeEventListener('scroll', syncChatViewportHeight);
      window.removeEventListener('resize', syncChatViewportHeight);
      document.documentElement.style.removeProperty('--chat-viewport-height');
      delete document.documentElement.dataset.chatKeyboardOpen;
    };
  }, []);

  useEffect(() => {
    if (!currentDraftStorageKey) return;
    try {
      setText(window.localStorage.getItem(currentDraftStorageKey) || '');
    } catch {
      setText('');
    }
  }, [currentDraftStorageKey]);

  useEffect(() => {
    if (!mediaViewerMessage) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMediaViewerMessage(null);
      if (event.key === 'ArrowLeft' && mediaViewerIndex > 0) setMediaViewerMessage(mediaMessages[mediaViewerIndex - 1]);
      if (event.key === 'ArrowRight' && mediaViewerIndex >= 0 && mediaViewerIndex < mediaMessages.length - 1) setMediaViewerMessage(mediaMessages[mediaViewerIndex + 1]);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaMessages, mediaViewerIndex, mediaViewerMessage]);

  useEffect(() => {
    if (!profileCardAuthor) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setProfileCardAuthor(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profileCardAuthor]);

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
      });
      socket.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data);
        if (payload.event?.startsWith('call.')) {
          return;
        }
        if (payload.event === 'connection.authenticated') {
          setRealtimeStatus('connected');
          safeSocketSend(socket, { event: 'chat.subscribe', chat_id: chatId });
          safeSocketSend(socket, { event: 'presence.active', chat_id: chatId });
        }
        if (payload.event === 'chat.subscribed') {
          setRealtimeStatus('subscribed');
          loadMessages({ preserveMessages: true }).catch((err) => setError(err.message));
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
        if (payload.event?.startsWith('branch_comment.') && payload.chat_id === chatId) {
          setBranchCommentEvent(payload);
          if (typeof payload.comment_count === 'number') updatePostCommentCount(payload.post_id, payload.comment_count);
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
            ? {
              ...current,
              peer: {
                ...current.peer,
                is_online: Boolean(payload.is_online),
                last_seen_at: payload.last_seen_at ?? current.peer.last_seen_at,
              },
            }
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
    reactionEffectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reactionEffectTimersRef.current.clear();
    cancelVoiceRecording();
    cancelVideoRecording();
    if (recordHoldTimerRef.current) window.clearTimeout(recordHoldTimerRef.current);
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
  }, []);

  useEffect(() => {
    const video = videoRecordingPreviewRef.current;
    const stream = videoRecorderRef.current?.stream;
    if (!isVideoRecording || !video || !stream) return undefined;

    video.srcObject = stream;
    video.play().catch(() => undefined);
    return () => {
      video.pause();
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [isVideoRecording]);

  useEffect(() => {
    if (messageType !== 'video_note' || !selectedFile) {
      setSelectedVideoPreviewUrl('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(selectedFile);
    setSelectedVideoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [messageType, selectedFile]);

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

  useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: isInitialMessageLoadRef.current ? 'auto' : 'smooth' });
    isInitialMessageLoadRef.current = false;
  }, [messages.length, isLoadingMessages]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return undefined;

    function syncScrollToLatestVisibility() {
      setShowScrollToLatest(list.scrollHeight - list.scrollTop - list.clientHeight > 180);
    }

    syncScrollToLatestVisibility();
    list.addEventListener('scroll', syncScrollToLatestVisibility, { passive: true });
    return () => list.removeEventListener('scroll', syncScrollToLatestVisibility);
  }, [messages.length, isLoadingMessages]);

  function scrollToLatestMessage() {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
  }

  async function sendMediaMessage(file, type, mediaDurationSeconds = null, { clearComposer = true, messageText = '' } = {}) {
    setError('');
    setIsUploading(true);
    try {
      safeSocketSend(socket, { event: type === 'voice' ? 'voice.uploading' : 'file.uploading', chat_id: chatId });
      const uploadedMedia = await uploadMedia(session.accessToken, file);
      const suggestedMessageType = MEDIA_MESSAGE_TYPES.includes(uploadedMedia?.suggested_message_type)
        ? uploadedMedia.suggested_message_type
        : null;
      const resolvedMessageType = ['voice', 'video_note'].includes(type)
        ? type
        : suggestedMessageType === 'voice' ? 'file' : suggestedMessageType || type;
      const message = await sendMessage(session.accessToken, chatId, {
        type: resolvedMessageType,
        text: messageText,
        reply_to_message_id: replyingTo?.id ?? null,
        media_url: uploadedMedia?.media_url ?? null,
        media_name: uploadedMedia?.media_name ?? null,
        media_mime_type: uploadedMedia?.media_mime_type ?? null,
        media_size_bytes: uploadedMedia?.media_size_bytes ?? null,
        duration_seconds: ['voice', 'video_note'].includes(resolvedMessageType) && mediaDurationSeconds ? Number(mediaDurationSeconds) : null,
      });
      setMessages((current) => appendUniqueMessage(current, message));
      if (clearComposer) {
        setText('');
        clearDraft();
        setReplyingTo(null);
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
        reply_to_message_id: replyingTo?.id ?? null,
        media_url: null,
        media_name: null,
        media_mime_type: null,
        media_size_bytes: null,
        duration_seconds: null,
      });
      setMessages((current) => appendUniqueMessage(current, message));
      setText('');
      clearDraft();
      setReplyingTo(null);
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
      setMessages((current) => upsertMessageKeepingStatus(current, message));
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
      setMessages((current) => upsertMessageKeepingStatus(current, message));
      setChat((current) => current?.pinned_message_id === messageId ? { ...current, pinned_message_id: null, pinned_message: null } : current);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleHideChat() {
    setError('');
    try {
      await hideChat(session.accessToken, chatId);
      setIsHideChatDialogOpen(false);
      setIsHidingChat(true);
      window.setTimeout(() => {
        navigate('/app', {
          replace: true,
          state: { hiddenChat: { id: chatId, title: chatDisplayTitle } },
        });
      }, 230);
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

  function showReactionEffect(messageId, emoji, effect) {
    const effectKey = `${messageId}:${emoji}`;
    const activeTimer = reactionEffectTimersRef.current.get(effectKey);
    if (activeTimer) window.clearTimeout(activeTimer);
    setReactionEffects((current) => ({ ...current, [effectKey]: effect }));
    reactionEffectTimersRef.current.set(effectKey, window.setTimeout(() => {
      setReactionEffects((current) => {
        const { [effectKey]: _completedEffect, ...remaining } = current;
        return remaining;
      });
      reactionEffectTimersRef.current.delete(effectKey);
    }, 720));
  }

  async function handleReaction(messageId, emoji) {
    const reactionKey = `${messageId}:${emoji}`;
    if (reactionRequestIdsRef.current.has(reactionKey)) return;
    reactionRequestIdsRef.current.add(reactionKey);
    try {
      const message = await reactToMessage(session.accessToken, chatId, messageId, emoji);
      setMessages((current) => upsertMessage(current, message));
      const nextReaction = message.reactions?.find((reaction) => reaction.emoji === emoji);
      const addedByMe = Boolean(nextReaction?.reacted_by_me);
      showReactionEffect(messageId, emoji, {
        type: addedByMe ? 'added' : 'removed',
        celebration: addedByMe && CELEBRATION_REACTIONS.has(emoji),
      });
      setOpenReactionPickerMessageId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      reactionRequestIdsRef.current.delete(reactionKey);
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
    if (currentDraftStorageKey) {
      try {
        if (value) window.localStorage.setItem(currentDraftStorageKey, value);
        else window.localStorage.removeItem(currentDraftStorageKey);
      } catch {
        // Drafts are a local convenience; messaging must work if storage is unavailable.
      }
    }
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

  function clearDraft() {
    if (!currentDraftStorageKey) return;
    try {
      window.localStorage.removeItem(currentDraftStorageKey);
    } catch {
      // Ignore unavailable browser storage.
    }
  }

  function startReply(message) {
    setReplyingTo(message);
    setEditingMessage(null);
    setOpenReactionPickerMessageId(null);
  }

  function jumpToMessage(messageId) {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 1500);
  }

  function openMediaViewer(message) {
    setMediaViewerMessage(message);
    setOpenReactionPickerMessageId(null);
  }

  function openProfileCard(author) {
    if (!author || author.id === session.user?.id) return;
    setProfileCardError('');
    setProfileCardAuthor(author);
  }

  function openPeerProfile() {
    if (!isSavedChat && !isPublicBranch && chat?.peer) openProfileCard(chat.peer);
  }

  async function openProfileDirectChat() {
    if (!profileCardAuthor || isOpeningProfileChat) return;
    try {
      setIsOpeningProfileChat(true);
      setProfileCardError('');
      const directChat = await createDirectChatForUser(session.accessToken, profileCardAuthor.id);
      setProfileCardAuthor(null);
      navigate(`/app/chats/${directChat.id}`);
    } catch (err) {
      setProfileCardError(err.message);
    } finally {
      setIsOpeningProfileChat(false);
    }
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

  function startSelectedRecording() {
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
    recordingLockedRef.current = false;
    setIsRecordingLocked(false);
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
      if (!recordingLockedRef.current) {
        stopActiveRecording();
        if (!mediaRecorderRef.current && !videoRecorderRef.current) {
          stopAfterPendingRecordStartRef.current = true;
        }
      }
      window.setTimeout(() => {
        suppressRecordClickRef.current = false;
      }, 0);
    }
  }

  function handleRecordPointerMove(event) {
    if (!recordHoldTriggeredRef.current || recordingLockedRef.current || recordingMode !== 'voice') return;
    if (event.clientY <= event.currentTarget.getBoundingClientRect().top - 36) {
      recordingLockedRef.current = true;
      setIsRecordingLocked(true);
    }
  }

  function handleRecordPointerCancel() {
    recordPressActiveRef.current = false;
    if (recordHoldTimerRef.current) {
      window.clearTimeout(recordHoldTimerRef.current);
      recordHoldTimerRef.current = null;
    }
    if (recordHoldTriggeredRef.current) {
      if (!recordingLockedRef.current) {
        cancelActiveRecording();
        if (!mediaRecorderRef.current && !videoRecorderRef.current) {
          cancelAfterPendingRecordStartRef.current = true;
        }
      }
      suppressRecordClickRef.current = false;
    }
  }

  function lockVoiceRecording() {
    if (mediaRecorderRef.current?.state !== 'recording') return;
    recordingLockedRef.current = true;
    setIsRecordingLocked(true);
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
    setRecordingMode((current) => (current === 'voice' ? 'video_note' : 'voice'));
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('messages.voiceUnsupported'));
      return;
    }

    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createSupportedMediaRecorder(stream, VOICE_RECORDING_MIME_TYPES);
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
        const mimeType = recordedMimeType(recorder, recordingChunksRef.current);
        if (!mimeType) {
          setError(t('messages.voiceStartError'));
          stopRecordingTracks();
          recordingChunksRef.current = [];
          return;
        }
        const recordedSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const extension = mediaFileExtension(mimeType, 'webm');
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        setRecordingSeconds(recordedSeconds);
        stopRecordingTracks();
        setSelectedFile(file);
        setMessageType('voice');
        setDurationSeconds(String(recordedSeconds));
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
    recordingLockedRef.current = false;
    setIsRecordingLocked(false);
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
      const recorder = createSupportedMediaRecorder(stream, VIDEO_RECORDING_MIME_TYPES);
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
        const mimeType = recordedMimeType(recorder, videoRecordingChunksRef.current);
        if (!mimeType) {
          setError(t('messages.videoNoteStartError'));
          stopVideoRecordingTracks();
          videoRecordingChunksRef.current = [];
          return;
        }
        const recordedSeconds = Math.max(1, Math.round((Date.now() - videoRecordingStartedAtRef.current) / 1000));
        const blob = new Blob(videoRecordingChunksRef.current, { type: mimeType });
        const extension = mediaFileExtension(mimeType, 'webm');
        const file = new File([blob], `video-note-${Date.now()}.${extension}`, { type: mimeType });
        setVideoRecordingSeconds(recordedSeconds);
        stopVideoRecordingTracks();
        setSelectedFile(file);
        setMessageType('video_note');
        setDurationSeconds(String(recordedSeconds));
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
    <section className="chat-workspace">
      <ChatWorkspaceSidebar activeChatId={chatId} />
      <section className={`panel chat-panel ${isHidingChat ? 'is-hiding' : ''}`}>
      <header className="chat-header">
        <Link className="chat-back-button" to="/app" aria-label={t('messages.backToChats')} title={t('messages.backToChats')}>
          <Icon name="arrowLeft" size={19} />
          <span>{t('messages.backToChats')}</span>
        </Link>
        <button className="chat-profile-trigger chat-avatar-wrap" type="button" onClick={openPeerProfile} disabled={isSavedChat || isPublicBranch} aria-label={!isSavedChat && !isPublicBranch ? `${t('messages.openProfile')}: ${chatDisplayTitle}` : undefined}>
          {isSavedChat ? (
            <div className="avatar saved-avatar" aria-hidden="true">★</div>
          ) : (
            <UserAvatar profile={chat?.peer} fallback={chat?.peer?.display_name?.[0] || chat?.peer?.username?.[0] || 'N'} />
          )}
          {!isSavedChat ? <span className={`presence-dot ${peerStatus.tone}`} aria-hidden="true" /> : null}
        </button>
        <div>
          {!isSavedChat && !isPublicBranch ? <button className="chat-profile-title" type="button" onClick={openPeerProfile}><h1>{chatDisplayTitle}</h1></button> : <h1>{chatDisplayTitle}</h1>}
          <div className="chat-subtitle">
            <span>{isPublicBranch ? t('chats.subscribers').replace('{count}', Number(chat?.subscriber_count || 0).toLocaleString(DATE_LOCALES[language] || DATE_LOCALES.ru)) : chatDisplaySubtitle}</span>
          {!isSavedChat && !isPublicBranch ? (
              <PresenceStatus
                status={isSavedChat ? false : chat?.peer?.is_online ?? 'connecting'}
                lastSeenAt={chat?.peer?.last_seen_at}
                t={t}
                language={language}
              />
            ) : null}
          </div>
        </div>
        {!isSavedChat && !isPublicBranch ? (
          <button
            className="chat-call-button"
            type="button"
            onClick={() => setIsCallUnavailableDialogOpen(true)}
            aria-label={t('calls.start')}
            title={t('calls.temporarilyUnavailable')}
          >
            <span className="chat-call-button-icon" aria-hidden="true"><Icon name="phone" size={18} /></span>
            <strong>{t('calls.call')}</strong>
          </button>
        ) : null}
        {isPublicBranch && !chat?.can_post ? (
          <button className="button button-secondary branch-header-subscribe" type="button" onClick={chat?.is_subscribed ? handleUnsubscribeFromBranch : handleSubscribeToBranch} disabled={isSubscribingToBranch}>
            {isSubscribingToBranch ? '…' : chat?.is_subscribed ? t('chats.unsubscribe') : t('chats.subscribe')}
          </button>
        ) : null}
        {!isSavedChat && !isPublicBranch ? (
          <div className={`chat-header-actions ${isChatActionsOpen ? 'is-open' : ''}`}>
            <button
              className="chat-more-button"
              type="button"
              aria-label={t('chats.chatActions')}
              aria-expanded={isChatActionsOpen}
              onClick={() => setIsChatActionsOpen((current) => !current)}
            >
              <Icon name="more" size={21} />
            </button>
            {isChatActionsOpen ? (
              <>
                <button className="chat-actions-backdrop" type="button" aria-label={t('common.close')} onClick={() => setIsChatActionsOpen(false)} />
                <div className="chat-actions-menu" role="menu" aria-label={t('chats.chatActions')}>
                  <button
                    className="chat-actions-menu-item danger"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsChatActionsOpen(false);
                      setIsHideChatDialogOpen(true);
                    }}
                  >
                    <Icon name="trash" size={17} />
                    <span>{t('chats.removeFromList')}</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </header>
      {isCallUnavailableDialogOpen ? (
        <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setIsCallUnavailableDialogOpen(false)}>
          <section className="app-dialog call-unavailable-dialog" role="dialog" aria-modal="true" aria-labelledby="call-unavailable-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="app-dialog-icon" aria-hidden="true"><Icon name="phone" size={23} /></div>
            <div className="app-dialog-copy">
              <p className="eyebrow">AraChat</p>
              <h2 id="call-unavailable-title">{t('calls.temporarilyUnavailable')}</h2>
              <p>{t('calls.temporarilyUnavailableText')}</p>
            </div>
            <button className="button button-primary" type="button" onClick={() => setIsCallUnavailableDialogOpen(false)}>{t('common.gotIt')}</button>
          </section>
        </div>
      ) : null}
      {isHideChatDialogOpen ? (
        <div className="app-dialog-backdrop chat-hide-dialog-backdrop" role="presentation" onMouseDown={() => setIsHideChatDialogOpen(false)}>
          <section className="app-dialog chat-hide-dialog" role="dialog" aria-modal="true" aria-labelledby="hide-chat-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="app-dialog-icon" aria-hidden="true"><Icon name="trash" size={23} /></div>
            <div className="app-dialog-copy">
              <p className="eyebrow">AraChat</p>
              <h2 id="hide-chat-title">{t('chats.removeFromListTitle')}</h2>
              <p>{t('chats.removeFromListText')}</p>
            </div>
            <div className="chat-hide-dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setIsHideChatDialogOpen(false)}>{t('messages.cancel')}</button>
              <button className="button button-danger" type="button" onClick={handleHideChat} disabled={isHidingChat}>{t('chats.removeFromList')}</button>
            </div>
          </section>
        </div>
      ) : null}
      <CallOverlay call={call} peer={chat?.peer} t={t} />
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
        {isLoadingMessages ? <AraChatLoader compact title={t('messages.openingTitle')} text={t('messages.openingText')} /> : null}
        {messages.map((message) => (
          <article
            id={`message-${message.id}`}
            data-message-id={message.id}
            data-incoming-message={message.sender_id !== session.user?.id}
            className={`message-bubble ${message.sender_id === session.user?.id ? 'outgoing' : 'incoming'} ${message.deleted_at ? 'deleted' : ''} ${message.is_pinned ? 'pinned' : ''} ${highlightedMessageId === message.id ? 'is-highlighted' : ''}`}
            key={message.id}
            role={!message.deleted_at ? 'button' : undefined}
            tabIndex={!message.deleted_at ? 0 : undefined}
            onClick={(event) => handleMessageBubbleClick(event, message)}
            onKeyDown={(event) => handleMessageBubbleKeyDown(event, message)}
            aria-label={!message.deleted_at ? t('messages.openReactions') : undefined}
          >
            {!message.deleted_at && !isPublicBranch ? (
              <div className="message-actions">
                <button className="message-action-button" type="button" onClick={() => startReply(message)} aria-label={t('messages.reply')} title={t('messages.reply')}>
                  <span aria-hidden="true">↩</span>
                  <span className="action-label">{t('messages.reply')}</span>
                </button>
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
                  </button>
                  <button className="message-edit-button cancel" type="button" onClick={() => setEditingMessage(null)} aria-label={t('messages.cancel')}>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </form>
            ) : (
              <>
                {message.sender_id !== session.user?.id && message.author ? (
                  <button
                    className="message-author"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openProfileCard(message.author);
                    }}
                    aria-label={`${t('messages.openProfile')}: ${message.author.display_name || message.author.username}`}
                  >
                    <UserAvatar profile={message.author} fallback={message.author.display_name?.[0] || message.author.username?.[0] || 'N'} className="message-author-avatar" />
                    <span>{message.author.display_name || message.author.username}</span>
                    {message.author.is_official ? <span className="message-author-official" aria-label={t('messages.officialAccount')}>✓</span> : null}
                  </button>
                ) : null}
                {message.reply_to ? (
                  <button className="message-reply-preview" type="button" onClick={() => jumpToMessage(message.reply_to.id)}>
                    <span>{message.reply_to.sender_id === session.user?.id ? t('messages.you') : chatDisplayTitle}</span>
                    <strong>{previewReplyMessage(message.reply_to, t)}</strong>
                  </button>
                ) : null}
                <div>{renderMessageContent(message, t, openMediaViewer)}</div>
                {isPublicBranch && !message.deleted_at ? (
                  <button className="branch-comments-trigger" type="button" onClick={() => setCommentPost(message)}>
                    {t('chats.comments')} · {message.comment_count || 0}
                  </button>
                ) : null}
              </>
            )}
            <div className="message-meta">
              {message.is_pinned ? <span>{t('messages.pinnedShort')}</span> : null}
              {message.edited_at && !message.deleted_at ? <span>{t('messages.edited')}</span> : null}
              {message.sender_id === session.user?.id ? <DeliveryStatus status={message.delivery_status} t={t} /> : null}
            </div>
            {!message.deleted_at && !isPublicBranch ? <div className="reaction-row">
              {message.reactions?.map((reaction) => {
                const effect = reactionEffects[`${message.id}:${reaction.emoji}`];
                return (
                  <button className={`reaction-chip ${reaction.reacted_by_me ? 'active' : ''} ${effect?.type === 'added' ? 'is-added' : ''} ${effect?.type === 'removed' ? 'is-removed' : ''}`} type="button" key={reaction.emoji} onClick={() => handleReaction(message.id, reaction.emoji)}>
                    {reaction.emoji} {reaction.count}
                  </button>
                );
              })}
              {Object.entries(reactionEffects).map(([effectKey, effect]) => {
                const [effectMessageId, emoji] = effectKey.split(':');
                if (effectMessageId !== message.id) return null;
                const reactionExists = message.reactions?.some((reaction) => reaction.emoji === emoji);
                return (
                  <span className={`reaction-effect ${effect.celebration ? 'is-celebration' : ''}`} key={effectKey} aria-hidden="true">
                    {effect.type === 'removed' && !reactionExists ? <span className="reaction-vanishing-chip">{emoji}</span> : null}
                    {effect.celebration ? <span className="reaction-celebration">{emoji}</span> : null}
                  </span>
                );
              })}
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
      {showScrollToLatest ? (
        <button className="scroll-to-latest-button" type="button" onClick={scrollToLatestMessage} aria-label={t('messages.scrollToLatest')} title={t('messages.scrollToLatest')}>
          <span aria-hidden="true">↓</span>
        </button>
      ) : null}
      {canPost ? <form className="composer" onSubmit={handleSend}>
        {replyingTo ? (
          <div className="composer-reply-preview">
            <span className="composer-reply-icon" aria-hidden="true">↩</span>
            <div>
              <strong>{replyingTo.sender_id === session.user?.id ? t('messages.you') : chatDisplayTitle}</strong>
              <span>{previewReplyMessage(replyingTo, t)}</span>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label={t('messages.cancelReply')} title={t('messages.cancelReply')}>×</button>
          </div>
        ) : null}
        <div className="composer-input-shell">
          <label className="composer-icon-button attachment-button" aria-label={t('messages.attachFile')} title={t('messages.attachFileTitle')}>
            <Icon name="paperclip" size={20} />
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
              <Icon name="smile" size={20} />
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
              onPointerMove={handleRecordPointerMove}
              onPointerUp={handleRecordPointerUp}
              onPointerCancel={handleRecordPointerCancel}
              disabled={isUploading}
              aria-pressed={recordingMode === 'video_note'}
              aria-label={isRecording || isVideoRecording ? t('messages.stopRecording') : recordingMode === 'video_note' ? t('messages.recordVideoNote') : t('messages.recordVoice')}
              title={isRecording || isVideoRecording ? t('messages.stopRecording') : `${recordingMode === 'video_note' ? t('messages.recordVideoNote') : t('messages.recordVoice')} · ${t('messages.holdToRecord')}`}
            >
              <span aria-hidden="true">{isRecording || isVideoRecording ? '■' : recordingMode === 'video_note' ? <Icon name="video" size={19} /> : <Icon name="microphone" size={19} />}</span>
            </button>
          </div>
          <button
            className="send-fab"
            type="submit"
            disabled={isUploading || isRecording || isVideoRecording || (!text.trim() && !selectedFile)}
            aria-label={isUploading ? t('messages.sendingMessage') : t('messages.send')}
            title={t('messages.send')}
          >
            <span aria-hidden="true">{isUploading ? '…' : <Icon name="send" size={19} />}</span>
          </button>
        </div>
        {isVideoRecording ? (
          <section className="video-note-recorder" aria-live="polite">
            <div className="video-note-recorder-preview">
              <video ref={videoRecordingPreviewRef} autoPlay muted playsInline />
              <span className="video-note-recorder-shade" aria-hidden="true" />
              <span className="video-note-recorder-status"><i aria-hidden="true" />{t('messages.recordingVideoNote')}</span>
              <time>{formatVoiceTime(videoRecordingSeconds)}</time>
            </div>
            <div className="video-note-recorder-copy">
              <strong>{t('messages.videoNote')}</strong>
              <span>{t('messages.stopVideoNote')}</span>
            </div>
            <div className="video-note-recorder-actions">
              <button type="button" onClick={cancelVideoRecording} aria-label={t('messages.removeAttachment')} title={t('messages.removeAttachment')}>
                <Icon name="x" size={18} strokeWidth={2.2} />
              </button>
              <button className="video-note-recorder-stop" type="button" onClick={stopVideoRecording} aria-label={t('messages.stopVideoNote')} title={t('messages.stopVideoNote')}>
                <span aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : messageType === 'video_note' && selectedFile && selectedVideoPreviewUrl ? (
          <section className="video-note-ready" aria-label={t('messages.videoNote')}>
            <div className="video-note-ready-preview">
              <video src={selectedVideoPreviewUrl} autoPlay loop muted playsInline preload="metadata" />
              <span className="video-note-ready-icon" aria-hidden="true"><Icon name="video" size={18} strokeWidth={2.2} /></span>
              <time>{formatVoiceTime(durationSeconds)}</time>
            </div>
            <div className="video-note-ready-copy">
              <strong>{t('messages.videoNote')}</strong>
              <span>{formatVoiceTime(durationSeconds)}</span>
            </div>
            <button type="button" onClick={clearSelectedMedia} aria-label={t('messages.removeAttachment')} title={t('messages.removeAttachment')}>
              <Icon name="x" size={18} strokeWidth={2.2} />
            </button>
          </section>
        ) : (selectedFile || isRecording) ? (
          <div className="composer-preview">
            <span className="composer-preview-icon" aria-hidden="true">{messageType === 'voice' || isRecording ? '🎙' : '📎'}</span>
            <span>{isRecording ? `${t('messages.recording')} · ${recordingSeconds}s${isRecordingLocked ? ' · 🔒' : ''}` : selectedFile.name}</span>
            {isRecording && !isRecordingLocked ? <button className="recording-lock-button" type="button" onClick={lockVoiceRecording} aria-label={t('messages.lockRecording')} title={t('messages.lockRecording')}>🔒</button> : null}
            {!isRecording ? <button type="button" onClick={clearSelectedMedia} aria-label={t('messages.removeAttachment')}>×</button> : null}
          </div>
        ) : null}
      </form> : <div className="branch-read-only-note">
        <span>{t('chats.branchReadOnly')}</span>
        {effectiveMode === 'mobile' && !chat?.is_subscribed ? (
          <button className="button button-secondary" type="button" onClick={handleSubscribeToBranch} disabled={isSubscribingToBranch}>
            {isSubscribingToBranch ? '…' : t('chats.subscribe')}
          </button>
        ) : null}
      </div>}
      {mediaViewerMessage ? (
        <div className="media-viewer-backdrop" role="presentation" onMouseDown={() => setMediaViewerMessage(null)}>
          <section className="media-viewer" role="dialog" aria-modal="true" aria-label={t('messages.mediaViewer')} onMouseDown={(event) => event.stopPropagation()}>
            <div className="media-viewer-toolbar">
              <span>{mediaViewerMessage.media_name || (mediaViewerType === 'photo' ? t('messages.photoAlt') : t('messages.video'))}</span>
              <div>
                <a href={mediaViewerMessage.media_url} download target="_blank" rel="noreferrer" aria-label={t('messages.downloadMedia')} title={t('messages.downloadMedia')}>↓</a>
                <button type="button" onClick={() => setMediaViewerMessage(null)} aria-label={t('messages.closeMedia')} title={t('messages.closeMedia')}>×</button>
              </div>
            </div>
            {mediaViewerIndex > 0 ? <button className="media-viewer-nav previous" type="button" onClick={() => setMediaViewerMessage(mediaMessages[mediaViewerIndex - 1])} aria-label={t('messages.previousMedia')}>‹</button> : null}
            {mediaViewerType === 'photo' ? <img src={mediaViewerMessage.media_url} alt={mediaViewerMessage.media_name || t('messages.photoAlt')} /> : <video src={mediaViewerMessage.media_url} controls autoPlay playsInline />}
            {mediaViewerIndex >= 0 && mediaViewerIndex < mediaMessages.length - 1 ? <button className="media-viewer-nav next" type="button" onClick={() => setMediaViewerMessage(mediaMessages[mediaViewerIndex + 1])} aria-label={t('messages.nextMedia')}>›</button> : null}
          </section>
        </div>
      ) : null}
      <PublicProfileSheet
        user={profileCardAuthor}
        isOpen={Boolean(profileCardAuthor)}
        onClose={() => setProfileCardAuthor(null)}
        onWrite={isPublicBranch ? openProfileDirectChat : null}
        isWriting={isOpeningProfileChat}
        presence={!isPublicBranch ? peerStatus : null}
      />
      {commentPost && chat ? <BranchCommentsPanel branch={chat} post={commentPost} session={session} language={language} t={t} event={branchCommentEvent} onClose={() => setCommentPost(null)} onCountChange={updatePostCommentCount} /> : null}
      {profileCardError ? <p className="error-text">{profileCardError}</p> : null}
      </section>
    </section>
  );
}
