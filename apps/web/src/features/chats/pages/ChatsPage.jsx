import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';

import { AppNavigationTrigger } from '../../../app/layout/AppShell.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { createSavedChat, getChats } from '../api/chatApi.js';

function chatTitle(chat, t) {
  if (chat.type === 'saved') return t('chats.savedTitle');
  if (chat.type === 'branch') return chat.title || 'Ветвь';
  return chat.peer?.display_name || chat.peer?.username || t('chats.directChat');
}

function chatSubtitle(chat, currentUserId, t) {
  if (chat.type === 'branch' && !chat.last_message) return chat.description || 'Публичная ветвь';
  if (!chat.last_message) {
    if (chat.type === 'saved') return t('chats.savedSubtitle');
    return chat.peer?.username ? `@${chat.peer.username}` : t('chats.noMessages');
  }
  const prefix = chat.last_message.sender_id === currentUserId ? t('chats.youPrefix') : '';
  if (chat.last_message.type === 'text' || chat.last_message.type === 'emoji') {
    return `${prefix}${chat.last_message.payload}`;
  }
  if (chat.last_message.type === 'video_note') {
    return `${prefix}${t('messages.videoNote')}`;
  }
  return `${prefix}${chat.last_message.media_name || chat.last_message.type}`;
}

export function ChatsPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const { isMenuOpen, toggleNavigation } = useOutletContext();
  const [chats, setChats] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);
  const chatsRef = useRef([]);
  const loadChatsRef = useRef(null);
  const chatsRequestIdRef = useRef(0);
  const lastResyncAtRef = useRef(0);
  const { enableNotifications, isEnabled, isSupported, permission, pushConfigured } = useNotifications();
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationPromptStatus, setNotificationPromptStatus] = useState('');
  const savedChat = chats.find((chat) => chat.type === 'saved');
  const listedChats = chats.filter((chat) => chat.type !== 'saved');
  const normalizedChatSearch = chatSearch.trim().toLowerCase();
  const visibleChats = normalizedChatSearch
    ? listedChats.filter((chat) => [
      chatTitle(chat, t),
      chat.description || '',
      chat.peer?.username ? `@${chat.peer.username}` : '',
      chat.peer?.username || '',
      chat.peer?.nexus_id || '',
      chatSubtitle(chat, session.user?.id, t),
    ].join(' ').toLowerCase().includes(normalizedChatSearch))
    : listedChats;
  const isSavedChatVisible = !normalizedChatSearch || [
    t('chats.savedTitle'),
    savedChat ? chatSubtitle(savedChat, session.user?.id, t) : t('chats.savedSubtitle'),
    t('chats.savedBadge'),
  ].join(' ').toLowerCase().includes(normalizedChatSearch);
  const hasVisibleChats = isSavedChatVisible || visibleChats.length > 0;

  useEffect(() => {
    chatsRef.current = chats;
    subscribeChatList(socketRef.current, chats);
  }, [chats]);

  function subscribeChatList(socket, chatItems) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    chatItems.forEach((chat) => {
      socket.send(JSON.stringify({ event: 'chat.subscribe', chat_id: chat.id }));
    });
  }

  async function loadChats({ showLoading = true } = {}) {
    const requestId = chatsRequestIdRef.current + 1;
    chatsRequestIdRef.current = requestId;
    try {
      if (showLoading) setIsLoading(true);
      const nextChats = await getChats(session.accessToken);
      if (chatsRequestIdRef.current === requestId) setChats(nextChats);
    } finally {
      if (showLoading && chatsRequestIdRef.current === requestId) setIsLoading(false);
    }
  }

  loadChatsRef.current = loadChats;

  useEffect(() => {
    loadChats().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    if (!session.accessToken) return undefined;

    function resyncChats() {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastResyncAtRef.current < 500) return;
      lastResyncAtRef.current = now;
      loadChatsRef.current?.({ showLoading: false }).catch((err) => setError(err.message));
    }

    document.addEventListener('visibilitychange', resyncChats);
    window.addEventListener('focus', resyncChats);
    window.addEventListener('pageshow', resyncChats);
    return () => {
      document.removeEventListener('visibilitychange', resyncChats);
      window.removeEventListener('focus', resyncChats);
      window.removeEventListener('pageshow', resyncChats);
    };
  }, [session.accessToken]);

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
            loadChatsRef.current?.({ showLoading: false }).catch((err) => setError(err.message));
          }
          if (payload.event === 'message.created') {
            loadChats({ showLoading: false }).catch((err) => setError(err.message));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    const dismissed = localStorage.getItem('nexus_notifications_prompt_dismissed') === 'true';
    setShowNotificationPrompt(isSupported && pushConfigured && permission === 'default' && !dismissed && !isEnabled);
  }, [isEnabled, isSupported, permission, pushConfigured]);

  async function handleOpenSavedChat() {
    setError('');
    try {
      const chat = savedChat || await createSavedChat(session.accessToken);
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      navigate(`/app/chats/${chat.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEnableNotifications() {
    const result = await enableNotifications();
    if (result.status === 'granted') {
      localStorage.setItem('nexus_notifications_prompt_dismissed', 'true');
      setShowNotificationPrompt(false);
      setNotificationPromptStatus('');
      return;
    }
    setNotificationPromptStatus(result.status === 'denied'
      ? t('profile.notificationsDenied')
      : result.status === 'unconfigured'
        ? t('profile.notificationsUnavailable')
        : result.status === 'subscription_failed'
          ? t('profile.notificationsSubscriptionFailed')
          : result.status === 'delivery_failed'
            ? t('profile.notificationsDeliveryFailed')
            : result.status === 'ios_install_required'
              ? t('profile.notificationsInstallRequired')
              : result.status === 'insecure_context'
                ? t('profile.notificationsHttpsRequired')
                : t('profile.notificationsNotEnabled'));
  }

  function handleDismissNotifications() {
    localStorage.setItem('nexus_notifications_prompt_dismissed', 'true');
    setShowNotificationPrompt(false);
    setNotificationPromptStatus('');
  }

  return (
    <section className="content-grid">
      <div className="panel chat-list-panel">
        <header className="section-header">
          <div className="chat-list-heading">
            <h1>{t('chats.title')}</h1>
            <AppNavigationTrigger className="chat-list-navigation-trigger" isMenuOpen={isMenuOpen} onToggle={toggleNavigation} />
          </div>
        </header>
        {showNotificationPrompt ? (
          <div className="notification-prompt">
            <div className="notification-icon" aria-hidden="true">🔔</div>
            <div>
              <strong>{t('chats.notificationsTitle')}</strong>
              <p className="muted">{t('chats.notificationsText')}</p>
            </div>
            <div className="notification-actions">
              <button className="button button-primary" type="button" onClick={handleEnableNotifications}>{t('chats.enableNotifications')}</button>
              <button className="button button-secondary" type="button" onClick={handleDismissNotifications}>{t('common.notNow')}</button>
            </div>
            {notificationPromptStatus ? <p className="error-text">{notificationPromptStatus}</p> : null}
          </div>
        ) : null}
        <div className="chat-list-tools">
          <label className="chat-search-field">
            <span className="chat-search-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
            <input
              type="search"
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder={t('chats.searchChats')}
              aria-label={t('chats.searchChats')}
            />
            {chatSearch ? (
              <button className="chat-search-clear" type="button" onClick={() => setChatSearch('')} aria-label={t('chats.clearSearch')}>
                ×
              </button>
            ) : null}
          </label>
          <button
            className="chat-create-trigger"
            type="button"
            aria-label={t('chats.createChat')}
            onClick={() => navigate('/app/new-chat')}
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        {isLoading ? <AraChatLoader compact title={t('chats.loadingTitle')} text={t('chats.loadingText')} /> : null}
        <div className="list-stack">
          {isSavedChatVisible ? (
            <button className="info-card saved-chat-card" type="button" onClick={handleOpenSavedChat}>
              <div className="chat-list-avatar saved-avatar" aria-hidden="true">★</div>
              <div>
                <strong>{t('chats.savedTitle')}</strong>
                <span className="muted">{savedChat ? chatSubtitle(savedChat, session.user?.id, t) : t('chats.savedSubtitle')}</span>
              </div>
              <span className="chat-list-badge">{t('chats.savedBadge')}</span>
            </button>
          ) : null}
          {visibleChats.map((chat) => (
            <Link className="info-card chat-thread-card" key={chat.id} to={`/app/chats/${chat.id}`}>
              <span className="chat-list-avatar-wrap">
                {chat.type === 'branch'
                  ? <span className="chat-list-avatar branch-avatar" aria-hidden="true">{chat.avatar_ref || '◎'}</span>
                  : <UserAvatar baseClass="chat-list-avatar" profile={chat.peer} fallback={chatTitle(chat, t)[0] || 'N'} />}
                {chat.peer?.is_online ? <span className="presence-dot online" aria-hidden="true" /> : null}
              </span>
              <div className="chat-thread-copy">
                <strong>{chatTitle(chat, t)} {(chat.type === 'branch' && chat.is_official) || chat.peer?.is_official ? <span className="official-badge" title="Официальный аккаунт">✓</span> : null}</strong>
                <span className="muted">{chatSubtitle(chat, session.user?.id, t)}</span>
              </div>
              {chat.unread_count ? (
                <span className="chat-unread-badge" aria-label={`${chat.unread_count} unread`}>
                  {chat.unread_count > 99 ? '99+' : chat.unread_count}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
        {!isLoading && !normalizedChatSearch && listedChats.length === 0 ? (
          <EmptyState
            title={t('chats.emptyTitle')}
            text={t('chats.emptyText')}
            action={<button className="empty-state-action" type="button" onClick={() => navigate('/app/new-chat')}><Icon name="plus" size={18} />{t('chats.createChat')}</button>}
          />
        ) : null}
        {!isLoading && normalizedChatSearch && !hasVisibleChats ? <EmptyState title={t('chats.searchEmptyTitle')} text={t('chats.searchEmptyText')} /> : null}
      </div>
        <div className="panel desktop-only workspace-welcome-panel">
          <div className="workspace-welcome-art" aria-hidden="true"><Icon name="sparkles" size={42} /></div>
          <p className="workspace-kicker">AraChat</p>
          <EmptyState title={t('chats.selectedEmpty')} text={t('chats.selectedEmptyText')} action={<button className="empty-state-action" type="button" onClick={() => navigate('/app/new-chat')}><Icon name="plus" size={18} />{t('chats.createChat')}</button>} />
        </div>
    </section>
  );
}
