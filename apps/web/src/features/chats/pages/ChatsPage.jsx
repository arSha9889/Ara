import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { NexusLoader } from '../../../shared/ui/NexusLoader.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { createDirectChat, createSavedChat, getChats } from '../api/chatApi.js';
import { welcomeChat } from '../config/welcomeChat.js';

function chatTitle(chat, t) {
  if (chat.type === 'saved') return t('chats.savedTitle');
  return chat.peer?.display_name || chat.peer?.username || t('chats.directChat');
}

function chatSubtitle(chat, currentUserId, t) {
  if (!chat.last_message) {
    if (chat.type === 'saved') return t('chats.savedSubtitle');
    return chat.peer?.username ? `@${chat.peer.username}` : t('chats.noMessages');
  }
  const prefix = chat.last_message.sender_id === currentUserId ? t('chats.youPrefix') : '';
  if (chat.last_message.type === 'text' || chat.last_message.type === 'emoji') {
    return `${prefix}${chat.last_message.payload}`;
  }
  return `${prefix}${chat.last_message.media_name || chat.last_message.type}`;
}

export function ChatsPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);
  const chatsRef = useRef([]);
  const { enableNotifications, isEnabled, isSupported, permission, pushConfigured } = useNotifications();
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationPromptStatus, setNotificationPromptStatus] = useState('');
  const savedChat = chats.find((chat) => chat.type === 'saved');
  const regularChats = chats.filter((chat) => chat.type !== 'saved');

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
    try {
      if (showLoading) setIsLoading(true);
      setChats(await getChats(session.accessToken));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }

  useEffect(() => {
    loadChats().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          }
          if (payload.event === 'message.created') {
            loadChats({ showLoading: false }).catch((err) => setError(err.message));
          }
          if (payload.event === 'presence.status') {
            setChats((current) => current.map((chat) => chat.peer?.id === payload.user_id
              ? { ...chat, peer: { ...chat.peer, is_online: Boolean(payload.is_online) } }
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

  async function handleCreateChat(event) {
    event.preventDefault();
    setError('');
    try {
      const chat = await createDirectChat(session.accessToken, identifier);
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setIdentifier('');
      setIsCreateChatOpen(false);
      navigate(`/app/chats/${chat.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

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
          <h1>{t('chats.title')}</h1>
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
        <div className={`chat-create-menu ${isCreateChatOpen ? 'is-open' : ''}`}>
          <button
            className="button button-primary chat-create-trigger"
            type="button"
            aria-expanded={isCreateChatOpen}
            onClick={() => setIsCreateChatOpen((current) => !current)}
          >
            <span aria-hidden="true">＋</span>
            <span>{t('chats.createChat')}</span>
            <span className="app-menu-chevron" aria-hidden="true">⌄</span>
          </button>
          <form className="chat-create-panel" onSubmit={handleCreateChat}>
            <TextInput label={t('chats.search')} value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            <Button type="submit">{t('chats.createChat')}</Button>
          </form>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        {isLoading ? <NexusLoader compact title={t('chats.loadingTitle')} text={t('chats.loadingText')} /> : null}
        <div className="list-stack">
          <button className="info-card saved-chat-card" type="button" onClick={handleOpenSavedChat}>
            <div className="chat-list-avatar saved-avatar" aria-hidden="true">★</div>
            <div>
              <strong>{t('chats.savedTitle')}</strong>
              <span className="muted">{savedChat ? chatSubtitle(savedChat, session.user?.id, t) : t('chats.savedSubtitle')}</span>
            </div>
            <span className="chat-list-badge">{t('chats.savedBadge')}</span>
          </button>
          <Link className="info-card welcome-chat-card" to="/app/welcome">
            <div className="chat-list-avatar" aria-hidden="true">{welcomeChat.avatar}</div>
            <div>
              <strong>{welcomeChat.title}</strong>
              <span className="muted">{t(welcomeChat.subtitleKey)}</span>
            </div>
            <span className="chat-list-badge">{t('chats.newBadge')}</span>
          </Link>
          {regularChats.map((chat) => (
            <Link className="info-card chat-thread-card" key={chat.id} to={`/app/chats/${chat.id}`}>
              <span className="chat-list-avatar-wrap">
                <UserAvatar baseClass="chat-list-avatar" profile={chat.peer} fallback={chatTitle(chat, t)[0] || 'N'} />
                {chat.peer?.is_online ? <span className="presence-dot online" aria-hidden="true" /> : null}
              </span>
              <div className="chat-thread-copy">
                <strong>{chatTitle(chat, t)}</strong>
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
        {!isLoading && regularChats.length === 0 ? <EmptyState title={t('chats.emptyTitle')} text={t('chats.emptyText')} /> : null}
      </div>
      <div className="panel desktop-only">
        <EmptyState
          title={t('chats.selectedEmpty')}
          text={t('chats.selectedEmptyText')}
        />
      </div>
    </section>
  );
}
