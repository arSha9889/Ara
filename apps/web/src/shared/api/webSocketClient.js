const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000';

export function createRealtimeConnection(token) {
  const url = new URL('/ws', WS_BASE_URL);

  if (token) {
    url.searchParams.set('token', token);
  }

  return new WebSocket(url);
}
