import { useCallback, useEffect, useRef, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import {
  deleteMessage,
  editMessage,
  getChatMessages,
  markMessagesRead,
  pinMessage,
  reactToMessage,
  sendMessage,
  uploadChatMedia,
} from '../../features/chats/chatsApi.js';
import { useAuthenticatedMediaUrl } from '../../shared/api/authenticatedMedia.js';

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
  return document.documentElement.lang === 'en' ? 'en' : 'ru';
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
  const existingPriority = DELIVERY_STATUS_PRIORITY[existing.delivery_status] ?? 0;
  const nextPriority = DELIVERY_STATUS_PRIORITY[nextMessage.delivery_status] ?? 0;
  const newestMessage = messageRevisionTime(nextMessage) >= messageRevisionTime(existing) ? nextMessage : existing;
  return {
    ...newestMessage,
    delivery_status: nextPriority >= existingPriority ? nextMessage.delivery_status : existing.delivery_status,
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

function displayMessageType(message) {
  if (message.type !== 'file') return message.type;
  if (message.media_mime_type?.startsWith('image/')) return 'photo';
  if (message.media_mime_type?.startsWith('video/')) return 'video';
  if (message.media_mime_type?.startsWith('audio/')) return 'audio';
  return 'file';
}

function messageTypeForUpload(upload) {
  if (upload.suggested_message_type === 'photo') return 'photo';
  if (upload.suggested_message_type === 'video') return 'video';
  return 'file';
}

function messageTypeLabel(message, t) {
  const key = {
    photo: 'photo', video: 'video', audio: 'audio', voice: 'audio', file: 'file', sticker: 'sticker', emoji: 'emoji',
  }[displayMessageType(message)];
  return key ? t(`workspace.chatPanel.type${key[0].toUpperCase()}${key.slice(1)}`) : message.payload;
}

function replyPreview(message, t) {
  if (!message || message.deleted_at) return t('workspace.chatPanel.deletedMessage');
  return message.type === 'text' ? message.payload : message.media_name || messageTypeLabel(message, t);
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

function MediaMessage({ accessToken, message, t }) {
  const displayType = displayMessageType(message);
  const { error, isLoading, url } = useAuthenticatedMediaUrl(message.deleted_at ? null : message.media_url, accessToken);

  if (message.deleted_at) return <p className="chat-deleted-message">{t('workspace.chatPanel.deletedMessage')}</p>;
  if (isLoading) return <p className="chat-media-status" role="status">{t('workspace.chatPanel.loadingMedia')}</p>;
  if (error || !url) return <p className="chat-media-status is-error">{t('workspace.chatPanel.mediaLoadError')}</p>;
  if (displayType === 'photo') return <><img className="chat-media-image" src={url} alt={message.media_name || t('workspace.chatPanel.photoAlt')} />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'video') return <><video className="chat-media-video" src={url} controls preload="metadata" />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'audio' || displayType === 'voice') return <><audio className="chat-media-audio" src={url} controls preload="metadata" />{message.payload ? <p>{message.payload}</p> : null}</>;
  if (displayType === 'file') return <><a className="chat-file-link" href={url} download={message.media_name || undefined}><Icon name="document" size={20} /><span><strong>{message.media_name || t('workspace.chatPanel.file')}</strong><small>{message.media_mime_type || formatFileSize(message.media_size_bytes)}</small></span></a>{message.payload ? <p>{message.payload}</p> : null}</>;
  return <p className="chat-unsupported-message">{t('workspace.chatPanel.unsupportedMessage')}</p>;
}

function MessageContent({ accessToken, message, t }) {
  if (message.deleted_at) return <p className="chat-deleted-message">{t('workspace.chatPanel.deletedMessage')}</p>;
  if (message.type === 'text' || message.type === 'emoji') return <p>{message.payload}</p>;
  if (message.type === 'call') return <p>{t('workspace.calls')}</p>;
  return <MediaMessage accessToken={accessToken} message={message} t={t} />;
}

export function ChatPanel({
  accessToken,
  chat,
  currentUserId,
  onBack,
  onChatChanged,
  onMessageSent,
  onRealtimeSend,
  onStartCall,
  canStartCall,
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
  const [readRetryVersion, setReadRetryVersion] = useState(0);
  const fileInputRef = useRef(null);
  const isCurrentRef = useRef(true);
  const processedRealtimeEventIdRef = useRef(0);
  const readMessageIdsRef = useRef(new Set());
  const readRetryTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const activityTimerRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);
  const handledResyncVersionRef = useRef(realtimeResyncVersion);
  const peer = chatState.peer;
  const peerName = peer?.display_name || peer?.username || t('workspace.unknownUser');
  const peerUsername = peer?.username || '';

  const loadMessages = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setIsLoadingMessages(true);
      setHistoryError('');
    }
    try {
      const history = await getChatMessages(accessToken, chat.id);
      if (isCurrentRef.current) {
        setMessages((current) => mergeMessages(Array.isArray(history) ? history : [], current));
        setHistoryError('');
      }
    } catch (requestError) {
      if (isCurrentRef.current && showLoading) setHistoryError(requestError.message);
    } finally {
      if (isCurrentRef.current && showLoading) setIsLoadingMessages(false);
    }
  }, [accessToken, chat.id]);

  useEffect(() => {
    setChatState(chat);
  }, [chat]);

  useEffect(() => {
    isCurrentRef.current = true;
    void loadMessages();
    return () => {
      isCurrentRef.current = false;
      window.clearTimeout(readRetryTimerRef.current);
      window.clearTimeout(typingStopTimerRef.current);
      window.clearTimeout(activityTimerRef.current);
      onRealtimeSend?.({ event: 'typing.stopped', chat_id: chat.id });
    };
  }, [chat.id, loadMessages, onRealtimeSend]);

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
      if (payload.chat_id !== chat.id) return;

      if (['message.created', 'message.updated', 'message.deleted', 'message.reactions_updated'].includes(payload.event) && payload.message) {
        setMessages((current) => upsertMessage(current, payload.message));
        if (payload.message.sender_id !== currentUserId) setActivity('');
        return;
      }

      if (payload.event === 'message.pin_updated' && payload.chat) {
        setChatState(payload.chat);
        setMessages((current) => syncPinnedState(current, payload.chat.pinned_message_id));
        onChatChanged?.();
        return;
      }

      if (payload.event === 'message.read' && payload.message) {
        setMessages((current) => current.map((message) => {
          if (message.id !== payload.message.id) return message;
          if (message.sender_id === currentUserId && payload.reader_id !== currentUserId) return { ...message, delivery_status: 'read' };
          return mergeMessage(message, payload.message);
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
    });
  }, [chat.id, currentUserId, onChatChanged, peer?.id, realtimeEvents, t]);

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
    if (!selectedFile) return;
    onRealtimeSend?.({ event: 'file.uploading', chat_id: chat.id });
    const uploadedMedia = await uploadChatMedia(accessToken, selectedFile);
    const message = await sendMessage(accessToken, chat.id, {
      type: messageTypeForUpload(uploadedMedia),
      text: draft.trim(),
      reply_to_message_id: replyingTo?.id ?? null,
      media_url: uploadedMedia.media_url,
      media_name: uploadedMedia.media_name,
      media_mime_type: uploadedMedia.media_mime_type,
      media_size_bytes: uploadedMedia.media_size_bytes,
    });
    setMessages((current) => upsertMessage(current, message));
    setDraft('');
    setSelectedFile(null);
    setReplyingTo(null);
    stopTyping();
    void onMessageSent?.();
  }

  async function submitMessage(event) {
    event.preventDefault();
    if (isSending || isLoadingMessages) return;
    const text = (editingMessage ? editText : draft).trim();
    if (!editingMessage && !selectedFile && !text) return;
    if (editingMessage && !text) return;

    setComposerError('');
    setIsSending(true);
    try {
      if (editingMessage) {
        const message = await editMessage(accessToken, chat.id, editingMessage.id, text);
        setMessages((current) => upsertMessage(current, message));
        setEditingMessage(null);
        setEditText('');
      } else if (selectedFile) {
        await sendMediaMessage();
      } else {
        const message = await sendMessage(accessToken, chat.id, {
          type: 'text', text, reply_to_message_id: replyingTo?.id ?? null,
        });
        setMessages((current) => upsertMessage(current, message));
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
      setChatState(nextChat);
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
    setSelectedFile(file);
  }

  function startEditing(message) {
    setEditingMessage(message);
    setEditText(message.payload || '');
    setSelectedFile(null);
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

  return (
    <section className="workspace-chat-panel" aria-labelledby="chat-title">
      <header className="chat-header">
        <button className="chat-back-button" type="button" onClick={onBack}><Icon name="arrow-left" size={18} />{t('workspace.chatPanel.back')}</button>
        <div className="chat-contact-heading">
          <span className={`workspace-avatar is-${avatarTone(peer?.id || chat.id)}`} aria-hidden="true">{initials(peerName, peerUsername)}</span>
          <div><h1 id="chat-title">{peerName}</h1><span>{activity || `${peerUsername ? `@${peerUsername} · ` : ''}${peerPresence(peer, t)}`}</span></div>
        </div>
        <div className="chat-header-actions" aria-label={t('workspace.chatPanel.actionsLabel')}>
          <button type="button" title={canStartCall ? t('workspace.chatPanel.startAudio') : t('workspace.chatPanel.callUnavailable')} aria-label={t('workspace.chatPanel.startAudio')} onClick={() => void onStartCall?.(chat, 'audio')} disabled={!canStartCall}><Icon name="calls" size={18} /></button>
          <button type="button" title={canStartCall ? t('workspace.chatPanel.startVideo') : t('workspace.chatPanel.callUnavailable')} aria-label={t('workspace.chatPanel.startVideo')} onClick={() => void onStartCall?.(chat, 'video')} disabled={!canStartCall}><Icon name="video" size={18} /></button>
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
          return <article className={`chat-message ${isMine ? 'is-mine' : ''} ${message.is_pinned ? 'is-pinned' : ''}`} key={message.id}>
            <div className="chat-message-bubble">
              {message.reply_to ? <div className="chat-reply-preview"><span>{message.reply_to.sender_id === currentUserId ? t('workspace.chatPanel.you') : peerName}</span><small>{replyPreview(message.reply_to, t)}</small></div> : null}
              <MessageContent accessToken={accessToken} message={message} t={t} />
              {!message.deleted_at && message.reactions?.length ? <div className="chat-reactions">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} aria-pressed={reaction.reacted_by_me} onClick={() => handleReaction(message, reaction.emoji)}>{reaction.emoji}<span>{reaction.count}</span></button>)}</div> : null}
              {!message.deleted_at ? <div className="chat-message-actions">
                <button type="button" onClick={() => setReplyingTo(message)}><Icon name="reply" size={14} />{t('workspace.chatPanel.reply')}</button>
                <button type="button" aria-expanded={openReactionPickerMessageId === message.id} onClick={() => setOpenReactionPickerMessageId((current) => current === message.id ? null : message.id)}><Icon name="smile" size={14} />{t('workspace.chatPanel.react')}</button>
                <button type="button" aria-pressed={message.is_pinned} onClick={() => handlePin(message)}><Icon name="pin" size={14} />{message.is_pinned ? t('workspace.chatPanel.unpin') : t('workspace.chatPanel.pin')}</button>
                {isMine && message.type === 'text' ? <button type="button" onClick={() => startEditing(message)}><Icon name="edit" size={14} />{t('workspace.chatPanel.edit')}</button> : null}
                {isMine ? <button className="is-danger" type="button" onClick={() => handleDelete(message)}><Icon name="trash" size={14} />{t('workspace.chatPanel.delete')}</button> : null}
              </div> : null}
              {openReactionPickerMessageId === message.id ? <div className="chat-reaction-picker" aria-label={t('workspace.chatPanel.reactionsLabel')}>{REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => handleReaction(message, emoji)}>{emoji}</button>)}</div> : null}
            </div>
            <footer><time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>{message.edited_at && !message.deleted_at ? <span>{t('workspace.chatPanel.edited')}</span> : null}{message.is_pinned ? <span>{t('workspace.chatPanel.pinned')}</span> : null}{isMine && deliveryStatus ? <span className="chat-delivery-status" title={deliveryStatus}><Icon name="check-double" size={14} /><span className="sr-only">{deliveryStatus}</span></span> : null}</footer>
          </article>;
        }) : <div className="chat-empty-history"><span className={`workspace-avatar workspace-avatar-large is-${avatarTone(peer?.id || chat.id)}`} aria-hidden="true">{initials(peerName, peerUsername)}</span><strong>{t('workspace.chatPanel.noMessagesTitle')}</strong><p>{t('workspace.chatPanel.noMessagesText')}</p></div>}
      </div>

      <div className="chat-composer-area">
        {composerError ? <p className="chat-composer-error" id="chat-message-error" role="alert">{composerError}</p> : null}
        {replyingTo ? <div className="chat-composer-context"><Icon name="reply" size={15} /><span><strong>{t('workspace.chatPanel.replyingTo')}</strong><small>{replyPreview(replyingTo, t)}</small></span><button type="button" aria-label={t('workspace.chatPanel.cancelReply')} onClick={() => setReplyingTo(null)}><Icon name="close" size={15} /></button></div> : null}
        {editingMessage ? <div className="chat-composer-context"><Icon name="edit" size={15} /><span><strong>{t('workspace.chatPanel.editingMessage')}</strong><small>{t('workspace.chatPanel.editHint')}</small></span><button type="button" aria-label={t('workspace.chatPanel.cancelEdit')} onClick={() => { setEditingMessage(null); setEditText(''); }}><Icon name="close" size={15} /></button></div> : null}
        {selectedFile ? <div className="chat-draft-type"><span><Icon name={selectedFile.type.startsWith('image/') ? 'image' : selectedFile.type.startsWith('video/') ? 'video' : 'document'} size={16} /></span><div><strong>{t('workspace.chatPanel.attachmentReady')}</strong><small>{selectedFile.name}{formatFileSize(selectedFile.size) ? ` · ${formatFileSize(selectedFile.size)}` : ''}</small></div><button type="button" aria-label={t('workspace.chatPanel.removeAttachment')} onClick={() => setSelectedFile(null)}><Icon name="close" size={15} /></button></div> : null}
        <form className="chat-composer" onSubmit={submitMessage}>
          <input ref={fileInputRef} className="sr-only" type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFileSelected} disabled={isLoadingMessages || isSending || Boolean(editingMessage)} />
          <button className="chat-composer-icon" type="button" aria-label={t('workspace.chatPanel.attachFile')} onClick={() => fileInputRef.current?.click()} disabled={isLoadingMessages || isSending || Boolean(editingMessage)}><Icon name="attachment" size={18} /></button>
          <label className="sr-only" htmlFor="chat-message-input">{t('workspace.chatPanel.composerLabel')}</label>
          <textarea id="chat-message-input" value={composerValue} onChange={(event) => editingMessage ? setEditText(event.target.value) : updateDraft(event.target.value)} onKeyDown={submitOnEnter} rows="1" maxLength="4000" placeholder={composerPlaceholder} aria-invalid={Boolean(composerError)} aria-describedby={composerError ? 'chat-message-error' : undefined} disabled={isLoadingMessages || isSending} />
          <button className="chat-send-button" type="submit" disabled={(!composerValue.trim() && !selectedFile) || isLoadingMessages || isSending} aria-label={isSending ? t('workspace.chatPanel.sending') : editingMessage ? t('workspace.chatPanel.saveEdit') : t('workspace.chatPanel.send')}><Icon name={editingMessage ? 'save' : 'send'} size={18} /></button>
        </form>
        <p className="chat-composer-hint">{editingMessage ? t('workspace.chatPanel.editHint') : t('workspace.chatPanel.composerHint')}<br />{t('workspace.chatPanel.attachmentsHint')}</p>
      </div>
    </section>
  );
}
