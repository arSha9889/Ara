import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { NetworkConnection } from '../src/features/network/networkClient';

const mockGetNetworkConnection = jest.fn();
const mockNetworkClientIsAvailable = jest.fn();
const mockSubscribeToNetworkConnection = jest.fn();
const mockUnsubscribe = jest.fn();
let nativeListener: ((connection: NetworkConnection) => void) | undefined;

jest.mock('../src/features/network/networkClient', () => ({
  INITIAL_NETWORK_CONNECTION: { state: 'checking', transport: 'none' },
  UNAVAILABLE_NETWORK_CONNECTION: { state: 'unavailable', transport: 'none' },
  getNetworkConnection: () => mockGetNetworkConnection(),
  networkClientIsAvailable: () => mockNetworkClientIsAvailable(),
  subscribeToNetworkConnection: (listener: (connection: NetworkConnection) => void) =>
    mockSubscribeToNetworkConnection(listener),
}));

import { NetworkProvider, useNetwork } from '../src/features/network/NetworkProvider';

function NetworkConnectionProbe() {
  const { connection } = useNetwork();

  return <Text testID="network-connection">{connection.state}:{connection.transport}</Text>;
}

function connectionProbeText(component: ReturnType<typeof create>): string {
  return component.root.findByProps({ testID: 'network-connection' }).props.children.join('');
}

describe('NetworkProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetworkClientIsAvailable.mockReturnValue(true);
    nativeListener = undefined;
  });

  it('keeps a newer native event when the initial network query resolves later', async () => {
    let resolveInitialConnection: (connection: NetworkConnection) => void = () => undefined;
    const initialConnection = new Promise<NetworkConnection>(resolve => {
      resolveInitialConnection = resolve;
    });

    mockGetNetworkConnection.mockReturnValue(initialConnection);
    mockSubscribeToNetworkConnection.mockImplementation((listener: (connection: NetworkConnection) => void) => {
      nativeListener = listener;
      return mockUnsubscribe;
    });

    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <NetworkProvider>
          <NetworkConnectionProbe />
        </NetworkProvider>,
      );
    });

    expect(connectionProbeText(component)).toBe('checking:none');

    act(() => {
      nativeListener?.({ state: 'connected', transport: 'wifi' });
    });

    await act(async () => {
      resolveInitialConnection({ state: 'connecting', transport: 'cellular' });
      await Promise.resolve();
    });

    expect(connectionProbeText(component)).toBe('connected:wifi');

    act(() => component.unmount());
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('confirms a disconnected native event before showing offline after a network handover', async () => {
    jest.useFakeTimers();
    mockGetNetworkConnection
      .mockResolvedValueOnce({ state: 'connected', transport: 'wifi' })
      .mockResolvedValueOnce({ state: 'connected', transport: 'wifi' });
    mockSubscribeToNetworkConnection.mockImplementation((listener: (connection: NetworkConnection) => void) => {
      nativeListener = listener;
      return mockUnsubscribe;
    });

    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <NetworkProvider>
          <NetworkConnectionProbe />
        </NetworkProvider>,
      );
      await Promise.resolve();
    });

    expect(connectionProbeText(component)).toBe('connected:wifi');

    act(() => {
      nativeListener?.({ state: 'disconnected', transport: 'none' });
    });
    expect(connectionProbeText(component)).toBe('connecting:wifi');

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    expect(connectionProbeText(component)).toBe('connected:wifi');

    act(() => component.unmount());
    jest.useRealTimers();
  });

  it('shows offline when the delayed network check confirms a real disconnection', async () => {
    jest.useFakeTimers();
    mockGetNetworkConnection
      .mockResolvedValueOnce({ state: 'connected', transport: 'cellular' })
      .mockResolvedValueOnce({ state: 'disconnected', transport: 'none' });
    mockSubscribeToNetworkConnection.mockImplementation((listener: (connection: NetworkConnection) => void) => {
      nativeListener = listener;
      return mockUnsubscribe;
    });

    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <NetworkProvider>
          <NetworkConnectionProbe />
        </NetworkProvider>,
      );
      await Promise.resolve();
    });

    act(() => {
      nativeListener?.({ state: 'disconnected', transport: 'none' });
    });
    expect(connectionProbeText(component)).toBe('connecting:cellular');

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    expect(connectionProbeText(component)).toBe('disconnected:none');

    act(() => component.unmount());
    jest.useRealTimers();
  });

  it('keeps a newer native connection event when the delayed check resolves late', async () => {
    jest.useFakeTimers();
    let resolveConfirmation: (connection: NetworkConnection) => void = () => undefined;
    const confirmation = new Promise<NetworkConnection>(resolve => {
      resolveConfirmation = resolve;
    });
    mockGetNetworkConnection
      .mockResolvedValueOnce({ state: 'connected', transport: 'wifi' })
      .mockReturnValueOnce(confirmation);
    mockSubscribeToNetworkConnection.mockImplementation((listener: (connection: NetworkConnection) => void) => {
      nativeListener = listener;
      return mockUnsubscribe;
    });

    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <NetworkProvider>
          <NetworkConnectionProbe />
        </NetworkProvider>,
      );
      await Promise.resolve();
    });

    act(() => {
      nativeListener?.({ state: 'disconnected', transport: 'none' });
      jest.advanceTimersByTime(1_500);
      nativeListener?.({ state: 'connected', transport: 'cellular' });
    });
    expect(connectionProbeText(component)).toBe('connected:cellular');

    await act(async () => {
      resolveConfirmation({ state: 'disconnected', transport: 'none' });
      await Promise.resolve();
    });
    expect(connectionProbeText(component)).toBe('connected:cellular');

    act(() => component.unmount());
    jest.useRealTimers();
  });
});
