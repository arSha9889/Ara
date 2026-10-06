import { API_BASE_URL } from '../../shared/api/apiClient.js';

const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

function websocketUrl() {
  if (!API_BASE_URL) return null;

  try {
    const url = new URL(API_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function createRealtimeConnection(accessToken, { onEvent, onStatus } = {}) {
  let socket = null;
  let reconnectAttempts = 0;
  let reconnectTimerId = null;
  let heartbeatIntervalId = null;
  let heartbeatTimeoutId = null;
  let isDisposed = false;
  let authenticationRejected = false;

  function setStatus(status) {
    if (!isDisposed) onStatus?.(status);
  }

  function stopHeartbeat() {
    window.clearInterval(heartbeatIntervalId);
    window.clearTimeout(heartbeatTimeoutId);
    heartbeatIntervalId = null;
    heartbeatTimeoutId = null;
  }

  function send(payload) {
    if (socket?.readyState !== WebSocket.OPEN) return false;

    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function sendHeartbeat() {
    if (!send({ event: 'ping' })) return;
    window.clearTimeout(heartbeatTimeoutId);
    heartbeatTimeoutId = window.setTimeout(() => {
      socket?.close(4000, 'Heartbeat timeout');
    }, HEARTBEAT_TIMEOUT_MS);
  }

  function startHeartbeat() {
    if (heartbeatIntervalId !== null) return;
    sendHeartbeat();
    heartbeatIntervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  function scheduleReconnect() {
    if (isDisposed || authenticationRejected || reconnectTimerId !== null) return;
    reconnectAttempts += 1;
    const delay = Math.min(1_000 * (2 ** (reconnectAttempts - 1)), MAX_RECONNECT_DELAY_MS);
    setStatus('reconnecting');
    reconnectTimerId = window.setTimeout(() => {
      reconnectTimerId = null;
      connect();
    }, delay);
  }

  function handleMessage(event) {
    if (isDisposed) return;

    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!payload || typeof payload !== 'object') return;

    if (payload.event === 'connection.authenticated') {
      reconnectAttempts = 0;
      setStatus('connected');
      startHeartbeat();
      return;
    }

    if (payload.event === 'connection.rejected') {
      authenticationRejected = true;
      setStatus('disconnected');
      socket?.close();
      return;
    }

    if (payload.event === 'pong') {
      window.clearTimeout(heartbeatTimeoutId);
      heartbeatTimeoutId = null;
      return;
    }

    onEvent?.(payload);
  }

  function connect() {
    const url = websocketUrl();
    if (!url) {
      setStatus('disconnected');
      return;
    }

    setStatus(reconnectAttempts ? 'reconnecting' : 'connecting');
    authenticationRejected = false;

    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      if (isDisposed) return;
      send({ event: 'connection.authenticate', token: accessToken });
    });
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', () => {
      stopHeartbeat();
      if (isDisposed) return;
      if (authenticationRejected) {
        setStatus('disconnected');
        return;
      }
      scheduleReconnect();
    });
  }

  connect();

  return {
    send,
    close() {
      isDisposed = true;
      window.clearTimeout(reconnectTimerId);
      reconnectTimerId = null;
      stopHeartbeat();
      socket?.close();
      socket = null;
    },
  };
}
