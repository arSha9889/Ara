import { useCallback, useEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import {
  createChannelPostComment,
  deleteChannelPostComment,
  getChannelPostComments,
  updateChannelPostComment,
} from '../../features/chats/chatsApi.js';
import { MessageContent } from './MessageContent.jsx';

function formatCommentTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const language = document.documentElement.lang || 'ru';
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function commentAuthorName(comment, t) {
  return comment.author?.display_name || comment.author?.username || t('workspace.unknownUser');
}

function upsertComment(comments, nextComment) {
  const index = comments.findIndex((comment) => comment.id === nextComment.id);
  if (index === -1) return [...comments, nextComment].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
  return comments.map((comment) => comment.id === nextComment.id ? { ...comment, ...nextComment } : comment);
}

export function ChannelCommentsPanel({
  accessToken,
  channel,
  currentUserId,
  onBack,
  onCommentCountChange,
  onCommentsChanged,
  post,
  realtimeEvents,
  t,
}) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [editingComment, setEditingComment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const activeRef = useRef(true);
  const processedRealtimeEventIdRef = useRef(0);
  const canComment = Boolean(channel.is_subscribed && post.comments_enabled);

  const loadComments = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setIsLoading(true);
    setError('');
    try {
      const response = await getChannelPostComments(accessToken, channel.id, post.id);
      if (activeRef.current) setComments(Array.isArray(response) ? response : []);
    } catch (requestError) {
      if (activeRef.current) setError(requestError.message);
    } finally {
      if (activeRef.current && showLoading) setIsLoading(false);
    }
  }, [accessToken, channel.id, post.id]);

  useEffect(() => {
    activeRef.current = true;
    setComments([]);
    setDraft('');
    setEditingComment(null);
    processedRealtimeEventIdRef.current = 0;
    void loadComments();
    return () => {
      activeRef.current = false;
    };
  }, [loadComments]);

  useEffect(() => {
    const nextEvents = realtimeEvents.filter((event) => event.id > processedRealtimeEventIdRef.current);
    if (!nextEvents.length) return;

    nextEvents.forEach(({ id, payload }) => {
      processedRealtimeEventIdRef.current = id;
      if (String(payload.chat_id) !== String(channel.id) || String(payload.post_id) !== String(post.id) || !payload.event?.startsWith('branch_comment.')) return;
      if (payload.comment) setComments((current) => upsertComment(current, payload.comment));
      if (Number.isFinite(payload.comment_count)) onCommentCountChange?.(post.id, payload.comment_count);
    });
  }, [channel.id, onCommentCountChange, post.id, realtimeEvents]);

  async function submitComment(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSaving || !canComment) return;

    setError('');
    setIsSaving(true);
    try {
      if (editingComment) {
        const comment = await updateChannelPostComment(accessToken, channel.id, editingComment.id, text);
        setComments((current) => upsertComment(current, comment));
        setEditingComment(null);
      } else {
        const comment = await createChannelPostComment(accessToken, channel.id, post.id, text);
        setComments((current) => upsertComment(current, comment));
        void onCommentsChanged?.();
      }
      setDraft('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeComment(comment) {
    if (isSaving || !window.confirm(t('workspace.channels.deleteCommentConfirm'))) return;
    setError('');
    setIsSaving(true);
    try {
        const removed = await deleteChannelPostComment(accessToken, channel.id, comment.id);
        setComments((current) => upsertComment(current, removed));
        void onCommentsChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  function editComment(comment) {
    setEditingComment(comment);
    setDraft(comment.text);
    setError('');
  }

  function submitOnEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <section className="workspace-chat-panel channel-comments-panel" aria-labelledby="channel-comments-title">
    <header className="chat-header channel-comments-header">
      <AraButton className="chat-back-button" type="button" onClick={onBack} size="compact" variant="ghost"><Icon name="arrow-left" size={18} />{t('workspace.channels.backToPosts')}</AraButton>
      <div className="channel-comments-heading"><h1 id="channel-comments-title">{t('workspace.channels.commentsTitle')}</h1><span>{t('workspace.channels.commentsForPost')}</span></div>
    </header>

    <div className="channel-comments-history" aria-busy={isLoading}>
      <article className="channel-comment-source"><span>{t('workspace.channels.sourcePost')}</span><MessageContent accessToken={accessToken} chatId={channel.id} message={post} t={t} /></article>
      {error ? <div className="chat-history-error" role="alert"><strong>{t('workspace.channels.commentsError')}</strong><span>{error}</span><AraButton type="button" onClick={() => void loadComments()} size="compact" variant="primary">{t('workspace.retry')}</AraButton></div> : null}
      {isLoading ? <p className="chat-history-status" role="status">{t('workspace.channels.loadingComments')}</p> : comments.length ? <div className="channel-comment-list">{comments.map((comment) => {
        const isAuthor = String(comment.author_id) === String(currentUserId);
        const canDelete = isAuthor || comment.can_moderate;
        return <article className={`channel-comment ${comment.deleted_at ? 'is-deleted' : ''}`} key={comment.id}>
          <header><strong>{commentAuthorName(comment, t)}</strong><time dateTime={comment.created_at}>{formatCommentTime(comment.created_at)}</time></header>
          <p>{comment.deleted_at ? t('workspace.channels.deletedComment') : comment.text}</p>
          {!comment.deleted_at && (isAuthor || canDelete) ? <footer>{isAuthor ? <AraButton type="button" onClick={() => editComment(comment)} disabled={isSaving} size="compact" variant="ghost"><Icon name="edit" size={13} />{t('workspace.chatPanel.edit')}</AraButton> : null}{canDelete ? <AraButton className="is-danger" type="button" onClick={() => void removeComment(comment)} disabled={isSaving} size="compact" variant="ghost"><Icon name="trash" size={13} />{t('workspace.chatPanel.delete')}</AraButton> : null}</footer> : null}
        </article>;
      })}</div> : <div className="channel-comments-empty"><strong>{t('workspace.channels.noCommentsTitle')}</strong><span>{t('workspace.channels.noCommentsText')}</span></div>}
    </div>

    <form className="channel-comment-composer" onSubmit={submitComment}>
      {editingComment ? <div className="channel-composer-context"><span>{t('workspace.channels.editingComment')}</span><AraButton type="button" onClick={() => { setEditingComment(null); setDraft(''); }} aria-label={t('workspace.chatPanel.cancelEdit')} size="icon" variant="ghost"><Icon name="close" size={15} /></AraButton></div> : null}
      {error ? <p className="chat-composer-error" role="alert">{error}</p> : null}
      {canComment ? <><label className="sr-only" htmlFor="channel-comment-input">{t('workspace.channels.commentLabel')}</label><textarea id="channel-comment-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={submitOnEnter} rows="2" maxLength="2000" placeholder={t('workspace.channels.commentPlaceholder')} disabled={isSaving} /><div><span>{t('workspace.channels.commentHint')}</span><AraButton type="submit" variant="primary" disabled={isSaving || !draft.trim()}>{isSaving ? t('workspace.channels.savingComment') : editingComment ? t('workspace.chatPanel.saveEdit') : t('workspace.channels.sendComment')}</AraButton></div></> : <p className="channel-comment-closed">{post.comments_enabled ? t('workspace.channels.subscribeToComment') : t('workspace.channels.commentsDisabled')}</p>}
    </form>
  </section>;
}
