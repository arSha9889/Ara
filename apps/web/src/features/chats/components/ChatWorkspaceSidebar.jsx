import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { getChats } from '../api/chatApi.js';

function titleForChat(chat, t) {
  if (chat.type === 'saved') return t('chats.savedTitle');
  if (chat.type === 'branch') return chat.title || t('chats.publicBranches');
  return chat.peer?.display_name || chat.peer?.username || t('chats.directChat');
}

function subtitleForChat(chat, currentUserId, t) {
  if (!chat.last_message) return chat.type === 'saved' ? t('chats.savedSubtitle') : chat.peer?.username ? `@${chat.peer.username}` : t('chats.noMessages');
  const prefix = chat.last_message.sender_id === currentUserId ? t('chats.youPrefix') : '';
  return `${prefix}${chat.last_message.payload || chat.last_message.media_name || chat.last_message.type}`;
}

export function ChatWorkspaceSidebar({ activeChatId }) {
  const { t } = useI18n();
  const { session } = useSession();
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
    const personalChats = chats.filter((chat) => chat.type !== 'branch');
    if (!normalized) return personalChats;
    return personalChats.filter((chat) => [titleForChat(chat, t), chat.peer?.username, subtitleForChat(chat, session.user?.id, t)]
      .filter(Boolean).join(' ').toLowerCase().includes(normalized));
  }, [chats, query, session.user?.id, t]);

  return (
    <aside className="chat-workspace-sidebar" aria-label={t('chats.title')}>
      <div className="workspace-sidebar-heading">
        <div>
          <p className="workspace-kicker">AraChat</p>
          <h2>{t('chats.title')}</h2>
        </div>
        <Link className="workspace-new-chat" to="/app?new=1" aria-label={t('chats.createChat')} title={t('chats.createChat')}>
          <Icon name="plus" size={20} />
        </Link>
      </div>
      <label className="workspace-search">
        <Icon name="search" size={18} />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chats.searchChats')} aria-label={t('chats.searchChats')} />
      </label>
      <div className="workspace-chat-list">
        {visibleChats.map((chat) => {
          const title = titleForChat(chat, t);
          const isSaved = chat.type === 'saved';
          return (
            <Link className={`workspace-chat-row ${chat.id === activeChatId ? 'active' : ''}`} key={chat.id} to={`/app/chats/${chat.id}`}>
              <span className="workspace-avatar-wrap">
                {isSaved ? <span className="workspace-saved-icon"><Icon name="bookmark" size={18} /></span> : <UserAvatar baseClass="workspace-chat-avatar" profile={chat.peer} fallback={title[0] || 'A'} />}
                {!isSaved && chat.peer?.is_online ? <span className="workspace-presence" /> : null}
              </span>
              <span className="workspace-chat-copy">
                <strong>{title}</strong>
                <span>{subtitleForChat(chat, session.user?.id, t)}</span>
              </span>
              {chat.unread_count ? <span className="workspace-unread">{chat.unread_count > 99 ? '99+' : chat.unread_count}</span> : null}
            </Link>
          );
        })}
      </div>
      <Link className="workspace-branches-link" to="/app/branches"><Icon name="branches" size={17} /><span>{t('chats.publicBranches')}</span></Link>
    </aside>
  );
}
