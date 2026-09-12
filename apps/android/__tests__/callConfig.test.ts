import { getRtcConfiguration } from '../src/features/calls/callConfig';
import {
  callFailureKeyForReason,
  formatCallDuration,
} from '../src/features/calls/callPresentation';

test('builds relay-only RTC configuration from valid TURN servers', () => {
  expect(
    getRtcConfiguration([
      {
        credential: 'temporary-password',
        urls: [
          'turn:turn.example.test:3478?transport=udp',
          'turn:turn.example.test:3478?transport=tcp',
        ],
        username: '123:user-id',
      },
      { urls: [] },
    ]),
  ).toEqual({
    iceServers: [
      {
        credential: 'temporary-password',
        urls: [
          'turn:turn.example.test:3478?transport=udp',
          'turn:turn.example.test:3478?transport=tcp',
        ],
        username: '123:user-id',
      },
    ],
    iceTransportPolicy: 'relay',
  });
});

test('keeps call presentation deterministic for failure and duration states', () => {
  expect(callFailureKeyForReason('peer_busy')).toBe('callPeerBusy');
  expect(callFailureKeyForReason('peer_offline')).toBe('callPeerOffline');
  expect(callFailureKeyForReason('unknown')).toBe('callConnectionFailed');
  expect(formatCallDuration(65)).toBe('01:05');
});
