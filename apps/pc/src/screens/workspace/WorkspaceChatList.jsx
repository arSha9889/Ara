import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { ThemeToggle } from '../../components/ThemeLanguageControls.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspaceNotice } from '../../components/WorkspaceState.jsx';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

const AVATAR_TONES = ['violet', 'coral', 'yellow', 'blue'];
const MENU_VIEWPORT_GUTTER = 12;

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
  if (lastMessage.type === 'system') return t('workspace.groups.system.preview');
  if (lastMessage.type === 'text' || lastMessage.type === 'emoji') return lastMessage.payload;
  if (lastMessage.type === 'photo' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('image/'))) return t('workspace.chatPanel.typePhoto');
  if (lastMessage.type === 'video_note') return t('workspace.chatPanel.typeVideoNote');
  if (lastMessage.type === 'video' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('video/'))) return t('workspace.chatPanel.typeVideo');
  if (lastMessage.type === 'voice' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('audio/'))) return t('workspace.chatPanel.typeAudio');
  if (lastMessage.type === 'call') return t('workspace.calls');
  return t('workspace.chatPanel.typeFile');
}

function ChatListAvatar({ chat, name, username }) {
  const avatarRef = ['branch', 'group'].includes(chat.type) ? chat.avatar_ref : chat.peer?.avatar_ref;
  const avatarUrl = mediaUrlForDesktop(avatarRef);
  if (avatarUrl) return <span className="workspace-avatar"><img src={avatarUrl} alt="" /></span>;
  return <span className={`workspace-avatar is-${avatarTone(chat.peer?.id || chat.id)}`} aria-hidden="true">{initials(name, username)}</span>;
}

function chatMenuPositionFromEvent(event) {
  if (event.type === 'contextmenu') return { x: event.clientX, y: event.clientY };

  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: bounds.left + Math.min(bounds.width / 2, 180),
    y: bounds.top + Math.min(bounds.height / 2, 32),
  };
}

function focusChatMenuItem(menu, offset) {
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  const currentIndex = items.indexOf(document.activeElement);
  const nextIndex = (currentIndex + offset + items.length) % items.length;
  items[nextIndex]?.focus();
}

function WorkspaceChatContextMenu({ contextMenu, onClose, onOpenChat, onOpenDetails, t }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);
  const chat = contextMenu?.chat;
  const canOpenDetails = ['branch', 'group'].includes(chat?.type);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) {
      setPosition(null);
      return;
    }

    const { width, height } = menuRef.current.getBoundingClientRect();
    setPosition({
      x: Math.max(MENU_VIEWPORT_GUTTER, Math.min(contextMenu.x, window.innerWidth - width - MENU_VIEWPORT_GUTTER)),
      y: Math.max(MENU_VIEWPORT_GUTTER, Math.min(contextMenu.y, window.innerHeight - height - MENU_VIEWPORT_GUTTER)),
    });
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return undefined;

    menuRef.current.querySelector('[role="menuitem"]')?.focus();

    function closeOnOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target)) onClose();
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [contextMenu, onClose]);

  if (!contextMenu || !chat) return null;

  function closeAndRun(action) {
    onClose();
    action();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      contextMenu.trigger?.focus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusChatMenuItem(event.currentTarget, 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusChatMenuItem(event.currentTarget, -1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      event.currentTarget.querySelector('[role="menuitem"]')?.focus();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const items = event.currentTarget.querySelectorAll('[role="menuitem"]');
      items[items.length - 1]?.focus();
      return;
    }

    if (event.key === 'Tab') onClose();
  }

  return (
    <div
      aria-label={t('workspace.chatContextMenu.label', { title: contextMenu.title })}
      className="workspace-chat-context-menu"
      onKeyDown={handleKeyDown}
      ref={menuRef}
      role="menu"
      style={{ left: position?.x ?? contextMenu.x, top: position?.y ?? contextMenu.y }}
    >
      <AraButton onClick={() => closeAndRun(() => onOpenChat(chat))} role="menuitem" size="compact" tabIndex={-1} type="button" variant="ghost"><Icon name="chats" size={16} />{t('workspace.chatContextMenu.openChat')}</AraButton>
      {canOpenDetails ? <AraButton onClick={() => closeAndRun(() => onOpenDetails(chat))} role="menuitem" size="compact" tabIndex={-1} type="button" variant="ghost"><Icon name="settings" size={16} />{t('workspace.chatInspector.openDetails')}</AraButton> : null}
    </div>
  );
}

function WorkspaceChatRow({ activeSection, chat, isContextMenuOpen, onOpenChat, onOpenContextMenu, selectedChatId, t }) {
  const peer = chat.peer;
  const name = chat.type === 'branch'
    ? chat.title || t('workspace.channels.untitled')
    : chat.type === 'group'
      ? chat.title || t('workspace.groups.untitled')
    : peer?.display_name || peer?.username || t('workspace.unknownUser');
  const username = chat.type === 'branch' ? chat.slug || '' : chat.type === 'group' ? t('workspace.groups.membersCount', { count: chat.participant_ids?.length || 0 }) : peer?.username || '';
  const preview = chatPreview(chat.last_message, t);
  const timestamp = formatChatTime(chat.last_message?.created_at || chat.updated_at);
  const isOpen = selectedChatId === chat.id && activeSection === (chat.type === 'branch' ? 'channels' : chat.type === 'group' ? 'groups' : 'chats');

  function openContextMenu(event) {
    event.preventDefault();
    onOpenContextMenu({
      chat,
      title: name,
      trigger: event.currentTarget,
      ...chatMenuPositionFromEvent(event),
    });
  }

  function handleKeyDown(event) {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    openContextMenu(event);
  }

  return (
    <AraButton
      aria-expanded={isContextMenuOpen}
      aria-haspopup="menu"
      aria-pressed={isOpen}
      className={`workspace-chat-row ${isOpen ? 'is-selected' : ''}`}
      key={chat.id}
      onClick={() => onOpenChat(chat)}
      onContextMenu={openContextMenu}
      onKeyDown={handleKeyDown}
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

function CreateChatMenu({ onNewChat, onNewGroup, t }) {
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  function closeMenuAfterFocusChange() {
    window.setTimeout(() => {
      if (!menuRef.current?.contains(document.activeElement)) setIsOpen(false);
    }, 0);
  }

  function choose(action) {
    setIsOpen(false);
    action?.();
  }

  return (
    <div className="workspace-create-menu" onBlur={closeMenuAfterFocusChange} onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      menuRef.current?.querySelector('button')?.focus();
    }} ref={menuRef}>
      <AraButton
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('workspace.createChatMenu')}
        className="workspace-new-chat"
        onClick={() => setIsOpen((current) => !current)}
        size="icon"
        title={t('workspace.createChatMenu')}
        variant="primary"
      >
        <Icon name="plus" size={17} />
      </AraButton>
      {isOpen ? <div aria-label={t('workspace.createChatMenu')} className="workspace-create-menu-popover" role="menu">
        <AraButton onClick={() => choose(onNewChat)} role="menuitem" size="compact" variant="ghost"><Icon name="chats" size={16} />{t('workspace.newChat')}</AraButton>
        <AraButton onClick={() => choose(onNewGroup)} role="menuitem" size="compact" variant="ghost"><Icon name="groups" size={16} />{t('workspace.groups.create')}</AraButton>
      </div> : null}
    </div>
  );
}

const CHAT_CATEGORIES = [
  { id: 'direct', labelPath: 'workspace.directChatsSection' },
  { id: 'groups', labelPath: 'workspace.groups.title' },
  { id: 'channels', labelPath: 'workspace.channels.title' },
];

function ChatCategoryTabs({ activeCategory, channelCount, channelUnreadCount, directCount, directUnreadCount, groupCount, groupUnreadCount, onSelect, t }) {
  const tabRefs = useRef([]);

  function selectCategory(index) {
    const category = CHAT_CATEGORIES[index];
    if (!category) return;
    onSelect(category.id);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event, index) {
    const lastIndex = CHAT_CATEGORIES.length - 1;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === null) return;

    event.preventDefault();
    selectCategory(nextIndex);
  }

  return (
    <div aria-label={t('workspace.chatsTitle')} className="workspace-chat-category-tabs" role="tablist">
      {CHAT_CATEGORIES.map((category, index) => {
        const isActive = activeCategory === category.id;
        const unreadCount = category.id === 'direct' ? directUnreadCount : category.id === 'groups' ? groupUnreadCount : channelUnreadCount;
        const count = category.id === 'direct' ? directCount : category.id === 'groups' ? groupCount : channelCount;
        return (
          <AraButton
            aria-controls={`workspace-chat-category-panel-${category.id}`}
            aria-label={unreadCount ? `${t(category.labelPath)}. ${t('workspace.unread', { count: unreadCount })}` : `${t(category.labelPath)}: ${count}`}
            aria-selected={isActive}
            className={`workspace-chat-category-tab ${isActive ? 'is-active' : ''}`}
            id={`workspace-chat-category-tab-${category.id}`}
            key={category.id}
            onClick={() => onSelect(category.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            size="compact"
            tabIndex={isActive ? 0 : -1}
            variant="ghost"
          >
            <span>{t(category.labelPath)}</span>
            <em aria-hidden="true">{unreadCount || count}</em>
          </AraButton>
        );
      })}
    </div>
  );
}

export function WorkspaceChatList({
  activeSection,
  chats,
  chatsError,
  chatsNotice,
  directChatCount,
  isClearingChats,
  isLoadingChats,
  onClearChats,
  onCategoryChange,
  onNewGroup,
  onNewChat,
  onOpenChat,
  onOpenChatDetails,
  onQueryChange,
  onRefresh,
  onRetry,
  preferences,
  query,
  selectedChatId,
  t,
  updatePreferences,
}) {
  const [activeCategory, setActiveCategory] = useState('direct');
  const [chatContextMenu, setChatContextMenu] = useState(null);

  useEffect(() => {
    if (activeSection === 'channels') setActiveCategory('channels');
    if (['groups', 'group-create'].includes(activeSection)) setActiveCategory('groups');
    if (activeSection === 'chats') setActiveCategory('direct');
  }, [activeSection]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleChats = chats.filter((chat) => {
    const peer = chat.peer;
    const searchable = `${peer?.display_name ?? ''} ${peer?.username ?? ''} ${chat.title ?? ''} ${chat.description ?? ''} ${chat.last_message?.payload ?? ''}`;
    return searchable.toLocaleLowerCase().includes(normalizedQuery);
  });
  const directChats = visibleChats.filter((chat) => chat.type === 'direct');
  const groupChats = visibleChats.filter((chat) => chat.type === 'group');
  const channelChats = visibleChats.filter((chat) => chat.type === 'branch');
  const channelChatCount = chats.filter((chat) => chat.type === 'branch').length;
  const groupChatCount = chats.filter((chat) => chat.type === 'group').length;
  const directUnreadCount = chats.filter((chat) => chat.type === 'direct').reduce((total, chat) => total + (Number(chat.unread_count) || 0), 0);
  const groupUnreadCount = chats.filter((chat) => chat.type === 'group').reduce((total, chat) => total + (Number(chat.unread_count) || 0), 0);
  const channelUnreadCount = chats.filter((chat) => chat.type === 'branch').reduce((total, chat) => total + (Number(chat.unread_count) || 0), 0);
  const activeChats = activeCategory === 'channels' ? channelChats : activeCategory === 'groups' ? groupChats : directChats;
  const isChannelCategory = activeCategory === 'channels';
  const isGroupCategory = activeCategory === 'groups';
  const emptyTitle = normalizedQuery
    ? t('workspace.noSearchResults')
    : t(isChannelCategory ? 'workspace.noChannelChatsTitle' : isGroupCategory ? 'workspace.noGroupChatsTitle' : 'workspace.noChatsTitle');
  const emptyText = normalizedQuery
    ? t('workspace.noSearchResultsText')
    : t(isChannelCategory ? 'workspace.noChannelChatsText' : isGroupCategory ? 'workspace.noGroupChatsText' : 'workspace.noChatsText');

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
          <CreateChatMenu onNewGroup={onNewGroup} onNewChat={onNewChat} t={t} />
        </div>
      </div>

      <label className="workspace-search">
        <Icon name="search" size={18} />
        <span className="sr-only">{t('workspace.search')}</span>
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('workspace.searchPlaceholder')} />
        {query ? <AraButton aria-label={t('workspace.clearSearch')} onClick={() => onQueryChange('')} size="icon" variant="ghost"><Icon name="close" size={15} /></AraButton> : null}
      </label>

      <ChatCategoryTabs activeCategory={activeCategory} channelCount={channelChatCount} channelUnreadCount={channelUnreadCount} directCount={directChatCount} directUnreadCount={directUnreadCount} groupCount={groupChatCount} groupUnreadCount={groupUnreadCount} onSelect={(category) => { setActiveCategory(category); onCategoryChange?.(category); }} t={t} />

      {chatsNotice ? <WorkspaceNotice className="workspace-list-notice">{chatsNotice}</WorkspaceNotice> : null}
      <div aria-busy={isLoadingChats || isClearingChats} aria-labelledby={`workspace-chat-category-tab-${activeCategory}`} className="workspace-chat-list" id={`workspace-chat-category-panel-${activeCategory}`} role="tabpanel">
        {chatsError ? <WorkspaceError actionLabel={t('workspace.retry')} onAction={onRetry} title={t('workspace.chatsLoadError')}>{chatsError}</WorkspaceError> : null}
        {isLoadingChats || isClearingChats ? <WorkspaceLoading className="workspace-list-status">{isClearingChats ? t('workspace.clearingChats') : t('workspace.loadingChats')}</WorkspaceLoading> : chatsError ? null : activeChats.length ? activeChats.map((chat) => <WorkspaceChatRow activeSection={activeSection} chat={chat} isContextMenuOpen={String(chatContextMenu?.chat.id) === String(chat.id)} key={chat.id} onOpenChat={onOpenChat} onOpenContextMenu={setChatContextMenu} selectedChatId={selectedChatId} t={t} />) : (
          <WorkspaceEmpty action={normalizedQuery || isChannelCategory || isGroupCategory ? null : <AraButton className="workspace-list-empty-action" onClick={onNewChat} size="compact" variant="primary">{t('workspace.findUser')}</AraButton>} className="workspace-no-results" title={emptyTitle}>{emptyText}</WorkspaceEmpty>
        )}
      </div>
      <WorkspaceChatContextMenu contextMenu={chatContextMenu} onClose={() => setChatContextMenu(null)} onOpenChat={onOpenChat} onOpenDetails={onOpenChatDetails} t={t} />
      <p className="workspace-list-footer">{t('workspace.chatListFooter')}</p>
    </aside>
  );
}
