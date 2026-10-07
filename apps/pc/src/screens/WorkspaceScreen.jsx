import { useCallback, useEffect, useRef, useState } from 'react';

import { parrotIcon } from '../components/BrandMark.jsx';
import { ThemeLanguageControls } from '../components/ThemeLanguageControls.jsx';
import { WorkspaceIcon as Icon } from '../components/WorkspaceIcon.jsx';
import { getChat, getChats } from '../features/chats/chatsApi.js';
import { isCallSignal, useDirectCall } from '../features/calls/useDirectCall.js';
import { createRealtimeConnection } from '../features/chats/realtimeClient.js';
import { showDesktopNotification } from '../features/notifications/desktopNotifications.js';
import { getNotifications, markNotificationsRead } from '../features/notifications/notificationsApi.js';
import { CallOverlay } from './workspace/CallOverlay.jsx';
import { CallsPanel } from './workspace/CallsPanel.jsx';
import { ChatPanel } from './workspace/ChatPanel.jsx';
import { ContactsPanel } from './workspace/ContactsPanel.jsx';
import { NotificationsPanel } from './workspace/NotificationsPanel.jsx';
import { ProfilePanel } from './workspace/ProfilePanel.jsx';
import { SettingsPanel } from './workspace/SettingsPanel.jsx';

const NAVIGATION_ITEMS = [
  { id: 'chats', icon: 'chats' },
  { id: 'calls', icon: 'calls' },
  { id: 'contacts', icon: 'contacts' },
];

const SECONDARY_NAVIGATION_ITEMS = [
  { id: 'profile', icon: 'profile' },
  { id: 'notifications', icon: 'bell' },
  { id: 'settings', icon: 'settings' },
];

function EmptyIllustration() {
  return (
    <div className="workspace-empty-illustration" aria-hidden="true">
      <span className="empty-orbit empty-orbit-one" />
      <span className="empty-orbit empty-orbit-two" />
      <svg viewBox="0 0 176 152" fill="none">
        <path d="M42 103.5c-11.6 0-21-8.8-21-19.7 0-7.5 4.4-14.1 10.9-17.5-1.2-2.5-1.9-5.3-1.9-8.2 0-11.1 9.7-20.1 21.6-20.1 4.5 0 8.7 1.3 12.2 3.6C68.3 29.1 80.6 20 95 20c17.9 0 32.5 14 32.5 31.2 0 1.8-.2 3.5-.5 5.2 10.4 1.2 18.5 9.5 18.5 19.5 0 10.9-9.6 19.8-21.4 19.8H42Z" className="empty-cloud" />
        <path d="M55 111.5h61M68 126.5h35" className="empty-line" />
        <path d="M82.5 45.5c0-8.5 6.7-15.5 15-15.5h7.5c10.8 0 19.5 8.7 19.5 19.5S115.8 69 105 69h-8l-10.8 8 .7-10.5a20 20 0 0 1-4.4-12.5Z" className="empty-bubble" />
        <circle cx="95" cy="49.5" r="2" className="empty-dot" />
        <circle cx="103" cy="49.5" r="2" className="empty-dot" />
        <circle cx="111" cy="49.5" r="2" className="empty-dot" />
      </svg>
      <span className="empty-feather empty-feather-one" />
      <span className="empty-feather empty-feather-two" />
    </div>
  );
}

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

function locale() {
  return document.documentElement.lang === 'en' ? 'en' : 'ru';
}

function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale(), sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short' }).format(date);
}

function notificationTime(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortNotifications(items) {
  const unique = new Map();
  items.forEach((item) => {
    if (item?.id) unique.set(item.id, item);
  });
  return [...unique.values()].sort((first, second) => notificationTime(second.created_at) - notificationTime(first.created_at));
}

function chatPreview(lastMessage, t) {
  if (!lastMessage) return t('workspace.noMessagesPreview');
  if (lastMessage.type === 'text' || lastMessage.type === 'emoji') return lastMessage.payload;
  if (lastMessage.type === 'photo' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('image/'))) return t('workspace.chatPanel.typePhoto');
  if (lastMessage.type === 'video' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('video/'))) return t('workspace.chatPanel.typeVideo');
  if (lastMessage.type === 'voice' || (lastMessage.type === 'file' && lastMessage.media_mime_type?.startsWith('audio/'))) return t('workspace.chatPanel.typeAudio');
  if (lastMessage.type === 'call') return t('workspace.calls');
  return t('workspace.chatPanel.typeFile');
}

export function WorkspaceScreen({ accessToken, currentUser, currentUserId, onCurrentUserUpdated, onLogout, preferences, updatePreferences, t }) {
  const [activeSection, setActiveSection] = useState('chats');
  const [query, setQuery] = useState('');
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [contactMode, setContactMode] = useState('contacts');
  const [chats, setChats] = useState([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [chatsError, setChatsError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [realtimeEvents, setRealtimeEvents] = useState([]);
  const [realtimeResyncVersion, setRealtimeResyncVersion] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [activeCallChat, setActiveCallChat] = useState(null);
  const [callError, setCallError] = useState('');
  const chatsRef = useRef([]);
  const loadChatsRef = useRef(null);
  const loadNotificationsRef = useRef(null);
  const realtimeConnectionRef = useRef(null);
  const subscribedChatIdsRef = useRef(new Set());
  const chatsRequestIdRef = useRef(0);
  const chatsRefreshTimerRef = useRef(null);
  const realtimeEventIdRef = useRef(0);
  const hasAuthenticatedRealtimeRef = useRef(false);
  const notificationsRequestIdRef = useRef(0);
  const knownNotificationIdsRef = useRef(new Set());
  const ownMessageIdsRef = useRef([]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleChats = chats.filter((chat) => {
    const peer = chat.peer;
    const searchable = `${peer?.display_name ?? ''} ${peer?.username ?? ''} ${chat.last_message?.payload ?? ''}`;
    return searchable.toLocaleLowerCase().includes(normalizedQuery);
  });
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  const loadChats = useCallback(async ({ showLoading = true } = {}) => {
    if (!accessToken) return;
    const requestId = chatsRequestIdRef.current + 1;
    chatsRequestIdRef.current = requestId;
    if (showLoading) setIsLoadingChats(true);
    setChatsError('');
    try {
      const serverChats = await getChats(accessToken);
      if (chatsRequestIdRef.current === requestId) {
        setChats(Array.isArray(serverChats) ? serverChats.filter((chat) => chat.type === 'direct') : []);
      }
    } catch (requestError) {
      if (chatsRequestIdRef.current === requestId) setChatsError(requestError.message);
    } finally {
      if (showLoading && chatsRequestIdRef.current === requestId) setIsLoadingChats(false);
    }
  }, [accessToken]);

  chatsRef.current = chats;
  loadChatsRef.current = loadChats;

  const subscribeKnownChats = useCallback(() => {
    const connection = realtimeConnectionRef.current;
    if (!connection) return;

    chatsRef.current.forEach((chat) => {
      if (chat.type !== 'direct' || subscribedChatIdsRef.current.has(chat.id)) return;
      if (connection.send({ event: 'chat.subscribe', chat_id: chat.id })) {
        subscribedChatIdsRef.current.add(chat.id);
      }
    });
  }, []);

  const scheduleChatsRefresh = useCallback(() => {
    if (chatsRefreshTimerRef.current !== null) return;
    chatsRefreshTimerRef.current = window.setTimeout(() => {
      chatsRefreshTimerRef.current = null;
      void loadChatsRef.current?.({ showLoading: false });
    }, 250);
  }, []);

  const onRealtimeSend = useCallback((payload) => realtimeConnectionRef.current?.send(payload) ?? false, []);

  const handleCallError = useCallback((message) => setCallError(message), []);
  const call = useDirectCall({
    accessToken,
    currentUserId,
    canSignalCall: realtimeStatus === 'connected',
    onRealtimeSend,
    onError: handleCallError,
    t,
  });

  const resolveCallChat = useCallback(async (chatId) => {
    const knownChat = chatsRef.current.find((chat) => chat.id === chatId);
    if (knownChat) return knownChat;

    try {
      const chat = await getChat(accessToken, chatId);
      if (chat?.type !== 'direct' || !chat.peer) return null;
      setChats((current) => current.some((item) => item.id === chat.id) ? current : [chat, ...current]);
      return chat;
    } catch {
      return null;
    }
  }, [accessToken]);

  const startCall = useCallback(async (chat, callType) => {
    if (!chat?.peer || call.callState !== 'idle') return;
    setCallError('');
    setActiveCallChat(chat);
    const didStart = await call.startCall({ chatId: chat.id, peer: chat.peer, callType });
    if (!didStart) setActiveCallChat(null);
  }, [call]);

  useEffect(() => {
    if (call.callState === 'idle') setActiveCallChat(null);
  }, [call.callState]);

  const loadNotifications = useCallback(async ({ showLoading = true } = {}) => {
    if (!accessToken) return;
    const requestId = notificationsRequestIdRef.current + 1;
    notificationsRequestIdRef.current = requestId;
    if (showLoading) setIsLoadingNotifications(true);
    setNotificationsError('');
    try {
      const items = await getNotifications(accessToken);
      if (notificationsRequestIdRef.current !== requestId) return;
      const nextNotifications = Array.isArray(items) ? items : [];
      nextNotifications.forEach((notification) => knownNotificationIdsRef.current.add(notification.id));
      setNotifications((current) => sortNotifications([...current, ...nextNotifications]));
    } catch (requestError) {
      if (notificationsRequestIdRef.current === requestId) setNotificationsError(requestError.message);
    } finally {
      if (showLoading && notificationsRequestIdRef.current === requestId) setIsLoadingNotifications(false);
    }
  }, [accessToken]);
  loadNotificationsRef.current = loadNotifications;

  const handleRealtimeEventRef = useRef(null);
  handleRealtimeEventRef.current = (payload) => {
    if (!payload || typeof payload !== 'object') return;

    if (isCallSignal(payload)) {
      if (payload.event === 'call.invite') {
        void (async () => {
          const chat = await resolveCallChat(payload.chat_id);
          if (!chat) {
            onRealtimeSend({ event: 'call.reject', call_id: payload.call_id, chat_id: payload.chat_id });
            setCallError(t('workspace.callsPanel.callChatUnavailable'));
            return;
          }
          setCallError('');
          setActiveCallChat(chat);
          await call.handleSignal(payload);
        })();
      } else {
        void call.handleSignal(payload);
      }
      return;
    }

    if (payload.event === 'notification.created' && payload.notification?.id) {
      const notification = payload.notification;
      const isNewNotification = !knownNotificationIdsRef.current.has(notification.id);
      knownNotificationIdsRef.current.add(notification.id);
      setNotifications((current) => sortNotifications([
        notification,
        ...current.filter((item) => item.id !== notification.id),
      ]));

      const isOpenChat = activeSection === 'chats' && selectedChatId === notification.chat_id;
      const isOwnMessage = Boolean(notification.message_id && ownMessageIdsRef.current.includes(notification.message_id));
      if (isNewNotification && preferences.desktopNotifications && !isOpenChat && !isOwnMessage) {
        void showDesktopNotification({
          title: notification.title || t('window.appName'),
          body: preferences.messagePreview ? notification.body : t('workspace.notificationsPanel.newMessage'),
          soundEnabled: Boolean(preferences.soundEnabled),
        }).catch(() => undefined);
      }
      return;
    }

    if (payload.event === 'message.created' && payload.message?.sender_id === currentUserId) {
      ownMessageIdsRef.current = [...ownMessageIdsRef.current.slice(-199), payload.message.id];
    }

    if (payload.event === 'presence.status' && payload.user_id) {
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

    if (![
      'message.created',
      'message.updated',
      'message.deleted',
      'message.read',
      'message.reactions_updated',
      'message.pin_updated',
      'typing.started',
      'typing.stopped',
      'file.uploading',
      'voice.uploading',
      'presence.active',
      'presence.status',
    ].includes(payload.event)) return;

    const eventId = realtimeEventIdRef.current + 1;
    realtimeEventIdRef.current = eventId;
    setRealtimeEvents((current) => [...current.slice(-199), { id: eventId, payload }]);
    if (payload.event.startsWith('message.')) scheduleChatsRefresh();
  };

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    knownNotificationIdsRef.current = new Set();
    ownMessageIdsRef.current = [];
    setNotifications([]);
    void loadNotifications();
  }, [accessToken, loadNotifications]);

  useEffect(() => {
    subscribeKnownChats();
  }, [chats, realtimeStatus, subscribeKnownChats]);

  useEffect(() => {
    if (!accessToken) {
      setRealtimeStatus('disconnected');
      return undefined;
    }

    subscribedChatIdsRef.current = new Set();
    const connection = createRealtimeConnection(accessToken, {
      onEvent: (payload) => handleRealtimeEventRef.current?.(payload),
      onStatus: (status) => {
        setRealtimeStatus(status);
        if (status !== 'connected') return;

        subscribedChatIdsRef.current = new Set();
        subscribeKnownChats();
        void loadChatsRef.current?.({ showLoading: false });
        if (hasAuthenticatedRealtimeRef.current) {
          void loadNotificationsRef.current?.({ showLoading: false });
          setRealtimeResyncVersion((current) => current + 1);
        } else {
          hasAuthenticatedRealtimeRef.current = true;
        }
      },
    });
    realtimeConnectionRef.current = connection;

    return () => {
      connection.close();
      if (realtimeConnectionRef.current === connection) realtimeConnectionRef.current = null;
    };
  }, [accessToken, subscribeKnownChats]);

  useEffect(() => () => {
    window.clearTimeout(chatsRefreshTimerRef.current);
  }, []);

  async function markNotificationRead(notificationId) {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.read_at) return;
    try {
      await markNotificationsRead(accessToken, [notificationId]);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: readAt } : item));
    } catch (requestError) {
      setNotificationsError(requestError.message);
    }
  }

  async function markAllNotificationsRead() {
    const unreadIds = notifications.filter((notification) => !notification.read_at).map((notification) => notification.id);
    if (!unreadIds.length || isUpdatingNotifications) return;
    setNotificationsError('');
    setIsUpdatingNotifications(true);
    try {
      await markNotificationsRead(accessToken);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => notification.read_at ? notification : { ...notification, read_at: readAt }));
    } catch (requestError) {
      setNotificationsError(requestError.message);
    } finally {
      setIsUpdatingNotifications(false);
    }
  }

  function openSection(section) {
    setActiveSection(section);
    if (section !== 'chats') setSelectedChatId(null);
    if (section === 'contacts') setContactMode('contacts');
  }

  function openChat(chatId) {
    setActiveSection('chats');
    setSelectedChatId(chatId);
  }

  function openNewChat() {
    setActiveSection('contacts');
    setSelectedChatId(null);
    setContactMode('new');
  }

  function openNotification(notification) {
    void markNotificationRead(notification.id);
    if (notification.chat_id) {
      openChat(notification.chat_id);
      void loadChats({ showLoading: false });
    }
  }

  function handleChatCreated(chat) {
    setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
    setQuery('');
    openChat(chat.id);
  }

  const renderMainContent = () => {
    if (activeSection === 'profile') return <ProfilePanel accessToken={accessToken} t={t} />;
    if (activeSection === 'calls') return <CallsPanel call={call} t={t} />;
    if (activeSection === 'notifications') {
      return <NotificationsPanel error={notificationsError} isLoading={isLoadingNotifications} isUpdating={isUpdatingNotifications} notifications={notifications} onMarkAllRead={markAllNotificationsRead} onOpenNotification={openNotification} onRetry={() => loadNotifications()} t={t} />;
    }
    if (activeSection === 'settings') {
      return <SettingsPanel accessToken={accessToken} currentUser={currentUser} onCurrentUserUpdated={onCurrentUserUpdated} onLogout={onLogout} preferences={preferences} updatePreferences={updatePreferences} t={t} />;
    }
    if (activeSection === 'contacts') {
      return <ContactsPanel accessToken={accessToken} currentUserId={currentUserId} mode={contactMode} onChatCreated={handleChatCreated} t={t} />;
    }

    if (selectedChat) {
      return <ChatPanel key={selectedChat.id} accessToken={accessToken} chat={selectedChat} currentUserId={currentUserId} realtimeEvents={realtimeEvents} realtimeResyncVersion={realtimeResyncVersion} realtimeStatus={realtimeStatus} t={t} onBack={() => setSelectedChatId(null)} onChatChanged={() => loadChats({ showLoading: false })} onMessageSent={() => loadChats({ showLoading: false })} onRealtimeSend={onRealtimeSend} onStartCall={startCall} canStartCall={call.canUseCalls && call.canSignalCall && call.callState === 'idle' && Boolean(selectedChat.peer?.id)} />;
    }

    return (
      <section className="workspace-empty-state" aria-labelledby="workspace-empty-title">
        <EmptyIllustration />
        <p>{t('workspace.emptyKicker')}</p>
        <h1 id="workspace-empty-title">{t('workspace.emptyTitle')}</h1>
        <span>{t('workspace.emptyText')}</span>
        <button className="workspace-outline-button" type="button" onClick={openNewChat}><Icon name="plus" size={16} />{t('workspace.findUser')}</button>
      </section>
    );
  };

  return (
    <main className={`workspace-screen density-${preferences.density ?? 'comfortable'}`}>
      <aside className="workspace-nav" aria-label={t('workspace.navigation')}>
        <button className="workspace-logo" type="button" aria-label={t('window.appName')} onClick={() => { openSection('chats'); setSelectedChatId(null); }}>
          <img src={parrotIcon} alt="" />
        </button>
        <nav className="workspace-nav-groups">
          <div className="workspace-nav-group">
            {NAVIGATION_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return <button className={`workspace-nav-button ${isActive ? 'is-active' : ''}`} type="button" key={item.id} aria-label={t(`workspace.${item.id}`)} aria-current={isActive ? 'page' : undefined} onClick={() => openSection(item.id)}><Icon name={item.icon} /></button>;
            })}
          </div>
          <div className="workspace-nav-separator" />
          <div className="workspace-nav-group workspace-nav-group-bottom">
            {SECONDARY_NAVIGATION_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return <button className={`workspace-nav-button ${isActive ? 'is-active' : ''}`} type="button" key={item.id} aria-label={t(`workspace.${item.id}`)} aria-current={isActive ? 'page' : undefined} onClick={() => openSection(item.id)}><Icon name={item.icon} /></button>;
            })}
          </div>
        </nav>
      </aside>

      <aside className="workspace-list" aria-label={t('workspace.chats')}>
        <div className="workspace-list-header">
          <div>
            <h1>{t('workspace.chatsTitle')}</h1>
            <p>{t('workspace.chatsIntro')}</p>
          </div>
          <div className="workspace-list-actions">
            <ThemeLanguageControls preferences={preferences} updatePreferences={updatePreferences} t={t} compact />
            <button className="workspace-list-refresh" type="button" aria-label={t('workspace.refreshChats')} onClick={() => loadChats()} disabled={isLoadingChats}><Icon name="refresh" size={16} /></button>
            <button className="workspace-new-chat" type="button" aria-label={t('workspace.newChat')} onClick={openNewChat}><Icon name="plus" /></button>
          </div>
        </div>

        <label className="workspace-search">
          <Icon name="search" size={18} />
          <span className="sr-only">{t('workspace.search')}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('workspace.searchPlaceholder')} />
          {query ? <button type="button" aria-label={t('workspace.clearSearch')} onClick={() => setQuery('')}><Icon name="close" size={15} /></button> : null}
        </label>

        <div className="workspace-chat-list" aria-busy={isLoadingChats}>
          {chatsError ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.chatsLoadError')}</strong><span>{chatsError}</span><button type="button" onClick={() => loadChats()}>{t('workspace.retry')}</button></div> : null}
          {isLoadingChats ? <p className="workspace-list-status" role="status">{t('workspace.loadingChats')}</p> : chatsError ? null : visibleChats.length ? visibleChats.map((chat) => {
            const isSelected = selectedChatId === chat.id && activeSection === 'chats';
            const peer = chat.peer;
            const name = peer?.display_name || peer?.username || t('workspace.unknownUser');
            const preview = chatPreview(chat.last_message, t);
            const timestamp = formatChatTime(chat.last_message?.created_at || chat.updated_at);
            return (
              <button className={`workspace-chat-row ${isSelected ? 'is-selected' : ''}`} type="button" key={chat.id} onClick={() => openChat(chat.id)} aria-pressed={isSelected}>
                <span className={`workspace-avatar is-${avatarTone(peer?.id || chat.id)}`} aria-hidden="true">{initials(name, peer?.username)}</span>
                <span className="workspace-chat-copy">
                  <span className="workspace-chat-name">{name}</span>
                  <span className="workspace-chat-preview">{preview}</span>
                </span>
                <span className="workspace-chat-meta">
                  {timestamp ? <time>{timestamp}</time> : null}
                  {chat.unread_count ? <span className="workspace-unread" aria-label={t('workspace.unread', { count: chat.unread_count })}>{chat.unread_count}</span> : null}
                </span>
              </button>
            );
          }) : (
            <div className="workspace-no-results"><strong>{normalizedQuery ? t('workspace.noSearchResults') : t('workspace.noChatsTitle')}</strong><span>{normalizedQuery ? t('workspace.noSearchResultsText') : t('workspace.noChatsText')}</span>{normalizedQuery ? null : <button className="workspace-list-empty-action" type="button" onClick={openNewChat}>{t('workspace.findUser')}</button>}</div>
          )}
        </div>
        <p className="workspace-list-footer">{t('workspace.directChatsOnly')}</p>
      </aside>

      <div className={`workspace-main ${selectedChat && activeSection === 'chats' ? 'is-chat-open' : ''}`}>
        {renderMainContent()}
      </div>
      <CallOverlay call={call} peer={activeCallChat?.peer} t={t} />
      {callError && call.callState === 'idle' ? <div className="desktop-call-error" role="alert"><Icon name="warning" size={18} /><span>{callError}</span><button type="button" aria-label={t('common.close')} onClick={() => setCallError('')}><Icon name="close" size={15} /></button></div> : null}
    </main>
  );
}
