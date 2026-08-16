import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';

import { AppNavigationTrigger } from '../../../app/layout/AppShell.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
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

function activityLabel(activityType, t) {
  if (activityType === 'typing') return t('messages.typing');
  if (activityType === 'file') return t('messages.sendingFile');
  if (activityType === 'voice') return t('messages.sendingVoice');
  return t('messages.peerActive');
}

export function ChatWorkspaceSidebar({ activeChatId }) {
  const { t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const { isMenuOpen, toggleNavigation } = useOutletContext();
  const [chats, setChats] = useState([]);
  const [query, setQuery] = useState('');
  const [activityByChatId, setActivityByChatId] = useState({});
  const chatsRef = useRef([]);
  const loadChatsRef = useRef(null);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const activityTimersRef = useRef(new Map());
  const chatsRequestIdRef = useRef(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activityTimersRef.current.forEach(({ timer }) => window.clearTimeout(timer));
      activityTimersRef.current.clear();
    };
  }, []);

  function clearChatActivity(chatId, expectedType = null) {
    const activityTimer = activityTimersRef.current.get(chatId);
    if (expectedType && activityTimer?.type !== expectedType) return;
    if (activityTimer) window.clearTimeout(activityTimer.timer);
    activityTimersRef.current.delete(chatId);
    setActivityByChatId((current) => {
      if (!current[chatId]) return current;
      const { [chatId]: _, ...remaining } = current;
      return remaining;
    });
  }

  function setChatActivity(chatId, activityType) {
    clearChatActivity(chatId);
    setActivityByChatId((current) => ({ ...current, [chatId]: activityType }));
    const timer = window.setTimeout(() => clearChatActivity(chatId, activityType), activityType === 'active' ? 2400 : 5000);
    activityTimersRef.current.set(chatId, { type: activityType, timer });
  }

  function subscribeChatList(socket, chatItems) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    chatItems.forEach((chat) => {
      socket.send(JSON.stringify({ event: 'chat.subscribe', chat_id: chat.id }));
    });
  }

  async function loadChats() {
    const requestId = chatsRequestIdRef.current + 1;
    chatsRequestIdRef.current = requestId;
    const items = await getChats(session.accessToken);
    if (isMountedRef.current && chatsRequestIdRef.current === requestId) {
      setChats(items);
    }
  }

  chatsRef.current = chats;
  loadChatsRef.current = loadChats;

  useEffect(() => {
    loadChats().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    subscribeChatList(socketRef.current, chats);
  }, [chats]);

  useEffect(() => {
    if (!session.accessToken) return undefined;
    let active = true;
    let socket = null;
    let reconnectAttempts = 0;

    function connect() {
      socket = createRealtimeConnection(session.accessToken);
      socketRef.current = socket;
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'connection.authenticated') {
            subscribeChatList(socket, chatsRef.current);
            loadChatsRef.current?.().catch(() => undefined);
          }
          if (['message.created', 'message.updated', 'message.deleted', 'message.read'].includes(payload.event)) {
            clearChatActivity(payload.chat_id);
            loadChatsRef.current?.().catch(() => undefined);
          }
          if (payload.user_id !== session.user?.id && payload.chat_id) {
            if (payload.event === 'typing.started') setChatActivity(payload.chat_id, 'typing');
            if (payload.event === 'file.uploading') setChatActivity(payload.chat_id, 'file');
            if (payload.event === 'voice.uploading') setChatActivity(payload.chat_id, 'voice');
            if (payload.event === 'presence.active') setChatActivity(payload.chat_id, 'active');
            if (payload.event === 'typing.stopped') clearChatActivity(payload.chat_id, 'typing');
          }
          if (payload.event === 'presence.status') {
            setChats((current) => current.map((chat) => chat.peer?.id === payload.user_id
              ? {
                ...chat,
                peer: {
                  ...chat.peer,
                  is_online: Boolean(payload.is_online),
                  last_seen_at: payload.last_seen_at ?? chat.peer.last_seen_at,
                },
              }
              : chat));
          }
        } catch {
          // Ignore malformed realtime payloads; the next event will resync the list.
        }
      });
      socket.addEventListener('open', () => { reconnectAttempts = 0; });
      socket.addEventListener('close', () => {
        if (!active) return;
        reconnectAttempts += 1;
        reconnectTimerRef.current = window.setTimeout(connect, Math.min(1000 * reconnectAttempts, 5000));
      });
    }

    connect();
    return () => {
      active = false;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [session.accessToken]);

  const visibleChats = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return chats;
    return chats.filter((chat) => [titleForChat(chat, t), chat.description, chat.peer?.username, subtitleForChat(chat, session.user?.id, t)]
      .filter(Boolean).join(' ').toLowerCase().includes(normalized));
  }, [chats, query, session.user?.id, t]);

  const savedChat = chats.find((chat) => chat.type === 'saved');
  const listedChats = visibleChats.filter((chat) => chat.type !== 'saved');

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
      <div className="chat-list-saved-slot">
        <button className={`info-card saved-chat-card ${savedChat?.id === activeChatId ? 'active' : ''}`} type="button" onClick={handleOpenSavedChat}>
          <div className="chat-list-avatar saved-avatar" aria-hidden="true">★</div>
          <div>
            <strong>{t('chats.savedTitle')}</strong>
            <span className="muted">{savedChat ? subtitleForChat(savedChat, session.user?.id, t) : t('chats.savedSubtitle')}</span>
          </div>
          <span className="chat-list-badge">{t('chats.savedBadge')}</span>
        </button>
      </div>
      <div className="list-stack">
        {listedChats.map((chat) => {
          const title = titleForChat(chat, t);
          const activityType = chat.id === activeChatId ? null : activityByChatId[chat.id];
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
                <span className={activityType ? `chat-thread-activity ${activityType}` : 'muted'}>{activityType ? activityLabel(activityType, t) : subtitleForChat(chat, session.user?.id, t)}</span>
              </span>
              {chat.unread_count ? <span className="chat-unread-badge">{chat.unread_count > 99 ? '99+' : chat.unread_count}</span> : null}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
