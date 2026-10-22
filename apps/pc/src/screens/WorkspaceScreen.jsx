import { useCallback, useEffect, useRef, useState } from 'react';

import { getChat, getChatMessage, getChats, hideAllDirectChats } from '../features/chats/chatsApi.js';
import { isCallSignal, useDirectCall } from '../features/calls/useDirectCall.js';
import { createRealtimeConnection } from '../features/chats/realtimeClient.js';
import { showDesktopNotification, subscribeDesktopNotificationActions } from '../features/notifications/desktopNotifications.js';
import { getNotifications, markNotificationsRead } from '../features/notifications/notificationsApi.js';
import { notificationId, notificationTarget } from '../features/notifications/notificationTarget.js';
import { CallOverlay } from './workspace/CallOverlay.jsx';
import { CallsPanel } from './workspace/CallsPanel.jsx';
import { ChatPanel } from './workspace/ChatPanel.jsx';
import { ChannelsPanel } from './workspace/ChannelsPanel.jsx';
import { ContactsPanel } from './workspace/ContactsPanel.jsx';
import { NotificationsPanel } from './workspace/NotificationsPanel.jsx';
import { ProfilePanel } from './workspace/ProfilePanel.jsx';
import { SettingsPanel } from './workspace/SettingsPanel.jsx';
import { WorkspaceCallError } from './workspace/WorkspaceCallError.jsx';
import { WorkspaceChatList } from './workspace/WorkspaceChatList.jsx';
import { WorkspaceEmptyState } from './workspace/WorkspaceEmptyState.jsx';
import { WorkspaceNavigation } from './workspace/WorkspaceNavigation.jsx';
import { WorkspaceShell } from './workspace/WorkspaceShell.jsx';

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

export function WorkspaceScreen({ accessToken, currentUser, currentUserId, onCurrentUserUpdated, onLogout, preferences, updatePreferences, t }) {
  const [activeSection, setActiveSection] = useState('chats');
  const [query, setQuery] = useState('');
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messageFocus, setMessageFocus] = useState(null);
  const [contactMode, setContactMode] = useState('contacts');
  const [chats, setChats] = useState([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isClearingChats, setIsClearingChats] = useState(false);
  const [chatsError, setChatsError] = useState('');
  const [chatsNotice, setChatsNotice] = useState('');
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
  const messageFocusRequestIdRef = useRef(0);
  const messageFocusResolversRef = useRef(new Map());
  const directChatCount = chats.filter((chat) => chat.type === 'direct').length;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);
  const isStandalonePage = ['profile', 'notifications', 'settings'].includes(activeSection);

  const loadChats = useCallback(async ({ showLoading = true, showSuccess = false } = {}) => {
    if (!accessToken) return;
    const requestId = chatsRequestIdRef.current + 1;
    chatsRequestIdRef.current = requestId;
    if (showLoading) setIsLoadingChats(true);
    setChatsError('');
    if (showSuccess) setChatsNotice('');
    try {
      const serverChats = await getChats(accessToken);
      if (chatsRequestIdRef.current === requestId) {
        setChats(Array.isArray(serverChats) ? serverChats.filter((chat) => ['direct', 'branch'].includes(chat.type)) : []);
        if (showSuccess) setChatsNotice(t('workspace.chatsUpdated'));
      }
    } catch (requestError) {
      if (chatsRequestIdRef.current === requestId) setChatsError(requestError.message);
    } finally {
      if (chatsRequestIdRef.current === requestId) setIsLoadingChats(false);
    }
  }, [accessToken, t]);

  chatsRef.current = chats;
  loadChatsRef.current = loadChats;

  const subscribeKnownChats = useCallback(() => {
    const connection = realtimeConnectionRef.current;
    if (!connection) return;

    chatsRef.current.forEach((chat) => {
      if ((chat.type !== 'direct' && (chat.type !== 'branch' || !chat.is_subscribed)) || subscribedChatIdsRef.current.has(chat.id)) return;
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

  const focusMessage = useCallback((message) => {
    const requestId = messageFocusRequestIdRef.current + 1;
    messageFocusRequestIdRef.current = requestId;

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        const pendingFocus = messageFocusResolversRef.current.get(requestId);
        if (!pendingFocus) return;
        messageFocusResolversRef.current.delete(requestId);
        pendingFocus.resolve(false);
      }, 8_000);
      messageFocusResolversRef.current.set(requestId, { resolve, timeoutId });
      setMessageFocus({ id: message.id, message, requestId });
    });
  }, []);

  const handleMessageFocused = useCallback((requestId) => {
    const pendingFocus = messageFocusResolversRef.current.get(requestId);
    if (!pendingFocus) return;
    window.clearTimeout(pendingFocus.timeoutId);
    messageFocusResolversRef.current.delete(requestId);
    pendingFocus.resolve(true);
  }, []);

  const openNotificationTarget = useCallback(async (notification) => {
    const target = notificationTarget(notification);
    if (!target) {
      setNotificationsError(t('workspace.notificationsPanel.targetUnavailable'));
      return false;
    }

    if (target.kind === 'message') {
      let chat = chatsRef.current.find((item) => item.id === target.chat_id);
      let targetMessage = null;
      try {
        if (!chat) {
          chat = await getChat(accessToken, target.chat_id);
          if (!['direct', 'branch'].includes(chat?.type)) {
            setNotificationsError(t('workspace.notificationsPanel.targetUnavailable'));
            return false;
          }
          setChats((current) => current.some((item) => item.id === chat.id) ? current : [chat, ...current]);
        }
        if (!['direct', 'branch'].includes(chat?.type)) {
          setNotificationsError(t('workspace.notificationsPanel.targetUnavailable'));
          return false;
        }
        if (target.message_id) targetMessage = await getChatMessage(accessToken, chat.id, target.message_id);
      } catch {
        setNotificationsError(t('workspace.notificationsPanel.targetUnavailable'));
        return false;
      }

      setActiveSection(chat.type === 'branch' ? 'channels' : 'chats');
      setSelectedChatId(chat.id);
      if (targetMessage) {
        const didFocusMessage = await focusMessage(targetMessage);
        if (!didFocusMessage) {
          setNotificationsError(t('workspace.notificationsPanel.targetUnavailable'));
          return false;
        }
      } else {
        setMessageFocus(null);
      }
      void loadChats({ showLoading: false });
      return true;
    }

    if (target.kind === 'system' && target.section === 'settings') {
      setActiveSection('settings');
      setSelectedChatId(null);
      setMessageFocus(null);
      return true;
    }

    setNotificationsError(t('workspace.notificationsPanel.targetUnavailable'));
    return false;
  }, [accessToken, focusMessage, loadChats, t]);

  const startCall = useCallback(async (chat, callType) => {
    if (!chat?.peer || call.callState !== 'idle') return false;
    setCallError('');
    setActiveCallChat(chat);
    const didStart = await call.startCall({ chatId: chat.id, peer: chat.peer, callType });
    if (!didStart) setActiveCallChat(null);
    return didStart;
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

      const target = notificationTarget(notification);
      const isOpenChat = activeSection === 'chats' && selectedChatId === target?.chat_id;
      const isOwnMessage = Boolean(target?.message_id && ownMessageIdsRef.current.includes(target.message_id));
      if (isNewNotification && preferences.desktopNotifications && !isOpenChat && !isOwnMessage) {
        void showDesktopNotification({
          accountId: String(currentUserId ?? ''),
          title: notification.title || t('window.appName'),
          body: preferences.messagePreview ? notification.body : t('workspace.notificationsPanel.newMessage'),
          notification,
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
      'branch_comment.created',
      'branch_comment.updated',
      'branch_comment.deleted',
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
    if (payload.event.startsWith('message.') || payload.event.startsWith('branch_comment.')) scheduleChatsRefresh();
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

  useEffect(() => () => {
    messageFocusResolversRef.current.forEach((pendingFocus) => {
      window.clearTimeout(pendingFocus.timeoutId);
      pendingFocus.resolve(false);
    });
    messageFocusResolversRef.current.clear();
  }, []);

  async function markNotificationRead(notificationId) {
    const notification = notifications.find((item) => item.id === notificationId);
    if (notification?.read_at) return true;
    try {
      await markNotificationsRead(accessToken, [notificationId]);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: readAt } : item));
      return true;
    } catch (requestError) {
      setNotificationsError(requestError.message);
      return false;
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

  function openChat(chatOrId, explicitChat = null) {
    const chat = explicitChat || (typeof chatOrId === 'object' ? chatOrId : chatsRef.current.find((item) => item.id === chatOrId));
    if (!chat) return;
    setActiveSection(chat.type === 'branch' ? 'channels' : 'chats');
    setSelectedChatId(chat.id);
    setMessageFocus(null);
  }

  function openNewChat() {
    setActiveSection('contacts');
    setSelectedChatId(null);
    setContactMode('new');
  }

  const openCallHistoryChat = useCallback(async (historyItem) => {
    const chat = await resolveCallChat(historyItem?.chat_id);
    if (!chat) return false;
    setActiveSection('chats');
    setSelectedChatId(chat.id);
    setMessageFocus(null);
    return true;
  }, [resolveCallChat]);

  const startCallFromHistory = useCallback(async (historyItem) => {
    const chat = await resolveCallChat(historyItem?.chat_id);
    if (!chat) return false;
    return startCall(chat, historyItem.call_type);
  }, [resolveCallChat, startCall]);

  async function clearAllChats() {
    if (!directChatCount || isClearingChats || isLoadingChats) return;
    if (!window.confirm(t('workspace.clearChatsConfirmation'))) return;

    chatsRequestIdRef.current += 1;
    setChatsError('');
    setChatsNotice('');
    setIsClearingChats(true);
    try {
      const result = await hideAllDirectChats(accessToken);
      const hiddenCount = Number(result?.hidden_count) || 0;
      setChats((current) => current.filter((chat) => chat.type !== 'direct'));
      setSelectedChatId(null);
      setMessageFocus(null);
      setQuery('');
      setActiveSection('chats');
      setChatsNotice(t('workspace.chatsCleared', { count: hiddenCount }));
    } catch (requestError) {
      setChatsError(requestError.message);
    } finally {
      setIsClearingChats(false);
    }
  }

  async function openNotification(notification) {
    if (!await openNotificationTarget(notification)) return;
    await markNotificationRead(notificationId(notification));
  }

  useEffect(() => {
    let dispose = () => undefined;
    let isActive = true;

    void subscribeDesktopNotificationActions(async (payload) => {
      if (String(payload.account_id) !== String(currentUserId ?? '')) return;
      if (!await openNotificationTarget(payload)) return;
      await markNotificationRead(notificationId(payload));
    }).then((unsubscribe) => {
      if (isActive) dispose = unsubscribe;
      else unsubscribe();
    }).catch(() => undefined);

    return () => {
      isActive = false;
      dispose();
    };
  }, [currentUserId, openNotificationTarget]);

  function handleChatCreated(chat) {
    setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
    setQuery('');
    openChat(chat);
  }

  function handleChannelChanged(channel) {
    if (channel.type === 'branch' && !channel.is_private && !channel.is_subscribed) {
      subscribedChatIdsRef.current.delete(channel.id);
      setChats((current) => current.filter((item) => item.id !== channel.id));
      return;
    }
    setChats((current) => [channel, ...current.filter((item) => item.id !== channel.id)]);
  }

  function handleChannelLeft(channelId) {
    subscribedChatIdsRef.current.delete(channelId);
    setChats((current) => current.filter((chat) => chat.id !== channelId));
    setSelectedChatId((current) => current === channelId ? null : current);
    setMessageFocus(null);
    setActiveSection('channels');
  }

  const renderMainContent = () => {
    if (activeSection === 'profile') return <ProfilePanel accessToken={accessToken} onCurrentUserUpdated={onCurrentUserUpdated} t={t} />;
    if (activeSection === 'calls') return <CallsPanel accessToken={accessToken} call={call} onNewCall={openNewChat} onOpenHistoryChat={openCallHistoryChat} onStartHistoryCall={startCallFromHistory} t={t} />;
    if (activeSection === 'notifications') {
      return <NotificationsPanel error={notificationsError} isLoading={isLoadingNotifications} isUpdating={isUpdatingNotifications} notifications={notifications} onMarkAllRead={markAllNotificationsRead} onOpenNotification={openNotification} onRetry={() => loadNotifications()} t={t} />;
    }
    if (activeSection === 'settings') {
      return <SettingsPanel accessToken={accessToken} currentUser={currentUser} onCurrentUserUpdated={onCurrentUserUpdated} onLogout={onLogout} preferences={preferences} updatePreferences={updatePreferences} t={t} />;
    }
    if (activeSection === 'contacts') {
      return <ContactsPanel accessToken={accessToken} currentUserId={currentUserId} mode={contactMode} onChatCreated={handleChatCreated} t={t} />;
    }

    if (activeSection === 'channels' && !selectedChat) {
      return <ChannelsPanel accessToken={accessToken} channels={chats.filter((chat) => chat.type === 'branch')} onChannelChanged={handleChannelChanged} onOpenChannel={(channelId, channel) => openChat(channelId, channel)} t={t} />;
    }

    if (selectedChat) {
      return <ChatPanel key={selectedChat.id} accessToken={accessToken} chat={selectedChat} currentUserId={currentUserId} focusMessage={messageFocus?.message ?? null} focusMessageId={messageFocus?.id ?? null} focusRequestId={messageFocus?.requestId ?? 0} realtimeEvents={realtimeEvents} realtimeResyncVersion={realtimeResyncVersion} realtimeStatus={realtimeStatus} t={t} onBack={() => setSelectedChatId(null)} onChatChanged={() => loadChats({ showLoading: false })} onChannelLeft={handleChannelLeft} onMessageFocused={handleMessageFocused} onMessageSent={() => loadChats({ showLoading: false })} onRealtimeSend={onRealtimeSend} onStartCall={startCall} canStartCall={selectedChat.type === 'direct' && call.canUseCalls && call.canSignalCall && call.callState === 'idle' && Boolean(selectedChat.peer?.id)} callState={call.callState} />;
    }

    return <WorkspaceEmptyState onNewChat={openNewChat} t={t} />;
  };

  return (
    <WorkspaceShell
      chatList={<WorkspaceChatList activeSection={activeSection} chats={chats} chatsError={chatsError} chatsNotice={chatsNotice} directChatCount={directChatCount} isClearingChats={isClearingChats} isLoadingChats={isLoadingChats} onClearChats={clearAllChats} onNewChat={openNewChat} onOpenChat={openChat} onQueryChange={setQuery} onRefresh={() => loadChats({ showSuccess: true })} onRetry={() => loadChats()} preferences={preferences} query={query} selectedChatId={selectedChatId} t={t} updatePreferences={updatePreferences} />}
      density={preferences.density ?? 'comfortable'}
      isChatOpen={selectedChat && ['chats', 'channels'].includes(activeSection)}
      isStandalonePage={isStandalonePage}
      navigation={<WorkspaceNavigation activeSection={activeSection} onHome={() => { openSection('chats'); setSelectedChatId(null); }} onSelect={openSection} t={t} />}
      overlay={<><CallOverlay call={call} peer={activeCallChat?.peer} t={t} />{callError && call.callState === 'idle' ? <WorkspaceCallError message={callError} onClose={() => setCallError('')} t={t} /> : null}</>}
    >
      {renderMainContent()}
    </WorkspaceShell>
  );
}
