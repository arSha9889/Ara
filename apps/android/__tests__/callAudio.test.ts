import {
  parseCallAudioEvent,
  parseCallAudioSession,
} from '../src/features/calls/callAudio';

test('parses only supported call audio routes and a selected route', () => {
  expect(parseCallAudioSession({
    routes: [
      { id: '7', kind: 'earpiece' },
      { id: '8', kind: 'speaker' },
      { id: '9', kind: 'unknown' },
      { id: 10, kind: 'bluetooth' },
    ],
    selectedRouteId: '7',
  })).toEqual({
    routes: [
      { id: '7', kind: 'earpiece' },
      { id: '8', kind: 'speaker' },
    ],
    selectedRouteId: '7',
  });
});

test('keeps unsupported native audio payloads inert', () => {
  expect(parseCallAudioSession({ routes: 'not-an-array' })).toEqual({
    routes: [],
    selectedRouteId: null,
  });
  expect(parseCallAudioEvent({ type: 'focusLost' })).toBe('focusLost');
  expect(parseCallAudioEvent({ type: 'routesChanged' })).toBe('routesChanged');
  expect(parseCallAudioEvent({ type: 'other' })).toBeNull();
});
