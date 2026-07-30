import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { createRealtimeConnection } from '../../../shared/api/webSocketClient.js';
import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState } from '../../../shared/ui/EmptyState.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { searchUsers } from '../../profile/api/userApi.js';
import { createDirectChat, createDirectChatForUser, createSavedChat, getChats } from '../api/chatApi.js';

const PHONE_COUNTRIES = [
  { code: 'RU', dialCode: '+7', flag: '🇷🇺', labelKey: 'phoneCountryRussia', placeholder: '+7 999 123-45-67' },
  { code: 'KZ', dialCode: '+7', flag: '🇰🇿', labelKey: 'phoneCountryKazakhstan', placeholder: '+7 701 123-45-67' },
  { code: 'KG', dialCode: '+996', flag: '🇰🇬', labelKey: 'phoneCountryKyrgyzstan', placeholder: '+996 700 123 456' },
  { code: 'UA', dialCode: '+380', flag: '🇺🇦', labelKey: 'phoneCountryUkraine', placeholder: '+380 67 123 45 67' },
];

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
  const [searchParams] = useSearchParams();
  const [chats, setChats] = useState([]);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [newChatResults, setNewChatResults] = useState([]);
  const [isNewChatSearchLoading, setIsNewChatSearchLoading] = useState(false);
  const [newChatSearchError, setNewChatSearchError] = useState('');
  const [newChatCountry, setNewChatCountry] = useState('RU');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
  const [isPhoneSearchOpen, setIsPhoneSearchOpen] = useState(false);
  const [isChatCountryPickerOpen, setIsChatCountryPickerOpen] = useState(false);
  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);
  const chatsRef = useRef([]);
  const { enableNotifications, isEnabled, isSupported, permission, pushConfigured } = useNotifications();
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationPromptStatus, setNotificationPromptStatus] = useState('');
  const selectedNewChatCountry = PHONE_COUNTRIES.find((country) => country.code === newChatCountry) ?? PHONE_COUNTRIES[0];
  const savedChat = chats.find((chat) => chat.type === 'saved');
  const regularChats = chats.filter((chat) => chat.type !== 'saved' && chat.type !== 'branch');
  const normalizedChatSearch = chatSearch.trim().toLowerCase();
  const visibleRegularChats = normalizedChatSearch
    ? regularChats.filter((chat) => [
      chatTitle(chat, t),
      chat.peer?.username ? `@${chat.peer.username}` : '',
      chat.peer?.username || '',
      chat.peer?.nexus_id || '',
      chatSubtitle(chat, session.user?.id, t),
    ].join(' ').toLowerCase().includes(normalizedChatSearch))
    : regularChats;
  const isSavedChatVisible = !normalizedChatSearch || [
    t('chats.savedTitle'),
    savedChat ? chatSubtitle(savedChat, session.user?.id, t) : t('chats.savedSubtitle'),
    t('chats.savedBadge'),
  ].join(' ').toLowerCase().includes(normalizedChatSearch);
  const hasVisibleChats = isSavedChatVisible || visibleRegularChats.length > 0;

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

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openCreateChatDialog();
    navigate('/app', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchParams]);

  useEffect(() => {
    if (!isCreateChatOpen) return undefined;

    function closeCreateChatDialog(event) {
      if (event.key === 'Escape') {
        setIsCreateChatOpen(false);
        setIsChatCountryPickerOpen(false);
      }
    }

    document.addEventListener('keydown', closeCreateChatDialog);

    return () => {
      document.removeEventListener('keydown', closeCreateChatDialog);
    };
  }, [isCreateChatOpen]);

  useEffect(() => {
    const query = newChatQuery.trim().replace(/^@/, '');
    if (!isCreateChatOpen || query.length < 2) {
      setNewChatResults([]);
      setIsNewChatSearchLoading(false);
      setNewChatSearchError('');
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setIsNewChatSearchLoading(true);
      setNewChatSearchError('');
      searchUsers(session.accessToken, query)
        .then((users) => {
          if (active) setNewChatResults(users.filter((user) => user.id !== session.user?.id));
        })
        .catch((err) => {
          if (active) {
            setNewChatResults([]);
            setNewChatSearchError(err.message);
          }
        })
        .finally(() => {
          if (active) setIsNewChatSearchLoading(false);
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isCreateChatOpen, newChatQuery, session.accessToken, session.user?.id]);

  useEffect(() => {
    if (!isChatCountryPickerOpen) return undefined;

    function closeChatCountryPicker(event) {
      const isInsideCountryMenu = event.target instanceof Element && event.target.closest('.chat-create-country .phone-country-menu');
      if (event.key === 'Escape' || !isInsideCountryMenu) {
        setIsChatCountryPickerOpen(false);
      }
    }

    document.addEventListener('keydown', closeChatCountryPicker);
    document.addEventListener('pointerdown', closeChatCountryPicker);

    return () => {
      document.removeEventListener('keydown', closeChatCountryPicker);
      document.removeEventListener('pointerdown', closeChatCountryPicker);
    };
  }, [isChatCountryPickerOpen]);

  function selectNewChatCountry(country) {
    setNewChatCountry(country.code);
    setNewChatPhone('');
    setIsChatCountryPickerOpen(false);
  }

  function openCreateChatDialog() {
    setNewChatQuery('');
    setNewChatResults([]);
    setNewChatSearchError('');
    setNewChatPhone('');
    setIsPhoneSearchOpen(false);
    setIsChatCountryPickerOpen(false);
    setIsCreateChatOpen(true);
  }

  function closeCreateChatDialog() {
    setIsCreateChatOpen(false);
    setIsChatCountryPickerOpen(false);
  }

  async function openDirectChat(createChat) {
    setError('');
    try {
      const chat = await createChat();
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      closeCreateChatDialog();
      navigate(`/app/chats/${chat.id}`);
    } catch (err) {
      setNewChatSearchError(err.message);
    }
  }

  function handleCreateChatForUser(userId) {
    return openDirectChat(() => createDirectChatForUser(session.accessToken, userId));
  }

  async function handleCreateChat(event) {
    event.preventDefault();
    if (!newChatPhone.trim()) return;
    await openDirectChat(() => createDirectChat(session.accessToken, { country: newChatCountry, phone: newChatPhone }));
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
            onClick={openCreateChatDialog}
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        {isCreateChatOpen ? (
          <div className="app-dialog-backdrop chat-create-backdrop" role="presentation" onMouseDown={closeCreateChatDialog}>
            <form className="app-dialog chat-create-dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleCreateChat}>
              <div className="app-dialog-heading">
                <div className="chat-create-copy">
                  <p className="eyebrow">AraChat</p>
                  <strong id="new-chat-title">{t('chats.newChatTitle')}</strong>
                  <span className="muted">{t('chats.newChatText')}</span>
                </div>
                <button className="app-dialog-close" type="button" onClick={closeCreateChatDialog} aria-label={t('common.close')}>×</button>
              </div>
              <div className="chat-create-search">
                <TextInput
                  label={t('chats.newChatSearchLabel')}
                  autoFocus
                  autoComplete="off"
                  value={newChatQuery}
                  placeholder={t('chats.newChatSearchPlaceholder')}
                  onChange={(event) => setNewChatQuery(event.target.value)}
                />
                <span className="chat-create-search-hint">{t('chats.newChatSearchHint')}</span>
                {isNewChatSearchLoading ? <span className="chat-create-search-status">{t('chats.newChatSearching')}</span> : null}
                {newChatSearchError ? <p className="error-text">{newChatSearchError}</p> : null}
                {!isNewChatSearchLoading && !newChatSearchError && newChatQuery.trim().replace(/^@/, '').length >= 2 && newChatResults.length === 0 ? (
                  <p className="chat-create-search-status">{t('chats.newChatSearchEmpty')}</p>
                ) : null}
                <div className="chat-create-results" aria-live="polite">
                  {newChatResults.map((user) => (
                    <article className="chat-create-result" key={user.id}>
                      <UserAvatar baseClass="chat-create-result-avatar" profile={user.profile} fallback={user.profile?.display_name?.[0] || user.profile?.username?.[0] || 'A'} />
                      <div className="chat-create-result-copy">
                        <strong>{user.profile?.display_name || user.profile?.username}</strong>
                        <span>@{user.profile?.username}</span>
                      </div>
                      <Button type="button" onClick={() => handleCreateChatForUser(user.id)}>{t('chats.newChatWrite')}</Button>
                    </article>
                  ))}
                </div>
              </div>
              <div className="chat-create-phone-fallback">
                <button
                  className="chat-create-phone-toggle"
                  type="button"
                  aria-expanded={isPhoneSearchOpen}
                  onClick={() => setIsPhoneSearchOpen((current) => !current)}
                >
                  <span>{t('chats.newChatFindByPhone')}</span>
                  <span aria-hidden="true">{isPhoneSearchOpen ? '⌃' : '⌄'}</span>
                </button>
                {isPhoneSearchOpen ? (
                  <div className="chat-create-phone-content">
                    <span className="muted">{t('chats.newChatFindByPhoneText')}</span>
                    <div className="chat-create-phone-row">
                      <div className="phone-country-field chat-create-country">
                        <span className="phone-country-label">{t('register.phoneCountry')}</span>
                        <div className="phone-country-menu">
                          <button
                            className="phone-country-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={isChatCountryPickerOpen}
                            onClick={() => setIsChatCountryPickerOpen((current) => !current)}
                          >
                            <span className="phone-country-flag" aria-hidden="true">{selectedNewChatCountry.flag}</span>
                            <span className="phone-country-trigger-copy">
                              <strong>{selectedNewChatCountry.code}</strong>
                              <small>{selectedNewChatCountry.dialCode}</small>
                            </span>
                            <span className="phone-country-chevron" aria-hidden="true">⌄</span>
                          </button>
                          {isChatCountryPickerOpen ? (
                            <div className="phone-country-list" role="listbox" aria-label={t('register.phoneCountry')}>
                              {PHONE_COUNTRIES.map((country) => (
                                <button
                                  className={`phone-country-option ${newChatCountry === country.code ? 'active' : ''}`}
                                  type="button"
                                  role="option"
                                  aria-selected={newChatCountry === country.code}
                                  key={country.code}
                                  onClick={() => selectNewChatCountry(country)}
                                >
                                  <span className="phone-country-flag" aria-hidden="true">{country.flag}</span>
                                  <span className="phone-country-option-copy">
                                    <strong>{t(`register.${country.labelKey}`)}</strong>
                                    <small>{country.dialCode} · {country.code}</small>
                                  </span>
                                  <span className="phone-country-check" aria-hidden="true">✓</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <TextInput label={t('chats.phone')} inputMode="tel" placeholder={selectedNewChatCountry.placeholder} value={newChatPhone} onChange={(event) => setNewChatPhone(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={!newChatPhone.trim()}>{t('chats.newChatFind')}</Button>
                  </div>
                ) : null}
              </div>
            </form>
          </div>
        ) : null}
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
          {visibleRegularChats.map((chat) => (
            <Link className="info-card chat-thread-card" key={chat.id} to={`/app/chats/${chat.id}`}>
              <span className="chat-list-avatar-wrap">
                <UserAvatar baseClass="chat-list-avatar" profile={chat.peer} fallback={chatTitle(chat, t)[0] || 'N'} />
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
        {!isLoading && !normalizedChatSearch && regularChats.length === 0 ? (
          <EmptyState
            title={t('chats.emptyTitle')}
            text={t('chats.emptyText')}
            action={<button className="empty-state-action" type="button" onClick={openCreateChatDialog}><Icon name="plus" size={18} />{t('chats.createChat')}</button>}
          />
        ) : null}
        {!isLoading && normalizedChatSearch && !hasVisibleChats ? <EmptyState title={t('chats.searchEmptyTitle')} text={t('chats.searchEmptyText')} /> : null}
      </div>
        <div className="panel desktop-only workspace-welcome-panel">
          <div className="workspace-welcome-art" aria-hidden="true"><Icon name="sparkles" size={42} /></div>
          <p className="workspace-kicker">AraChat</p>
          <EmptyState title={t('chats.selectedEmpty')} text={t('chats.selectedEmptyText')} action={<button className="empty-state-action" type="button" onClick={openCreateChatDialog}><Icon name="plus" size={18} />{t('chats.createChat')}</button>} />
        </div>
    </section>
  );
}
