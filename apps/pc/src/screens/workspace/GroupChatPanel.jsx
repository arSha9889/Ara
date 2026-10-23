import { useCallback, useEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
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
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';
import { formatFileSize } from '../../shared/format/fileSize.js';
import { GroupDetailsPanel } from './GroupDetailsPanel.jsx';
import { MessageContent, displayMessageType } from './MessageContent.jsx';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];
const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,image/avif,video/mp4,video/webm,video/quicktime,audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain';

function initials(value) {
  return (value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang || 'ru', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function messageTypeForUpload(upload) {
  const mimeType = upload.media_mime_type || '';
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function sortMessages(messages) {
  return [...messages].sort((left, right) => {
    const leftTime = Date.parse(left.created_at) || 0;
    const rightTime = Date.parse(right.created_at) || 0;
    return leftTime === rightTime ? String(left.id).localeCompare(String(right.id)) : leftTime - rightTime;
  });
}

function upsertMessage(messages, nextMessage) {
  const index = messages.findIndex((message) => String(message.id) === String(nextMessage.id));
  if (index === -1) return sortMessages([...messages, nextMessage]);
  return messages.map((message) => String(message.id) === String(nextMessage.id) ? { ...message, ...nextMessage } : message);
}

function syncPinnedState(messages, pinnedMessageId) {
  return messages.map((message) => ({ ...message, is_pinned: String(message.id) === String(pinnedMessageId) }));
}

function messagePreview(message, t) {
  if (!message || message.deleted_at) return t('workspace.chatPanel.deletedMessage');
  if (message.type === 'text' || message.type === 'emoji') return message.payload;
  const type = displayMessageType(message);
  const suffix = type ? `type${type[0].toUpperCase()}${type.slice(1)}` : 'typeFile';
  return message.media_name || t(`workspace.chatPanel.${suffix}`);
}

function realtimeNotice(status, t) {
  if (status === 'reconnecting') return t('workspace.chatPanel.realtimeReconnecting');
  if (status === 'disconnected') return t('workspace.chatPanel.realtimeDisconnected');
  if (status === 'connecting') return t('workspace.chatPanel.realtimeConnecting');
  return t('workspace.chatPanel.historyNotice');
}

export function GroupChatPanel({
  accessToken,
  chat,
  currentUserId,
  focusMessage,
  focusMessageId,
  focusRequestId,
  onBack,
  onChatChanged,
  onGroupLeft,
  onMessageFocused,
  onMessageSent,
  realtimeEvents,
  realtimeResyncVersion,
  realtimeStatus,
  t,
}) {
  const [group, setGroup] = useState(chat);
  const [panel, setPanel] = useState('messages');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [composerError, setComposerError] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [readRetryVersion, setReadRetryVersion] = useState(0);
  const fileInputRef = useRef(null);
  const activeRef = useRef(true);
  const messageElementRefs = useRef(new Map());
  const processedRealtimeEventIdRef = useRef(0);
  const handledResyncVersionRef = useRef(realtimeResyncVersion);
  const readMessageIdsRef = useRef(new Set());
  const readRetryTimerRef = useRef(null);
  const focusedRequestIdRef = useRef(0);
  const focusHighlightTimerRef = useRef(null);
  const avatarUrl = mediaUrlForDesktop(group.avatar_ref);

  const loadMessages = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setIsLoadingMessages(true);
    setHistoryError('');
    try {
      const history = await getChatMessages(accessToken, chat.id);
      if (activeRef.current) setMessages(Array.isArray(history) ? sortMessages(history) : []);
    } catch (requestError) {
      if (activeRef.current && showLoading) setHistoryError(requestError.message);
    } finally {
      if (activeRef.current && showLoading) setIsLoadingMessages(false);
    }
  }, [accessToken, chat.id]);

  useEffect(() => {
    setGroup(chat);
  }, [chat]);

  useEffect(() => {
    activeRef.current = true;
    void loadMessages();
    return () => {
      activeRef.current = false;
      window.clearTimeout(readRetryTimerRef.current);
      window.clearTimeout(focusHighlightTimerRef.current);
    };
  }, [chat.id, loadMessages]);

  useEffect(() => {
    const nextEvents = realtimeEvents.filter((event) => event.id > processedRealtimeEventIdRef.current);
    if (!nextEvents.length) return;

    nextEvents.forEach(({ id, payload }) => {
      processedRealtimeEventIdRef.current = id;
      if (String(payload.chat_id) !== String(chat.id)) return;
      if (payload.chat?.type === 'group') setGroup(payload.chat);
      if (['message.created', 'message.updated', 'message.deleted', 'message.reactions_updated'].includes(payload.event) && payload.message) {
        setMessages((current) => upsertMessage(current, payload.message));
        return;
      }
      if (payload.event.startsWith('group.') && payload.message) {
        setMessages((current) => upsertMessage(current, payload.message));
        return;
      }
      if (payload.event === 'message.pin_updated' && payload.chat) {
        setGroup(payload.chat);
        setMessages((current) => syncPinnedState(current, payload.chat.pinned_message_id));
        return;
      }
      if (payload.event === 'message.read' && payload.message) {
        setMessages((current) => upsertMessage(current, payload.message));
      }
    });
  }, [chat.id, realtimeEvents]);

  useEffect(() => {
    if (handledResyncVersionRef.current === realtimeResyncVersion) return;
    handledResyncVersionRef.current = realtimeResyncVersion;
    void loadMessages({ showLoading: false });
  }, [loadMessages, realtimeResyncVersion]);

  useEffect(() => {
    if (!focusMessage || !focusMessageId || !focusRequestId) return;
    setPanel('messages');
    setMessages((current) => upsertMessage(current, focusMessage));
  }, [focusMessage, focusMessageId, focusRequestId]);

  useEffect(() => {
    if (!focusMessageId || !focusRequestId || focusedRequestIdRef.current === focusRequestId) return;
    if (!messages.some((message) => String(message.id) === String(focusMessageId))) return;
    const messageElement = messageElementRefs.current.get(String(focusMessageId));
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
    if (!accessToken || !currentUserId || isLoadingMessages) return;
    const unreadMessageIds = messages
      .filter((message) => !message.deleted_at && String(message.sender_id) !== String(currentUserId) && !readMessageIdsRef.current.has(message.id))
      .map((message) => message.id);
    if (!unreadMessageIds.length) return;
    unreadMessageIds.forEach((messageId) => readMessageIdsRef.current.add(messageId));

    void (async () => {
      try {
        await markMessagesRead(accessToken, chat.id, unreadMessageIds);
      } catch {
        unreadMessageIds.forEach((messageId) => readMessageIdsRef.current.delete(messageId));
        window.clearTimeout(readRetryTimerRef.current);
        readRetryTimerRef.current = window.setTimeout(() => {
          if (activeRef.current) setReadRetryVersion((current) => current + 1);
        }, 2_000);
      }
    })();
  }, [accessToken, chat.id, currentUserId, isLoadingMessages, messages, readRetryVersion]);

  async function submitMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (isSending || isLoadingMessages || (!text && !selectedFile)) return;
    setComposerError('');
    setIsSending(true);
    try {
      let message;
      if (editingMessage) {
        message = await editMessage(accessToken, chat.id, editingMessage.id, text);
        setEditingMessage(null);
      } else if (selectedFile) {
        const uploaded = await uploadChatMedia(accessToken, selectedFile);
        message = await sendMessage(accessToken, chat.id, {
          type: messageTypeForUpload(uploaded),
          text,
          media_url: uploaded.media_url,
          media_name: uploaded.media_name,
          media_mime_type: uploaded.media_mime_type,
          media_size_bytes: uploaded.media_size_bytes,
          reply_to_message_id: replyingTo?.id ?? null,
        });
        setSelectedFile(null);
      } else {
        message = await sendMessage(accessToken, chat.id, { type: 'text', text, reply_to_message_id: replyingTo?.id ?? null });
      }
      setMessages((current) => upsertMessage(current, message));
      setDraft('');
      setReplyingTo(null);
      void onMessageSent?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDelete(message) {
    setComposerError('');
    try {
      const removed = await deleteMessage(accessToken, chat.id, message.id);
      setMessages((current) => upsertMessage(current, removed));
      if (String(group.pinned_message_id) === String(message.id)) setGroup((current) => ({ ...current, pinned_message_id: null }));
      void onChatChanged?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    }
  }

  async function handlePin(message) {
    setComposerError('');
    try {
      const updated = await pinMessage(accessToken, chat.id, message.id);
      setGroup(updated);
      setMessages((current) => syncPinnedState(current, updated.pinned_message_id));
      void onChatChanged?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    }
  }

  async function handleReaction(message, emoji) {
    setComposerError('');
    try {
      const updated = await reactToMessage(accessToken, chat.id, message.id, emoji);
      setMessages((current) => upsertMessage(current, updated));
      setOpenReactionPickerMessageId(null);
    } catch (requestError) {
      setComposerError(requestError.message);
    }
  }

  function startEditing(message) {
    setEditingMessage(message);
    setDraft(message.payload || '');
    setSelectedFile(null);
    setReplyingTo(null);
    setOpenReactionPickerMessageId(null);
  }

  function handleFileSelected(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    setSelectedFile(file);
    setEditingMessage(null);
    setComposerError('');
  }

  function submitOnEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleGroupUpdated(updated) {
    setGroup(updated);
    onChatChanged?.(updated);
  }

  function handleGroupLeft() {
    onGroupLeft?.(chat.id);
    if (!onGroupLeft) onBack?.();
  }

  if (panel === 'details') {
    return <GroupDetailsPanel accessToken={accessToken} currentUserId={currentUserId} group={group} onBack={() => setPanel('messages')} onDeleted={handleGroupLeft} onLeave={handleGroupLeft} onUpdated={handleGroupUpdated} t={t} />;
  }

  return <section className="workspace-chat-panel group-chat-panel" aria-labelledby="group-title">
    <header className="chat-header group-header">
      <AraButton className="chat-back-button" onClick={onBack} size="compact" type="button" variant="ghost"><Icon name="arrow-left" size={18} />{t('workspace.groups.backToGroups')}</AraButton>
      <div className="chat-contact-heading group-contact-heading">
        <span className="workspace-avatar channel-header-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(group.title)}</span>
        <div><h1 id="group-title">{group.title || t('workspace.groups.untitled')}</h1><span>{group.description || t('workspace.groups.noDescription')}</span><small>{t('workspace.groups.privateGroup')} · {t('workspace.groups.membersCount', { count: group.participant_ids?.length || 0 })}</small></div>
      </div>
      <div className="chat-header-actions" aria-label={t('workspace.groups.actionsLabel')}><AraButton aria-label={t('workspace.groups.groupInfoAction')} onClick={() => setPanel('details')} size="icon" title={t('workspace.groups.groupInfoAction')} type="button" variant="ghost"><Icon name="settings" size={18} /></AraButton><AraButton aria-label={t('workspace.chatPanel.refreshHistory')} disabled={isLoadingMessages || isSending} onClick={() => void loadMessages()} size="icon" title={t('workspace.chatPanel.refreshHistory')} type="button" variant="ghost"><Icon name="refresh" size={18} /></AraButton></div>
    </header>

    <div aria-busy={isLoadingMessages} aria-label={t('workspace.groups.historyLabel')} className="chat-history group-message-history">
      <div className={`chat-server-notice is-${realtimeStatus}`} role="status"><Icon name="shield" size={15} /><span>{realtimeNotice(realtimeStatus, t)}</span></div>
      {historyError ? <div className="chat-history-error" role="alert"><strong>{t('workspace.chatPanel.historyLoadError')}</strong><span>{historyError}</span><AraButton onClick={() => void loadMessages()} size="compact" type="button" variant="primary">{t('workspace.retry')}</AraButton></div> : null}
      {isLoadingMessages ? <p className="chat-history-status" role="status">{t('workspace.chatPanel.loadingHistory')}</p> : historyError ? null : messages.length ? messages.map((message) => {
        const isSystem = message.type === 'system';
        const isMine = String(message.sender_id) === String(currentUserId);
        const authorName = message.author?.display_name || message.author?.username || t('workspace.unknownUser');
        const isFocused = String(message.id) === String(highlightedMessageId);
        return <article className={`chat-message group-message ${isMine ? 'is-mine' : ''} ${isFocused ? 'is-notification-target' : ''} ${isSystem ? 'is-system' : ''}`} key={message.id} ref={(element) => {
          const messageId = String(message.id);
          if (element) messageElementRefs.current.set(messageId, element);
          else messageElementRefs.current.delete(messageId);
        }}>
          <div className="chat-message-bubble">
            {!isSystem ? <header className="group-message-author"><strong>{isMine ? t('workspace.chatPanel.you') : authorName}</strong>{message.author?.username && !isMine ? <span>@{message.author.username}</span> : null}</header> : null}
            {!isSystem && message.reply_to ? <div className="chat-reply-preview"><span>{message.reply_to.author?.display_name || t('workspace.chatPanel.you')}</span><small>{messagePreview(message.reply_to, t)}</small></div> : null}
            <MessageContent accessToken={accessToken} chatId={chat.id} message={message} t={t} />
            {!isSystem && message.reactions?.length ? <div className="chat-reactions">{message.reactions.map((reaction) => <AraButton aria-pressed={reaction.reacted_by_me} key={reaction.emoji} onClick={() => void handleReaction(message, reaction.emoji)} size="compact" type="button" variant={reaction.reacted_by_me ? 'selected' : 'surface'}>{reaction.emoji}<span>{reaction.count}</span></AraButton>)}</div> : null}
            {!isSystem && !message.deleted_at ? <div className="chat-message-actions"><AraButton onClick={() => setReplyingTo(message)} size="compact" type="button" variant="ghost"><Icon name="reply" size={14} />{t('workspace.chatPanel.reply')}</AraButton><AraButton aria-expanded={openReactionPickerMessageId === message.id} onClick={() => setOpenReactionPickerMessageId((current) => current === message.id ? null : message.id)} size="compact" type="button" variant="ghost"><Icon name="smile" size={14} />{t('workspace.chatPanel.react')}</AraButton><AraButton aria-pressed={message.is_pinned} onClick={() => void handlePin(message)} size="compact" type="button" variant={message.is_pinned ? 'selected' : 'ghost'}><Icon name="pin" size={14} />{message.is_pinned ? t('workspace.chatPanel.unpin') : t('workspace.chatPanel.pin')}</AraButton>{isMine && message.type === 'text' ? <AraButton onClick={() => startEditing(message)} size="compact" type="button" variant="ghost"><Icon name="edit" size={14} />{t('workspace.chatPanel.edit')}</AraButton> : null}{isMine ? <AraButton className="is-danger" onClick={() => void handleDelete(message)} size="compact" type="button" variant="ghost"><Icon name="trash" size={14} />{t('workspace.chatPanel.delete')}</AraButton> : null}</div> : null}
            {!isSystem && openReactionPickerMessageId === message.id ? <div aria-label={t('workspace.chatPanel.reactionsLabel')} className="chat-reaction-picker">{REACTION_EMOJIS.map((emoji) => <AraButton key={emoji} onClick={() => void handleReaction(message, emoji)} size="compact" type="button" variant="surface">{emoji}</AraButton>)}</div> : null}
          </div>
          <footer><time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>{message.edited_at && !message.deleted_at ? <span>{t('workspace.chatPanel.edited')}</span> : null}{message.is_pinned ? <span>{t('workspace.chatPanel.pinned')}</span> : null}</footer>
        </article>;
      }) : <div className="chat-empty-history"><span className="workspace-avatar workspace-avatar-large channel-header-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(group.title)}</span><strong>{t('workspace.groups.noMessagesTitle')}</strong><p>{t('workspace.groups.noMessagesText')}</p></div>}
    </div>

    <div className="chat-composer-area">
      {composerError ? <p className="chat-composer-error" id="group-message-error" role="alert">{composerError}</p> : null}
      {replyingTo ? <div className="chat-composer-context"><Icon name="reply" size={15} /><span><strong>{t('workspace.chatPanel.replyingTo')}</strong><small>{messagePreview(replyingTo, t)}</small></span><AraButton aria-label={t('workspace.chatPanel.cancelReply')} onClick={() => setReplyingTo(null)} size="compact" type="button" variant="ghost"><Icon name="close" size={15} /></AraButton></div> : null}
      {editingMessage ? <div className="chat-composer-context"><Icon name="edit" size={15} /><span><strong>{t('workspace.chatPanel.editingMessage')}</strong><small>{t('workspace.chatPanel.editHint')}</small></span><AraButton aria-label={t('workspace.chatPanel.cancelEdit')} onClick={() => { setEditingMessage(null); setDraft(''); }} size="compact" type="button" variant="ghost"><Icon name="close" size={15} /></AraButton></div> : null}
      {selectedFile ? <div className="chat-draft-type"><span><Icon name={selectedFile.type.startsWith('image/') ? 'image' : selectedFile.type.startsWith('video/') ? 'video' : 'document'} size={16} /></span><div><strong>{t('workspace.chatPanel.attachmentReady')}</strong><small>{selectedFile.name}{formatFileSize(selectedFile.size) ? ` · ${formatFileSize(selectedFile.size)}` : ''}</small></div><AraButton aria-label={t('workspace.chatPanel.removeAttachment')} disabled={isSending} onClick={() => setSelectedFile(null)} size="compact" type="button" variant="ghost"><Icon name="close" size={15} /></AraButton></div> : null}
      <form className="chat-composer" onSubmit={submitMessage}>
        <input accept={ACCEPTED_FILE_TYPES} className="sr-only" disabled={isLoadingMessages || isSending || Boolean(editingMessage)} onChange={handleFileSelected} ref={fileInputRef} type="file" />
        <AraButton aria-label={t('workspace.chatPanel.attachFile')} className="chat-composer-icon" disabled={isLoadingMessages || isSending || Boolean(editingMessage)} onClick={() => fileInputRef.current?.click()} size="icon" title={t('workspace.chatPanel.attachFile')} type="button" variant="ghost"><Icon name="attachment" size={18} /></AraButton>
        <label className="sr-only" htmlFor="group-message-input">{t('workspace.chatPanel.composerLabel')}</label><textarea aria-describedby={composerError ? 'group-message-error' : undefined} aria-invalid={Boolean(composerError)} disabled={isLoadingMessages || isSending} id="group-message-input" maxLength="4000" onChange={(event) => { setDraft(event.target.value); setComposerError(''); }} onKeyDown={submitOnEnter} placeholder={editingMessage ? t('workspace.chatPanel.editPlaceholder') : t('workspace.groups.messagePlaceholder')} rows="1" value={draft} />
        <AraButton aria-label={isSending ? t('workspace.chatPanel.sending') : editingMessage ? t('workspace.chatPanel.saveEdit') : t('workspace.chatPanel.send')} className="chat-send-button" disabled={(!draft.trim() && !selectedFile) || isLoadingMessages || isSending} size="icon" type="submit" variant="primary"><Icon name={editingMessage ? 'save' : 'send'} size={18} /></AraButton>
      </form>
      <p className="chat-composer-hint">{editingMessage ? t('workspace.chatPanel.editHint') : t('workspace.chatPanel.composerHint')}<br />{t('workspace.chatPanel.attachmentsHint')}</p>
    </div>
  </section>;
}
