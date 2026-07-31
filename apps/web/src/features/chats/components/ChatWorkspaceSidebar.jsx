import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';

import { AppNavigationTrigger } from '../../../app/layout/AppShell.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { createSavedChat, getChats } from '../api/chatApi.js';

function titleForChat(chat, t) {
  if (chat.type === 'saved') return t('chats.savedTitle');
  if (chat.type === 'branch') return chat.title || t('chats.publicBranches');
  return chat.peer?.display_name || chat.peer?.username || t('chats.directChat');
}

function subtitleForChat(chat, currentUserId, t) {
  if (!chat.last_message) {
    if (chat.type === 'saved') return t('chats.savedSubtitle');
    if (chat.type === 'branch') return chat.description || t('chats.publicBranches');
    return chat.peer?.username ? `@${chat.peer.username}` : t('chats.noMessages');
  }
  const prefix = chat.last_message.sender_id === currentUserId ? t('chats.youPrefix') : '';
  return `${prefix}${chat.last_message.payload || chat.last_message.media_name || chat.last_message.type}`;
}

export function ChatWorkspaceSidebar({ activeChatId }) {
  const { t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const { isMenuOpen, toggleNavigation } = useOutletContext();
  const [chats, setChats] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    getChats(session.accessToken).then((items) => {
      if (active) setChats(items);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session.accessToken]);

  const visibleChats = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return chats;
    return chats.filter((chat) => [titleForChat(chat, t), chat.description, chat.peer?.username, subtitleForChat(chat, session.user?.id, t)]
      .filter(Boolean).join(' ').toLowerCase().includes(normalized));
  }, [chats, query, session.user?.id, t]);

  const savedChat = chats.find((chat) => chat.type === 'saved');
  const listedChats = visibleChats.filter((chat) => chat.type !== 'saved');
  const normalizedQuery = query.trim().toLowerCase();
  const isSavedChatVisible = !normalizedQuery || [
    t('chats.savedTitle'),
    savedChat ? subtitleForChat(savedChat, session.user?.id, t) : t('chats.savedSubtitle'),
    t('chats.savedBadge'),
  ].join(' ').toLowerCase().includes(normalizedQuery);

  async function handleOpenSavedChat() {
    try {
      const chat = savedChat || await createSavedChat(session.accessToken);
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      navigate(`/app/chats/${chat.id}`);
    } catch {
      // The current chat remains available if the saved-messages request fails.
    }
  }

  return (
    <aside className="panel chat-list-panel chat-workspace-sidebar" aria-label={t('chats.title')}>
      <header className="section-header">
        <div className="chat-list-heading">
          <h1>{t('chats.title')}</h1>
          <AppNavigationTrigger className="chat-list-navigation-trigger" isMenuOpen={isMenuOpen} onToggle={toggleNavigation} />
        </div>
      </header>
      <div className="chat-list-tools">
        <label className="chat-search-field">
          <span className="chat-search-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chats.searchChats')} aria-label={t('chats.searchChats')} />
          {query ? <button className="chat-search-clear" type="button" onClick={() => setQuery('')} aria-label={t('chats.clearSearch')}>×</button> : null}
        </label>
        <Link className="chat-create-trigger" to="/app/new-chat" aria-label={t('chats.createChat')} title={t('chats.createChat')}>
          <Icon name="plus" size={22} />
        </Link>
      </div>
      <div className="list-stack">
        {isSavedChatVisible ? (
          <button className={`info-card saved-chat-card ${savedChat?.id === activeChatId ? 'active' : ''}`} type="button" onClick={handleOpenSavedChat}>
            <div className="chat-list-avatar saved-avatar" aria-hidden="true">★</div>
            <div>
              <strong>{t('chats.savedTitle')}</strong>
              <span className="muted">{savedChat ? subtitleForChat(savedChat, session.user?.id, t) : t('chats.savedSubtitle')}</span>
            </div>
            <span className="chat-list-badge">{t('chats.savedBadge')}</span>
          </button>
        ) : null}
        {listedChats.map((chat) => {
          const title = titleForChat(chat, t);
          return (
            <Link className={`info-card chat-thread-card ${chat.id === activeChatId ? 'active' : ''}`} key={chat.id} to={`/app/chats/${chat.id}`}>
              <span className="chat-list-avatar-wrap">
                {chat.type === 'branch'
                  ? <span className="chat-list-avatar branch-avatar" aria-hidden="true">{chat.avatar_ref || '◎'}</span>
                  : <UserAvatar baseClass="chat-list-avatar" profile={chat.peer} fallback={title[0] || 'A'} />}
                {chat.peer?.is_online ? <span className="presence-dot online" aria-hidden="true" /> : null}
              </span>
              <span className="chat-thread-copy">
                <strong>{title} {(chat.type === 'branch' && chat.is_official) || chat.peer?.is_official ? <span className="official-badge">✓</span> : null}</strong>
                <span className="muted">{subtitleForChat(chat, session.user?.id, t)}</span>
              </span>
              {chat.unread_count ? <span className="chat-unread-badge">{chat.unread_count > 99 ? '99+' : chat.unread_count}</span> : null}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
