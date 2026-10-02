import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { apiClient } from '../../infrastructure/http/apiClient';
import { getWebSocketUrl } from '../../infrastructure/realtime/realtimeConfig';
import { parseRealtimeEvent, type RealtimeEvent } from '../../infrastructure/realtime/realtimeEvent';

const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 5_000;
const ACCESS_TOKEN_EXPIRED_CLOSE_CODE = 4001;
const SESSION_REVOKED_CLOSE_CODE = 4003;
const SOCKET_OPEN = 1;

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type RealtimeEventListener = (event: RealtimeEvent) => void;
export type RealtimeOutboundEvent = { event: string } & Record<string, unknown>;

interface RealtimeContextValue {
  connectionStatus: RealtimeConnectionStatus;
  send(event: RealtimeOutboundEvent): boolean;
  subscribeToChat(chatId: string): () => void;
  subscribeToEvents(listener: RealtimeEventListener): () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function isForegroundAppState(state: string | null | undefined): boolean {
  return state === 'active' || state === 'unknown';
}

function sendPayload(socket: WebSocket, payload: RealtimeOutboundEvent): boolean {
  if (socket.readyState !== SOCKET_OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function RealtimeProvider({ accessToken, children }: { accessToken: string; children: ReactNode }) {
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const authenticatedSocketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<RealtimeEventListener>());
  const chatSubscriptionCountsRef = useRef(new Map<string, number>());

  const subscribeToEvents = useCallback((listener: RealtimeEventListener): (() => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const send = useCallback((event: RealtimeOutboundEvent): boolean => {
    const socket = socketRef.current;

    if (!socket || authenticatedSocketRef.current !== socket) {
      return false;
    }

    return sendPayload(socket, event);
  }, []);

  const subscribeToChat = useCallback(
    (chatId: string): (() => void) => {
      const normalizedChatId = chatId.trim();
      if (!normalizedChatId) {
        return () => undefined;
      }

      const currentCount = chatSubscriptionCountsRef.current.get(normalizedChatId) ?? 0;
      chatSubscriptionCountsRef.current.set(normalizedChatId, currentCount + 1);

      if (currentCount === 0) {
        send({ event: 'chat.subscribe', chat_id: normalizedChatId });
      }

      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;

        const activeCount = chatSubscriptionCountsRef.current.get(normalizedChatId) ?? 0;
        if (activeCount <= 1) {
          chatSubscriptionCountsRef.current.delete(normalizedChatId);
          send({ event: 'chat.unsubscribe', chat_id: normalizedChatId });
          return;
        }

        chatSubscriptionCountsRef.current.set(normalizedChatId, activeCount - 1);
      };
    },
    [send],
  );

  useEffect(() => {
    let isDisposed = false;
    let shouldConnect = isForegroundAppState(AppState.currentState);
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
    let authenticationRefresh: Promise<void> | null = null;

    function clearHeartbeat(): void {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = null;
      }
    }

    function sendHeartbeat(socket: WebSocket): void {
      if (authenticatedSocketRef.current !== socket || !sendPayload(socket, { event: 'ping' })) {
        return;
      }

      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
      }
      heartbeatTimeout = setTimeout(() => socket.close(4000, 'Heartbeat timeout'), HEARTBEAT_TIMEOUT_MS);
    }

    function startHeartbeat(socket: WebSocket): void {
      clearHeartbeat();
      sendHeartbeat(socket);
      heartbeatTimer = setInterval(() => sendHeartbeat(socket), HEARTBEAT_INTERVAL_MS);
    }

    function notifyListeners(event: RealtimeEvent): void {
      listenersRef.current.forEach(listener => {
        try {
          listener(event);
        } catch {
          // A screen listener must not interrupt delivery to other subscribers.
        }
      });
    }

    function replayChatSubscriptions(socket: WebSocket): void {
      chatSubscriptionCountsRef.current.forEach((_count, chatId) => {
        sendPayload(socket, { event: 'chat.subscribe', chat_id: chatId });
      });
    }

    function clearReconnectTimer(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function closeSocket(): void {
      const socket = socketRef.current;
      if (!socket) {
        return;
      }

      socketRef.current = null;
      if (authenticatedSocketRef.current === socket) {
        authenticatedSocketRef.current = null;
      }
      clearHeartbeat();
      socket.close();
    }

    function scheduleReconnect(): void {
      if (isDisposed || !shouldConnect || reconnectTimer) {
        return;
      }

      reconnectAttempts += 1;
      const delay = Math.min(1_000 * reconnectAttempts, MAX_RECONNECT_DELAY_MS);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function refreshAuthentication(): Promise<void> {
      if (authenticationRefresh) {
        return authenticationRefresh;
      }

      authenticationRefresh = apiClient
        .refreshCurrentSession()
        .catch(() => null)
        .then(refreshedSession => {
          if (!refreshedSession) {
            shouldConnect = false;
            clearReconnectTimer();
          }
        })
        .finally(() => {
          authenticationRefresh = null;
        });
      return authenticationRefresh;
    }

    function connect(): void {
      if (isDisposed || !shouldConnect || socketRef.current) {
        return;
      }

      let socketUrl: string;
      try {
        socketUrl = getWebSocketUrl();
      } catch {
        setConnectionStatus('disconnected');
        return;
      }

      setConnectionStatus('connecting');
      let socket: WebSocket;
      try {
        socket = new WebSocket(socketUrl);
      } catch {
        setConnectionStatus('disconnected');
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          return;
        }
        sendPayload(socket, { event: 'connection.authenticate', token: accessToken });
      };

      socket.onmessage = messageEvent => {
        let rawEvent: unknown;
        try {
          rawEvent = typeof messageEvent.data === 'string' ? JSON.parse(messageEvent.data) : null;
        } catch {
          return;
        }

        const event = parseRealtimeEvent(rawEvent);
        if (!event || socketRef.current !== socket) {
          return;
        }

        if (event.event === 'connection.authenticated') {
          authenticatedSocketRef.current = socket;
          reconnectAttempts = 0;
          setConnectionStatus('connected');
          startHeartbeat(socket);
          replayChatSubscriptions(socket);
        }

        if (event.event === 'connection.rejected') {
          socket.close();
          refreshAuthentication();
          return;
        }

        if (event.event === 'pong' && heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }

        notifyListeners(event);
      };

      socket.onerror = () => {
        if (socketRef.current === socket) {
          setConnectionStatus('disconnected');
        }
      };

      socket.onclose = closeEvent => {
        if (authenticatedSocketRef.current === socket) {
          authenticatedSocketRef.current = null;
        }
        if (socketRef.current === socket) {
          socketRef.current = null;
          clearHeartbeat();
          setConnectionStatus('disconnected');
          if (
            closeEvent.code === ACCESS_TOKEN_EXPIRED_CLOSE_CODE ||
            closeEvent.code === SESSION_REVOKED_CLOSE_CODE ||
            closeEvent.code === 1008
          ) {
            refreshAuthentication();
            return;
          }
          scheduleReconnect();
        }
      };
    }

    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      shouldConnect = isForegroundAppState(nextAppState);
      if (shouldConnect) {
        reconnectAttempts = 0;
        connect();
        return;
      }

      clearReconnectTimer();
      closeSocket();
      setConnectionStatus('disconnected');
    });

    connect();

    return () => {
      isDisposed = true;
      clearReconnectTimer();
      appStateSubscription.remove();
      closeSocket();
    };
  }, [accessToken]);

  const value = useMemo(
    () => ({ connectionStatus, send, subscribeToChat, subscribeToEvents }),
    [connectionStatus, send, subscribeToChat, subscribeToEvents],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);

  if (!context) {
    throw new Error('useRealtime должен использоваться внутри RealtimeProvider.');
  }

  return context;
}

export function useRealtimeConnectionStatus(): RealtimeConnectionStatus | null {
  return useContext(RealtimeContext)?.connectionStatus ?? null;
}
