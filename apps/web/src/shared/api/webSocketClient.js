function defaultWebSocketBaseUrl() {
  if (import.meta.env.DEV) return 'ws://localhost:8000';
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
}

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || defaultWebSocketBaseUrl();

export function createRealtimeConnection(token) {
  const url = new URL('/ws', WS_BASE_URL);

  if (token) {
    url.searchParams.set('token', token);
  }

  return new WebSocket(url);
}
