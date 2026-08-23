import { getRuntimeConfigValue } from '../config/runtimeConfig.js';

function defaultWebSocketBaseUrl() {
  if (import.meta.env.DEV) return 'ws://localhost:8000';
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
}

const WS_BASE_URL = getRuntimeConfigValue('VITE_WS_BASE_URL')
  || import.meta.env.VITE_WS_BASE_URL
  || defaultWebSocketBaseUrl();

const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

export function createRealtimeConnection(token) {
  const url = new URL('/ws', WS_BASE_URL);
  const socket = new WebSocket(url);
  let heartbeatIntervalId = null;
  let heartbeatTimeoutId = null;

  function stopHeartbeat() {
    window.clearInterval(heartbeatIntervalId);
    window.clearTimeout(heartbeatTimeoutId);
    heartbeatIntervalId = null;
    heartbeatTimeoutId = null;
  }

  function startHeartbeat() {
    if (heartbeatIntervalId !== null) return;

    sendHeartbeat();
    heartbeatIntervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  function sendHeartbeat() {
    if (socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({ event: 'ping' }));
    window.clearTimeout(heartbeatTimeoutId);
    heartbeatTimeoutId = window.setTimeout(() => {
      socket.close(4000, 'Heartbeat timeout');
    }, HEARTBEAT_TIMEOUT_MS);
  }

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ event: 'connection.authenticate', token }));
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload?.event === 'connection.authenticated') {
        startHeartbeat();
      }
      if (payload?.event === 'pong') {
        window.clearTimeout(heartbeatTimeoutId);
        heartbeatTimeoutId = null;
      }
    } catch {
      // Event consumers handle their own payload validation.
    }
  });

  socket.addEventListener('close', stopHeartbeat);

  return socket;
}
