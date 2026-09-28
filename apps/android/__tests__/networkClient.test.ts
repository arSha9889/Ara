let nativeEventListener: ((value: unknown) => void) | undefined;
const mockRemoveSubscription = jest.fn();

jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: (_eventName: string, listener: (value: unknown) => void) => {
      nativeEventListener = listener;
      return { remove: mockRemoveSubscription };
    },
  })),
  NativeModules: {
    AraChatNetwork: {
      addListener: jest.fn(),
      getNetworkState: jest.fn(),
      removeListeners: jest.fn(),
    },
  },
}));

import { NativeModules } from 'react-native';

import {
  getNetworkConnection,
  parseNetworkConnection,
  subscribeToNetworkConnection,
} from '../src/features/network/networkClient';

const nativeNetwork = NativeModules.AraChatNetwork as {
  getNetworkState: jest.Mock;
};

beforeEach(() => {
  nativeEventListener = undefined;
  jest.clearAllMocks();
});

test('accepts only known native connection states and transports', () => {
  expect(parseNetworkConnection({ state: 'connected', transport: 'cellular' })).toEqual({
    state: 'connected',
    transport: 'cellular',
  });
  expect(parseNetworkConnection({ state: 'connecting', transport: 'wifi' })).toEqual({
    state: 'connecting',
    transport: 'wifi',
  });
  expect(parseNetworkConnection({ state: 'online', transport: '5g' })).toBeNull();
});

test('reads the validated network state from the Android bridge', async () => {
  nativeNetwork.getNetworkState.mockResolvedValue({ state: 'connected', transport: 'wifi' });

  await expect(getNetworkConnection()).resolves.toEqual({
    state: 'connected',
    transport: 'wifi',
  });
});

test('forwards only valid native network updates to subscribers', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeToNetworkConnection(listener);

  nativeEventListener?.({ state: 'connecting', transport: 'cellular' });
  nativeEventListener?.({ state: 'not-a-state', transport: 'wifi' });

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith({ state: 'connecting', transport: 'cellular' });

  unsubscribe();
  expect(mockRemoveSubscription).toHaveBeenCalledTimes(1);
});
