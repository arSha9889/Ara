import { useCallback, useEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import {
  deleteMessage,
  editMessage,
  getChatMessages,
  markMessagesRead,
  sendMessage,
  setChannelPostCommentsEnabled,
  uploadChatMedia,
} from '../../features/chats/chatsApi.js';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';
import { formatFileSize } from '../../shared/format/fileSize.js';
import { ChannelCommentsPanel } from './ChannelCommentsPanel.jsx';
import { ChannelDetailsPanel } from './ChannelDetailsPanel.jsx';
import { MessageContent } from './MessageContent.jsx';

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,image/avif,video/mp4,video/webm,video/quicktime,audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain';

function initials(value) {
  return (value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const language = document.documentElement.lang || 'ru';
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function messageTypeForUpload(upload) {
  const mimeType = upload.media_mime_type || '';
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

function sortMessages(messages) {
  return [...messages].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
}

function upsertMessage(messages, nextMessage) {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) return sortMessages([...messages, nextMessage]);
  return messages.map((message) => message.id === nextMessage.id ? { ...message, ...nextMessage } : message);
}

function channelRealtimeNotice(status, t) {
  if (status === 'reconnecting') return t('workspace.chatPanel.realtimeReconnecting');
  if (status === 'disconnected') return t('workspace.chatPanel.realtimeDisconnected');
  if (status === 'connecting') return t('workspace.chatPanel.realtimeConnecting');
  return t('workspace.channels.historyNotice');
}

export function ChannelChatPanel({
  accessToken,
  chat,
  currentUserId,
  detailsRequestId,
  focusMessage,
  focusMessageId,
  focusRequestId,
  onBack,
  onChatChanged,
  onChannelLeft,
  onMessageFocused,
  onMessageSent,
  realtimeEvents,
  realtimeResyncVersion,
  realtimeStatus,
  t,
}) {
  const [channel, setChannel] = useState(chat);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [composerError, setComposerError] = useState('');
  const [panel, setPanel] = useState('posts');
  const [selectedPost, setSelectedPost] = useState(null);
  const fileInputRef = useRef(null);
  const activeRef = useRef(true);
  const postElementRefs = useRef(new Map());
  const processedRealtimeEventIdRef = useRef(0);

  useEffect(() => {
    if (detailsRequestId) setPanel('details');
  }, [detailsRequestId]);
  const handledResyncVersionRef = useRef(realtimeResyncVersion);
  const readMessageIdsRef = useRef(new Set());
  const readRetryTimerRef = useRef(null);
  const focusedRequestIdRef = useRef(0);
  const focusHighlightTimerRef = useRef(null);
  const [readRetryVersion, setReadRetryVersion] = useState(0);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const canPost = Boolean(channel.can_post);
  const canManagePosts = ['owner', 'admin'].includes(channel.current_role);
  const avatarUrl = mediaUrlForDesktop(channel.avatar_ref);

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
    setChannel(chat);
  }, [chat]);

  useEffect(() => {
    activeRef.current = true;
    processedRealtimeEventIdRef.current = 0;
    readMessageIdsRef.current = new Set();
    setMessages([]);
    setPanel('posts');
    setSelectedPost(null);
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
      if (['message.created', 'message.updated', 'message.deleted'].includes(payload.event) && payload.message) {
        setMessages((current) => upsertMessage(current, payload.message));
        setSelectedPost((current) => current?.id === payload.message.id ? { ...current, ...payload.message } : current);
        return;
      }
      if (payload.event.startsWith('branch_comment.') && payload.post_id && Number.isFinite(payload.comment_count)) {
        setMessages((current) => current.map((message) => String(message.id) === String(payload.post_id) ? { ...message, comment_count: payload.comment_count } : message));
        setSelectedPost((current) => current?.id === payload.post_id ? { ...current, comment_count: payload.comment_count } : current);
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
    setPanel('posts');
    setMessages((current) => upsertMessage(current, focusMessage));
  }, [focusMessage, focusMessageId, focusRequestId]);

  useEffect(() => {
    if (!focusMessageId || !focusRequestId || focusedRequestIdRef.current === focusRequestId) return;
    if (!messages.some((message) => String(message.id) === String(focusMessageId))) return;
    const postElement = postElementRefs.current.get(String(focusMessageId));
    if (!postElement) return;

    focusedRequestIdRef.current = focusRequestId;
    setHighlightedPostId(focusMessageId);
    postElement.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    window.clearTimeout(focusHighlightTimerRef.current);
    focusHighlightTimerRef.current = window.setTimeout(() => setHighlightedPostId(null), 2_400);
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

  async function submitPost(event) {
    event.preventDefault();
    const text = (editingPost ? draft : draft).trim();
    if (!canPost || isSending || isLoadingMessages || (!text && !selectedFile)) return;
    setComposerError('');
    setIsSending(true);
    try {
      let message;
      if (editingPost) {
        message = await editMessage(accessToken, chat.id, editingPost.id, text);
        setEditingPost(null);
      } else if (selectedFile) {
        const uploaded = await uploadChatMedia(accessToken, selectedFile);
        message = await sendMessage(accessToken, chat.id, {
          type: messageTypeForUpload(uploaded),
          text,
          media_url: uploaded.media_url,
          media_name: uploaded.media_name,
          media_mime_type: uploaded.media_mime_type,
          media_size_bytes: uploaded.media_size_bytes,
        });
        setSelectedFile(null);
      } else {
        message = await sendMessage(accessToken, chat.id, { type: 'text', text });
      }
      setMessages((current) => upsertMessage(current, message));
      setDraft('');
      void onMessageSent?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  async function deletePost(post) {
    if (isSending || !window.confirm(t('workspace.channels.deletePostConfirm'))) return;
    setComposerError('');
    setIsSending(true);
    try {
      const removed = await deleteMessage(accessToken, chat.id, post.id);
      setMessages((current) => upsertMessage(current, removed));
      void onChatChanged?.();
    } catch (requestError) {
      setComposerError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  async function toggleComments(post) {
    if (!canManagePosts || isSending) return;
    setComposerError('');
    setIsSending(true);
    try {
      const updated = await setChannelPostCommentsEnabled(accessToken, chat.id, post.id, !post.comments_enabled);
      setMessages((current) => upsertMessage(current, updated));
      setSelectedPost((current) => current?.id === updated.id ? updated : current);
    } catch (requestError) {
      setComposerError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  function openComments(post) {
    setSelectedPost(post);
    setPanel('comments');
  }

  function updateCommentCount(postId, commentCount) {
    setMessages((current) => current.map((message) => message.id === postId ? { ...message, comment_count: commentCount } : message));
    setSelectedPost((current) => current?.id === postId ? { ...current, comment_count: commentCount } : current);
  }

  function startEditing(post) {
    setEditingPost(post);
    setDraft(post.payload || '');
    setSelectedFile(null);
    setComposerError('');
  }

  function handleFileSelected(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    setSelectedFile(file);
    setEditingPost(null);
    setComposerError('');
  }

  function submitOnEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleChannelUpdated(updated) {
    setChannel(updated);
    void onChatChanged?.();
  }

  function leaveChannel() {
    void onChatChanged?.();
    if (onChannelLeft) {
      onChannelLeft(chat.id);
      return;
    }
    onBack?.();
  }

  if (panel === 'comments' && selectedPost) {
    return <ChannelCommentsPanel accessToken={accessToken} channel={channel} currentUserId={currentUserId} onBack={() => setPanel('posts')} onCommentCountChange={updateCommentCount} onCommentsChanged={() => void loadMessages({ showLoading: false })} post={selectedPost} realtimeEvents={realtimeEvents} t={t} />;
  }

  if (panel === 'details') {
    return <ChannelDetailsPanel accessToken={accessToken} channel={channel} currentUserId={currentUserId} onBack={() => setPanel('posts')} onDeleted={leaveChannel} onLeave={leaveChannel} onUpdated={handleChannelUpdated} t={t} />;
  }

  return <section className="workspace-chat-panel channel-chat-panel" aria-labelledby="channel-title">
    <header className="chat-header channel-header">
      <AraButton className="chat-back-button" type="button" onClick={onBack} size="compact" variant="ghost"><Icon name="arrow-left" size={18} />{t('workspace.channels.backToChannels')}</AraButton>
      <div className="chat-contact-heading channel-contact-heading">
        <span className="workspace-avatar channel-header-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(channel.title)}</span>
        <div><h1 id="channel-title">{channel.title || t('workspace.channels.untitled')}</h1><span>{channel.description || t('workspace.channels.noDescription')}</span><small>{channel.is_private ? t('workspace.channels.privateChannel') : t('workspace.channels.publicChannel')} · {t('workspace.channels.subscribersCount', { count: channel.subscriber_count || 0 })}</small></div>
      </div>
      <div className="chat-header-actions" aria-label={t('workspace.channels.actionsLabel')}><AraButton type="button" aria-label={t('workspace.channels.channelInfo')} title={t('workspace.channels.channelInfo')} onClick={() => setPanel('details')} size="icon" variant="ghost"><Icon name="settings" size={18} /></AraButton></div>
    </header>

    <div className="chat-history channel-post-history" aria-label={t('workspace.channels.postsLabel')} aria-busy={isLoadingMessages}>
      <div className={`chat-server-notice is-${realtimeStatus}`} role="status"><Icon name="shield" size={15} /><span>{channelRealtimeNotice(realtimeStatus, t)}</span></div>
      {historyError ? <div className="chat-history-error" role="alert"><strong>{t('workspace.chatPanel.historyLoadError')}</strong><span>{historyError}</span><AraButton type="button" onClick={() => void loadMessages()} size="compact" variant="primary">{t('workspace.retry')}</AraButton></div> : null}
      {isLoadingMessages ? <p className="chat-history-status" role="status">{t('workspace.channels.loadingPosts')}</p> : historyError ? null : messages.length ? messages.map((post) => {
        const isMine = String(post.sender_id) === String(currentUserId);
        const authorName = post.author?.display_name || post.author?.username || channel.title;
        const isNotificationTarget = String(post.id) === String(highlightedPostId);
        return <article className={`chat-message channel-post ${isMine ? 'is-mine' : ''} ${isNotificationTarget ? 'is-notification-target' : ''}`} key={post.id} ref={(element) => {
          const postId = String(post.id);
          if (element) postElementRefs.current.set(postId, element);
          else postElementRefs.current.delete(postId);
        }}>
          <div className="chat-message-bubble">
            <header className="channel-post-author"><strong>{authorName}</strong>{post.author?.username ? <span>@{post.author.username}</span> : null}</header>
            <MessageContent accessToken={accessToken} chatId={chat.id} message={post} t={t} />
            {!post.deleted_at ? <div className="channel-post-actions"><AraButton type="button" onClick={() => openComments(post)} disabled={!post.comments_enabled} size="compact" variant="ghost"><Icon name="chats" size={14} />{t('workspace.channels.commentsCount', { count: post.comment_count || 0 })}</AraButton>{canManagePosts ? <AraButton type="button" aria-pressed={post.comments_enabled} onClick={() => void toggleComments(post)} disabled={isSending} size="compact" variant={post.comments_enabled ? 'selected' : 'ghost'}><Icon name="chats" size={14} />{post.comments_enabled ? t('workspace.channels.disableComments') : t('workspace.channels.enableComments')}</AraButton> : null}{isMine && post.type === 'text' ? <AraButton type="button" onClick={() => startEditing(post)} size="compact" variant="ghost"><Icon name="edit" size={14} />{t('workspace.chatPanel.edit')}</AraButton> : null}{isMine ? <AraButton className="is-danger" type="button" onClick={() => void deletePost(post)} disabled={isSending} size="compact" variant="ghost"><Icon name="trash" size={14} />{t('workspace.chatPanel.delete')}</AraButton> : null}</div> : null}
          </div>
          <footer><time dateTime={post.created_at}>{formatMessageTime(post.created_at)}</time>{post.edited_at && !post.deleted_at ? <span>{t('workspace.chatPanel.edited')}</span> : null}</footer>
        </article>;
      }) : <div className="chat-empty-history"><span className="workspace-avatar workspace-avatar-large channel-header-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials(channel.title)}</span><strong>{t('workspace.channels.noPostsTitle')}</strong><p>{canPost ? t('workspace.channels.noPostsManagerText') : t('workspace.channels.noPostsText')}</p></div>}
    </div>

    {canPost ? <div className="chat-composer-area channel-composer-area">
      {composerError ? <p className="chat-composer-error" role="alert">{composerError}</p> : null}
      {editingPost ? <div className="chat-composer-context"><Icon name="edit" size={15} /><span><strong>{t('workspace.channels.editingPost')}</strong><small>{t('workspace.channels.editPostHint')}</small></span><AraButton type="button" aria-label={t('workspace.chatPanel.cancelEdit')} onClick={() => { setEditingPost(null); setDraft(''); }} size="compact" variant="ghost"><Icon name="close" size={15} /></AraButton></div> : null}
      {selectedFile ? <div className="chat-draft-type"><span><Icon name={selectedFile.type.startsWith('image/') ? 'image' : selectedFile.type.startsWith('video/') ? 'video' : 'document'} size={16} /></span><div><strong>{t('workspace.chatPanel.attachmentReady')}</strong><small>{selectedFile.name}{formatFileSize(selectedFile.size) ? ` · ${formatFileSize(selectedFile.size)}` : ''}</small></div><AraButton type="button" aria-label={t('workspace.chatPanel.removeAttachment')} onClick={() => setSelectedFile(null)} disabled={isSending} size="compact" variant="ghost"><Icon name="close" size={15} /></AraButton></div> : null}
      <form className="chat-composer channel-post-composer" onSubmit={submitPost}>
        <input ref={fileInputRef} className="sr-only" type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFileSelected} disabled={isLoadingMessages || isSending || Boolean(editingPost)} />
        <AraButton className="chat-composer-icon" type="button" aria-label={t('workspace.chatPanel.attachFile')} title={t('workspace.chatPanel.attachFile')} onClick={() => fileInputRef.current?.click()} disabled={isLoadingMessages || isSending || Boolean(editingPost)} size="icon" variant="ghost"><Icon name="attachment" size={18} /></AraButton>
        <label className="sr-only" htmlFor="channel-post-input">{t('workspace.channels.postLabel')}</label><textarea id="channel-post-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={submitOnEnter} rows="1" maxLength="4000" placeholder={editingPost ? t('workspace.chatPanel.editPlaceholder') : t('workspace.channels.postPlaceholder')} disabled={isLoadingMessages || isSending} />
        <AraButton className="chat-send-button" type="submit" disabled={(!draft.trim() && !selectedFile) || isLoadingMessages || isSending} aria-label={isSending ? t('workspace.channels.publishing') : editingPost ? t('workspace.chatPanel.saveEdit') : t('workspace.channels.publish')} size="icon" variant="primary"><Icon name={editingPost ? 'save' : 'send'} size={18} /></AraButton>
      </form>
      <p className="chat-composer-hint">{editingPost ? t('workspace.channels.editPostHint') : t('workspace.channels.postHint')}</p>
    </div> : <div className="channel-readonly-notice"><Icon name="channels" size={18} /><span>{t('workspace.channels.readOnlyNotice')}</span></div>}
  </section>;
}
