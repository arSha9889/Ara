import { useEffect, useRef, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { useAuthenticatedMediaBlob, useAuthenticatedMediaUrl } from '../../shared/api/authenticatedMedia.js';
import { decryptE2eeAttachment } from '../../shared/crypto/e2eeDesktop.js';

function formatFileSize(value) {
  if (!Number.isFinite(value) || value < 1) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function displayMessageType(message) {
  if (message.e2ee_attachment) {
    if (message.e2ee_attachment.media_kind) return message.e2ee_attachment.media_kind;
    if (message.e2ee_attachment.mime_type.startsWith('image/')) return 'photo';
    if (message.e2ee_attachment.mime_type.startsWith('video/')) return 'video';
    if (message.e2ee_attachment.mime_type.startsWith('audio/')) return 'audio';
    return 'file';
  }
  if (message.type !== 'file') return message.type;
  if (message.media_mime_type?.startsWith('image/')) return 'photo';
  if (message.media_mime_type?.startsWith('video/')) return 'video';
  if (message.media_mime_type?.startsWith('audio/')) return 'audio';
  return 'file';
}

function VoiceMessage({ durationSeconds, url, t }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const duration = Number(durationSeconds) || audioRef.current?.duration || 0;

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }

  function handleTimeUpdate() {
    setCurrentTime(audioRef.current?.currentTime || 0);
  }

  function handleEnded() {
    setIsPlaying(false);
    setCurrentTime(0);
  }

  return <div className={`chat-voice-message ${isPlaying ? 'is-playing' : ''}`}>
    <button type="button" className="chat-media-play" onClick={togglePlayback} aria-label={isPlaying ? t('workspace.chatPanel.pauseVoice') : t('workspace.chatPanel.playVoice')} title={isPlaying ? t('workspace.chatPanel.pauseVoice') : t('workspace.chatPanel.playVoice')}><Icon name={isPlaying ? 'pause' : 'play'} size={16} /></button>
    <div className="chat-voice-message-body">
      <span>{t('workspace.chatPanel.typeVoice')}</span>
      <div className="chat-voice-wave" aria-hidden="true">{Array.from({ length: 18 }).map((_, index) => <i key={index} style={{ '--voice-bar': index }} />)}</div>
    </div>
    <time>{formatDuration(isPlaying ? currentTime : duration)}</time>
    <audio ref={audioRef} src={url} preload="metadata" onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} />
  </div>;
}

function VideoNoteMessage({ durationSeconds, url, t }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const duration = Number(durationSeconds) || videoRef.current?.duration || 0;

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      return;
    }
    video.pause();
    setIsPlaying(false);
  }

  return <button className={`chat-video-note ${isPlaying ? 'is-playing' : ''}`} type="button" onClick={togglePlayback} aria-label={isPlaying ? t('workspace.chatPanel.pauseVideoNote') : t('workspace.chatPanel.playVideoNote')} title={isPlaying ? t('workspace.chatPanel.pauseVideoNote') : t('workspace.chatPanel.playVideoNote')}>
    <video ref={videoRef} src={url} playsInline preload="metadata" onEnded={() => setIsPlaying(false)} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} />
    <span className="chat-video-note-play" aria-hidden="true"><Icon name={isPlaying ? 'pause' : 'play'} size={18} /></span>
    <time>{formatDuration(duration)}</time>
  </button>;
}

function MediaMessage({ accessToken, message, t }) {
  const displayType = displayMessageType(message);
  const { error, isLoading, url } = useAuthenticatedMediaUrl(message.deleted_at ? null : message.media_url, accessToken);

  if (message.deleted_at) return <p className="chat-deleted-message">{t('workspace.chatPanel.deletedMessage')}</p>;
  if (isLoading) return <p className="chat-media-status" role="status">{t('workspace.chatPanel.loadingMedia')}</p>;
  if (error || !url) return <p className="chat-media-status is-error">{t('workspace.chatPanel.mediaLoadError')}</p>;
  if (message.type === 'voice') return <><VoiceMessage durationSeconds={message.duration_seconds} url={url} t={t} />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (message.type === 'video_note') return <><VideoNoteMessage durationSeconds={message.duration_seconds} url={url} t={t} />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'photo') return <><img className="chat-media-image" src={url} alt={message.media_name || t('workspace.chatPanel.photoAlt')} />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'video') return <><video className="chat-media-video" src={url} controls preload="metadata" />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'audio' || displayType === 'voice') return <><audio className="chat-media-audio" src={url} controls preload="metadata" />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'file') return <><a className="chat-file-link" href={url} download={message.media_name || undefined}><Icon name="document" size={20} /><span><strong>{message.media_name || t('workspace.chatPanel.file')}</strong><small>{message.media_mime_type || formatFileSize(message.media_size_bytes)}</small></span></a>{message.payload ? <p>{message.payload}</p> : null}</>;
  return <p className="chat-unsupported-message">{t('workspace.chatPanel.unsupportedMessage')}</p>;
}

function AttachmentPreview({ descriptor, url, t }) {
  if (descriptor.media_kind === 'voice') return <><VoiceMessage durationSeconds={descriptor.duration_seconds} url={url} t={t} />{descriptor.caption ? <p>{descriptor.caption}</p> : null}</>;
  if (descriptor.media_kind === 'video_note') return <><VideoNoteMessage durationSeconds={descriptor.duration_seconds} url={url} t={t} />{descriptor.caption ? <p>{descriptor.caption}</p> : null}</>;
  const displayType = descriptor.mime_type.startsWith('image/')
    ? 'photo'
    : descriptor.mime_type.startsWith('video/')
      ? 'video'
      : descriptor.mime_type.startsWith('audio/')
        ? 'audio'
        : 'file';
  if (displayType === 'photo') return <><img className="chat-media-image" src={url} alt={descriptor.name || t('workspace.chatPanel.photoAlt')} />{descriptor.caption ? <p>{descriptor.caption}</p> : null}</>;
  if (displayType === 'video') return <><video className="chat-media-video" src={url} controls preload="metadata" />{descriptor.caption ? <p>{descriptor.caption}</p> : null}</>;
  if (displayType === 'audio') return <><audio className="chat-media-audio" src={url} controls preload="metadata" />{descriptor.caption ? <p>{descriptor.caption}</p> : null}</>;
  return <><a className="chat-file-link" href={url} download={descriptor.name}><Icon name="document" size={20} /><span><strong>{descriptor.name}</strong><small>{descriptor.mime_type || formatFileSize(descriptor.size_bytes)}</small></span></a>{descriptor.caption ? <p>{descriptor.caption}</p> : null}</>;
}

function EncryptedAttachmentMessage({ accessToken, chatId, message, t }) {
  const { blob: ciphertext, error: loadError, isLoading } = useAuthenticatedMediaBlob(message.deleted_at ? null : message.media_url, accessToken);
  const [state, setState] = useState({ url: '', error: null });
  const descriptor = message.e2ee_attachment;

  useEffect(() => {
    if (!ciphertext || !descriptor) {
      setState({ url: '', error: null });
      return undefined;
    }

    let active = true;
    let objectUrl = '';
    void (async () => {
      try {
        const plaintext = await decryptE2eeAttachment({
          ciphertext,
          descriptor,
          chatId,
          senderId: String(message.sender_id),
        });
        objectUrl = URL.createObjectURL(plaintext);
        if (active) setState({ url: objectUrl, error: null });
      } catch {
        if (active) setState({ url: '', error: new Error('Encrypted attachment could not be decrypted') });
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [chatId, ciphertext, descriptor, message.sender_id]);

  if (message.deleted_at) return <p className="chat-deleted-message">{t('workspace.chatPanel.deletedMessage')}</p>;
  if (isLoading) return <p className="chat-media-status" role="status">{t('workspace.chatPanel.loadingMedia')}</p>;
  if (loadError || state.error || !state.url) return <p className="chat-media-status is-error">{t('workspace.chatPanel.encryptedAttachmentLoadError')}</p>;
  return <AttachmentPreview descriptor={descriptor} url={state.url} t={t} />;
}

export function MessageContent({ accessToken, chatId, message, t }) {
  if (message.deleted_at) return <p className="chat-deleted-message">{t('workspace.chatPanel.deletedMessage')}</p>;
  if (message.encryption_state === 'e2ee_web_v1' && !['verified', 'unverified', 'key_changed'].includes(message.e2ee_status)) {
    return <p className="chat-encrypted-unavailable">{t('workspace.chatPanel.encryptedMessageUnavailable')}</p>;
  }
  if (message.type === 'text' || message.type === 'emoji') return <p>{message.payload}</p>;
  if (message.encryption_state === 'e2ee_web_v1' && ['file', 'voice', 'video_note'].includes(message.type)) {
    return <EncryptedAttachmentMessage accessToken={accessToken} chatId={chatId} message={message} t={t} />;
  }
  if (message.type === 'call') return <p>{t('workspace.calls')}</p>;
  return <MediaMessage accessToken={accessToken} message={message} t={t} />;
}
