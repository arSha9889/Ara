import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createRealtimeConnection } from '../../shared/api/webSocketClient.js';
import {
  deletePushSubscription,
  getNotifications,
  getPushConfig,
  markNotificationsRead,
  savePushSubscription,
  sendTestPushNotification,
} from '../../features/notifications/api/notificationApi.js';
import { ensurePushSubscription, getPushSupportState, getPushSubscription, isPushSupported, subscribeToPush } from '../../features/notifications/notificationClient.js';
import { playNotificationSound, primeNotificationSound } from '../../features/notifications/notificationSound.js';
import { useSession } from './SessionProvider.jsx';

const NotificationsContext = createContext(null);
const DEVICE_PUSH_ENABLED_KEY = 'nexus_push_enabled_device';

function sortNotifications(items) {
  return [...items].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

export function NotificationsProvider({ children }) {
  const { session } = useSession();
  const [notifications, setNotifications] = useState([]);
  const [pushConfig, setPushConfig] = useState({ enabled: false, public_key: null });
  const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const reconnectTimerRef = useRef(null);
  const knownNotificationIdsRef = useRef(new Set());

  const pushSupport = getPushSupportState();
  const isSupported = isPushSupported();
  const isEnabled = isSupported && permission === 'granted' && pushConfig.enabled && hasSubscription;
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  useEffect(() => {
    function handleFirstInteraction() {
      primeNotificationSound();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    }

    window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    if (!session.accessToken) {
      setNotifications([]);
      knownNotificationIdsRef.current = new Set();
      setPushConfig({ enabled: false, public_key: null });
      setHasSubscription(false);
      return undefined;
    }
    let active = true;
    let socket = null;
    let reconnectAttempts = 0;

    async function load() {
      setIsLoading(true);
      try {
        const [config, items] = await Promise.all([
          getPushConfig(session.accessToken),
          getNotifications(session.accessToken),
        ]);
        if (!active) return;
        setPushConfig(config);
        knownNotificationIdsRef.current = new Set(items.map((item) => item.id));
        setNotifications(sortNotifications(items));
        setPermission('Notification' in window ? Notification.permission : 'unsupported');
        const existingSubscription = await getPushSubscription();
        const devicePushEnabled = localStorage.getItem(DEVICE_PUSH_ENABLED_KEY) === 'true' || Boolean(existingSubscription);
        if (config.enabled && config.public_key && Notification.permission === 'granted' && devicePushEnabled) {
          const subscription = await ensurePushSubscription(config.public_key);
          await savePushSubscription(session.accessToken, subscription.toJSON());
          localStorage.setItem(DEVICE_PUSH_ENABLED_KEY, 'true');
          setHasSubscription(true);
          return;
        }
        setHasSubscription(Boolean(existingSubscription));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    function connect() {
      socket = createRealtimeConnection(session.accessToken);
      socket.addEventListener('message', (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload.event === 'notification.created' && payload.notification) {
          const isNewNotification = !knownNotificationIdsRef.current.has(payload.notification.id);
          knownNotificationIdsRef.current.add(payload.notification.id);
          setNotifications((current) => sortNotifications([
            payload.notification,
            ...current.filter((item) => item.id !== payload.notification.id),
          ]));
          if (isNewNotification) playNotificationSound();
        }
      });
      socket.addEventListener('close', () => {
        if (!active) return;
        reconnectAttempts += 1;
        reconnectTimerRef.current = window.setTimeout(connect, Math.min(1000 * reconnectAttempts, 5000));
      });
      socket.addEventListener('open', () => { reconnectAttempts = 0; });
    }

    load().catch(() => setIsLoading(false));
    connect();
    return () => {
      active = false;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      socket?.close();
    };
  }, [session.accessToken]);

  async function enableNotifications() {
    if (!isSupported) return { status: pushSupport.reason || 'unsupported' };
    if (!session.accessToken) return { status: 'unauthorized' };
    const nextPermission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== 'granted') return { status: nextPermission };
    await primeNotificationSound();

    const config = await getPushConfig(session.accessToken);
    setPushConfig(config);
    if (!config.enabled || !config.public_key) return { status: 'unconfigured' };

    try {
      const subscription = await subscribeToPush(config.public_key);
      await savePushSubscription(session.accessToken, subscription.toJSON());
      setHasSubscription(true);
      localStorage.setItem(DEVICE_PUSH_ENABLED_KEY, 'true');
      localStorage.setItem('nexus_notifications_prompt_dismissed', 'true');
      try {
        await sendTestPushNotification(session.accessToken);
      } catch {
        return { status: 'delivery_failed' };
      }
      return { status: 'granted' };
    } catch {
      setHasSubscription(false);
      return { status: 'subscription_failed' };
    }
  }

  async function disableNotifications() {
    const subscription = await getPushSubscription();
    if (subscription) {
      await deletePushSubscription(session.accessToken, subscription.endpoint);
      await subscription.unsubscribe();
    }
    localStorage.setItem(DEVICE_PUSH_ENABLED_KEY, 'false');
    setHasSubscription(false);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id);
    if (!unreadIds.length) return;
    await markNotificationsRead(session.accessToken, unreadIds);
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })));
  }

  async function markNotificationRead(notificationId) {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.read_at) return;
    await markNotificationsRead(session.accessToken, [notificationId]);
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, read_at: readAt } : item
    )));
  }

  function markMessageNotificationsRead(chatId, messageIds) {
    const messageIdSet = new Set(messageIds);
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      item.chat_id === chatId && messageIdSet.has(item.message_id) && !item.read_at
        ? { ...item, read_at: readAt }
        : item
    )));
  }

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    isLoading,
    isSupported,
    isEnabled,
    permission,
    pushConfigured: pushConfig.enabled,
    enableNotifications,
    disableNotifications,
    markAllRead,
    markNotificationRead,
    markMessageNotificationsRead,
  }), [notifications, unreadCount, isLoading, isSupported, isEnabled, permission, pushConfig.enabled]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
}
