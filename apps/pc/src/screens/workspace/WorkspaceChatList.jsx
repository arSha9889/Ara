import { AraButton } from '../../components/AraButton.jsx';
import { ThemeToggle } from '../../components/ThemeLanguageControls.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

const AVATAR_TONES = ['violet', 'coral', 'yellow', 'blue'];

function initials(displayName, username) {
  const value = displayName || username || '?';
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function avatarTone(value) {
  const total = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_TONES[total % AVATAR_TONES.length];
}

function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(document.documentElement.lang || 'ru', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short' }).format(date);
}

function chatPreview(lastMessage, t) {
  if (!lastMessage) return t('workspace.noMessagesPreview');
  if (lastMessage.encryption_state === 'e2ee_web_v1') return t('workspace.chatPanel.encryptedMessage');
  if (lastMessage.type === 'text' || lastMessage.type === 'emoji') return lastMessage.payload;
  if (lastMessage.type === 'photo' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('image/'))) return t('workspace.chatPanel.typePhoto');
  if (lastMessage.type === 'video' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('video/'))) return t('workspace.chatPanel.typeVideo');
  if (lastMessage.type === 'voice' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('audio/'))) return t('workspace.chatPanel.typeAudio');
  if (lastMessage.type === 'call') return t('workspace.calls');
  return t('workspace.chatPanel.typeFile');
}

function ChatListAvatar({ chat, name, username }) {
  const avatarRef = chat.type === 'branch' ? chat.avatar_ref : chat.peer?.avatar_ref;
  const avatarUrl = mediaUrlForDesktop(avatarRef);
  if (avatarUrl) return <span className="workspace-avatar"><img src={avatarUrl} alt="" /></span>;
  return <span className={`workspace-avatar is-${avatarTone(chat.peer?.id || chat.id)}`} aria-hidden="true">{initials(name, username)}</span>;
}

function WorkspaceChatRow({ activeSection, chat, onOpenChat, selectedChatId, t }) {
  const peer = chat.peer;
  const name = chat.type === 'branch'
    ? chat.title || t('workspace.channels.untitled')
    : peer?.display_name || peer?.username || t('workspace.unknownUser');
  const username = chat.type === 'branch' ? chat.slug || '' : peer?.username || '';
  const preview = chatPreview(chat.last_message, t);
  const timestamp = formatChatTime(chat.last_message?.created_at || chat.updated_at);
  const isOpen = selectedChatId === chat.id && activeSection === (chat.type === 'branch' ? 'channels' : 'chats');

  return (
    <AraButton
      aria-pressed={isOpen}
      className={`workspace-chat-row ${isOpen ? 'is-selected' : ''}`}
      key={chat.id}
      onClick={() => onOpenChat(chat)}
      variant={isOpen ? 'selected' : 'ghost'}
    >
      <ChatListAvatar chat={chat} name={name} username={username} />
      <span className="workspace-chat-copy">
        <span className="workspace-chat-name">{name}</span>
        <span className="workspace-chat-preview">{preview}</span>
      </span>
      <span className="workspace-chat-meta">
        {timestamp ? <time>{timestamp}</time> : null}
        {chat.unread_count ? <span className="workspace-unread" aria-label={t('workspace.unread', { count: chat.unread_count })}>{chat.unread_count}</span> : null}
      </span>
    </AraButton>
  );
}

function ChatGroup({ activeSection, chats, count, headingId, isExpanded, label, onOpenChat, onToggle, selectedChatId, t, unreadCount }) {
  return (
    <section className="workspace-chat-group" aria-labelledby={headingId}>
      <AraButton
        aria-expanded={isExpanded}
        className="workspace-chat-group-toggle"
        id={headingId}
        onClick={onToggle}
        size="compact"
        variant="ghost"
      >
        <Icon name="chevron-right" size={15} />
        <span>{label}</span>
        {unreadCount ? <em>{unreadCount}</em> : <small>{count}</small>}
      </AraButton>
      {isExpanded ? <div>{chats.map((chat) => <WorkspaceChatRow activeSection={activeSection} chat={chat} key={chat.id} onOpenChat={onOpenChat} selectedChatId={selectedChatId} t={t} />)}</div> : null}
    </section>
  );
}

export function WorkspaceChatList({
  activeSection,
  chats,
  chatsError,
  chatsNotice,
  directChatCount,
  isChannelChatsExpanded,
  isClearingChats,
  isDirectChatsExpanded,
  isLoadingChats,
  onClearChats,
  onNewChat,
  onOpenChat,
  onQueryChange,
  onRefresh,
  onRetry,
  onToggleChannelChats,
  onToggleDirectChats,
  preferences,
  query,
  selectedChatId,
  t,
  updatePreferences,
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleChats = chats.filter((chat) => {
    const peer = chat.peer;
    const searchable = `${peer?.display_name ?? ''} ${peer?.username ?? ''} ${chat.title ?? ''} ${chat.description ?? ''} ${chat.last_message?.payload ?? ''}`;
    return searchable.toLocaleLowerCase().includes(normalizedQuery);
  });
  const directChats = visibleChats.filter((chat) => chat.type === 'direct');
  const channelChats = visibleChats.filter((chat) => chat.type === 'branch');
  const channelChatCount = chats.filter((chat) => chat.type === 'branch').length;
  const directUnreadCount = chats.filter((chat) => chat.type === 'direct').reduce((total, chat) => total + (Number(chat.unread_count) || 0), 0);
  const channelUnreadCount = chats.filter((chat) => chat.type === 'branch').reduce((total, chat) => total + (Number(chat.unread_count) || 0), 0);

  return (
    <aside className="workspace-list ara-workspace-chat-list" aria-label={t('workspace.chats')}>
      <div className="workspace-list-header">
        <div>
          <h1>{t('workspace.chatsTitle')}</h1>
          <p>{t('workspace.chatsIntro')}</p>
        </div>
        <div className="workspace-list-actions">
          <ThemeToggle preferences={preferences} updatePreferences={updatePreferences} t={t} compact />
          <AraButton className={`workspace-list-refresh ${isLoadingChats ? 'is-loading' : ''}`} aria-label={isLoadingChats ? t('workspace.refreshingChats') : t('workspace.refreshChats')} disabled={isLoadingChats || isClearingChats} onClick={onRefresh} size="icon" title={t('workspace.refreshChats')} variant="surface"><Icon name="refresh" size={16} /></AraButton>
          <AraButton className="workspace-list-clear" aria-label={t('workspace.clearAllChats')} disabled={!directChatCount || isLoadingChats || isClearingChats} onClick={onClearChats} size="icon" title={t('workspace.clearAllChats')} variant="ghost"><Icon name="trash" size={16} /></AraButton>
          <AraButton className="workspace-new-chat" aria-label={t('workspace.newChat')} onClick={onNewChat} size="icon" variant="primary"><Icon name="plus" /></AraButton>
        </div>
      </div>

      <label className="workspace-search">
        <Icon name="search" size={18} />
        <span className="sr-only">{t('workspace.search')}</span>
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('workspace.searchPlaceholder')} />
        {query ? <AraButton aria-label={t('workspace.clearSearch')} onClick={() => onQueryChange('')} size="icon" variant="ghost"><Icon name="close" size={15} /></AraButton> : null}
      </label>

      {chatsNotice ? <p className="workspace-list-notice" role="status">{chatsNotice}</p> : null}
      <div className="workspace-chat-list" aria-busy={isLoadingChats || isClearingChats}>
        {chatsError ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.chatsLoadError')}</strong><span>{chatsError}</span><AraButton onClick={onRetry} size="compact" variant="primary">{t('workspace.retry')}</AraButton></div> : null}
        {isLoadingChats || isClearingChats ? <p className="workspace-list-status" role="status">{isClearingChats ? t('workspace.clearingChats') : t('workspace.loadingChats')}</p> : chatsError ? null : visibleChats.length ? <>
          <ChatGroup activeSection={activeSection} chats={directChats} count={directChatCount} headingId="direct-chats-heading" isExpanded={isDirectChatsExpanded} label={t('workspace.directChatsSection')} onOpenChat={onOpenChat} onToggle={onToggleDirectChats} selectedChatId={selectedChatId} t={t} unreadCount={directUnreadCount} />
          <ChatGroup activeSection={activeSection} chats={channelChats} count={channelChatCount} headingId="channel-chats-heading" isExpanded={isChannelChatsExpanded} label={t('workspace.channels')} onOpenChat={onOpenChat} onToggle={onToggleChannelChats} selectedChatId={selectedChatId} t={t} unreadCount={channelUnreadCount} />
        </> : (
          <div className="workspace-no-results"><strong>{normalizedQuery ? t('workspace.noSearchResults') : t('workspace.noChatsTitle')}</strong><span>{normalizedQuery ? t('workspace.noSearchResultsText') : t('workspace.noChatsText')}</span>{normalizedQuery ? null : <AraButton className="workspace-list-empty-action" onClick={onNewChat} size="compact" variant="primary">{t('workspace.findUser')}</AraButton>}</div>
        )}
      </div>
      <p className="workspace-list-footer">{t('workspace.chatListFooter')}</p>
    </aside>
  );
}
