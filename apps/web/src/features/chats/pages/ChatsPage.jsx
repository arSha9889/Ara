import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';

import { AppNavigationTrigger } from '../../../app/layout/AppShell.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useLayoutMode } from '../../../app/providers/LayoutModeProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { createSavedChat, getChats, getPublicBranches, restoreChat } from '../api/chatApi.js';

function chatTitle(chat, t) {
  if (chat.type === 'saved') return t('chats.savedTitle');
  if (chat.type === 'branch') return chat.title || t('chats.branchTitle');
  return chat.peer?.display_name || chat.peer?.username || t('chats.directChat');
}

function chatSubtitle(chat, currentUserId, t) {
  if (chat.type === 'branch' && !chat.last_message) return chat.description || t('chats.publicBranchSubtitle');
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

function activityLabel(activityType, t) {
  if (activityType === 'typing') return t('messages.typing');
  if (activityType === 'file') return t('messages.sendingFile');
  if (activityType === 'voice') return t('messages.sendingVoice');
  return t('messages.peerActive');
}

function mergeChatsAndPublicBranches(chats, publicBranches) {
  const publicBranchIds = new Set(publicBranches.map((branch) => branch.id));

  return [...chats.filter((chat) => !publicBranchIds.has(chat.id)), ...publicBranches]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}

export function ChatsPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const { effectiveMode } = useLayoutMode();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMenuOpen, toggleNavigation } = useOutletContext();
  const [chats, setChats] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activityByChatId, setActivityByChatId] = useState({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const reconnectTimerRef = useRef(null);
  const activityTimersRef = useRef(new Map());
  const socketRef = useRef(null);
  const chatsRef = useRef([]);
  const loadChatsRef = useRef(null);
  const chatsRequestIdRef = useRef(0);
  const lastResyncAtRef = useRef(0);
  const { enableNotifications, isEnabled, isSupported, permission, pushConfigured } = useNotifications();
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationPromptStatus, setNotificationPromptStatus] = useState('');
  const [undoChat, setUndoChat] = useState(null);
  const undoTimerRef = useRef(null);
  const searchInputRef = useRef(null);
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
  const hasVisibleChats = visibleChats.length > 0;

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
      const [nextChats, nextPublicBranches] = await Promise.all([
        getChats(session.accessToken),
        effectiveMode === 'mobile' ? getPublicBranches(session.accessToken) : Promise.resolve([]),
      ]);
      if (chatsRequestIdRef.current === requestId) {
        setChats(effectiveMode === 'mobile'
          ? mergeChatsAndPublicBranches(nextChats, nextPublicBranches)
          : nextChats);
      }
    } finally {
      if (showLoading && chatsRequestIdRef.current === requestId) setIsLoading(false);
    }
  }

  loadChatsRef.current = loadChats;

  useEffect(() => {
    loadChats().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, session.accessToken]);

  useEffect(() => {
    const hiddenChat = location.state?.hiddenChat;
    if (!hiddenChat) return;
    setUndoChat(hiddenChat);
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!undoChat) return undefined;
    undoTimerRef.current = window.setTimeout(() => setUndoChat(null), 6500);
    return () => window.clearTimeout(undoTimerRef.current);
  }, [undoChat]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    activityTimersRef.current.forEach(({ timer }) => window.clearTimeout(timer));
    activityTimersRef.current.clear();
  }, []);

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
            clearChatActivity(payload.chat_id);
            loadChats({ showLoading: false }).catch((err) => setError(err.message));
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

  async function handleRestoreChat() {
    if (!undoChat) return;
    setError('');
    try {
      const restoredChat = await restoreChat(session.accessToken, undoChat.id);
      setChats((current) => [restoredChat, ...current.filter((chat) => chat.id !== restoredChat.id)]);
      setUndoChat(null);
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
            <button
              className="mobile-chat-search-trigger"
              type="button"
              onClick={() => setIsSearchOpen((current) => !current)}
              aria-label={t('chats.searchChats')}
              aria-expanded={isSearchOpen}
            >
              <Icon name={isSearchOpen ? 'x' : 'search'} size={20} />
            </button>
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
        <div className={`chat-list-tools ${isSearchOpen ? 'is-search-open' : ''}`}>
          <label className="chat-search-field">
            <span className="chat-search-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
            <input
              ref={searchInputRef}
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
        <div className="chat-list-saved-slot">
          <button className="info-card saved-chat-card" type="button" onClick={handleOpenSavedChat}>
            <div className="chat-list-avatar saved-avatar" aria-hidden="true">★</div>
            <div>
              <strong>{t('chats.savedTitle')}</strong>
              <span className="muted">{savedChat ? chatSubtitle(savedChat, session.user?.id, t) : t('chats.savedSubtitle')}</span>
            </div>
            <span className="chat-list-badge">{t('chats.savedBadge')}</span>
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        {isLoading ? <AraChatLoader compact title={t('chats.loadingTitle')} text={t('chats.loadingText')} /> : null}
        <div className="list-stack">
          {visibleChats.map((chat) => {
            const activityType = activityByChatId[chat.id];
            return (
            <Link className="info-card chat-thread-card" key={chat.id} to={`/app/chats/${chat.id}`}>
              <span className="chat-list-avatar-wrap">
                {chat.type === 'branch'
                  ? <span className="chat-list-avatar branch-avatar" aria-hidden="true">{chat.avatar_ref || '◎'}</span>
                  : <UserAvatar baseClass="chat-list-avatar" profile={chat.peer} fallback={chatTitle(chat, t)[0] || 'N'} />}
                {chat.peer?.is_online ? <span className="presence-dot online" aria-hidden="true" /> : null}
              </span>
              <div className="chat-thread-copy">
                <strong>{chatTitle(chat, t)} {(chat.type === 'branch' && chat.is_official) || chat.peer?.is_official ? <span className="official-badge" title={t('common.official')}>✓</span> : null}</strong>
                <span className={activityType ? `chat-thread-activity ${activityType}` : 'muted'}>{activityType ? activityLabel(activityType, t) : chatSubtitle(chat, session.user?.id, t)}</span>
              </div>
              {chat.unread_count ? (
                <span className="chat-unread-badge" aria-label={t('common.unread').replace('{count}', chat.unread_count)}>
                  {chat.unread_count > 99 ? '99+' : chat.unread_count}
                </span>
              ) : null}
            </Link>
            );
          })}
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
        {undoChat ? (
          <div className="chat-undo-toast" role="status">
            <span className="chat-undo-toast-icon" aria-hidden="true"><Icon name="trash" size={17} /></span>
            <span>{t('chats.chatRemoved')}</span>
            <button type="button" onClick={handleRestoreChat}>{t('chats.undo')}</button>
          </div>
        ) : null}
    </section>
  );
}
