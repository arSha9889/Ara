import {
  isCallActive,
  setCallLifecycle,
  shouldKeepRealtimeConnection,
  subscribeToCallLifecycle,
} from '../src/features/calls/callLifecycle';

afterEach(() => {
  setCallLifecycle(null);
});

test('keeps realtime connected in the background only while a call is active', () => {
  expect(shouldKeepRealtimeConnection('background')).toBe(false);

  setCallLifecycle({ phase: 'connecting' });

  expect(isCallActive()).toBe(true);
  expect(shouldKeepRealtimeConnection('background')).toBe(true);
  expect(shouldKeepRealtimeConnection('inactive')).toBe(true);
});

test('notifies listeners only when the call activity state changes', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeToCallLifecycle(listener);

  setCallLifecycle({ phase: 'outgoing' });
  setCallLifecycle({ phase: 'active' });
  setCallLifecycle({ phase: 'failed' });
  unsubscribe();

  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenNthCalledWith(1, true);
  expect(listener).toHaveBeenNthCalledWith(2, false);
});
