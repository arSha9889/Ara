import { toWebSocketUrl } from '../src/infrastructure/realtime/realtimeConfig';

test('derives the secure websocket endpoint from the HTTPS API address', () => {
  expect(toWebSocketUrl('https://api.arachat.example/v1')).toBe('wss://api.arachat.example/ws');
});
