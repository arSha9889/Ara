import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { NetworkConnection } from '../src/features/network/networkClient';

const mockGetNetworkConnection = jest.fn();
const mockNetworkClientIsAvailable = jest.fn();
const mockSubscribeToNetworkConnection = jest.fn();
const mockUnsubscribe = jest.fn();

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
  });

  it('keeps a newer native event when the initial network query resolves later', async () => {
    let resolveInitialConnection: (connection: NetworkConnection) => void = () => undefined;
    const initialConnection = new Promise<NetworkConnection>(resolve => {
      resolveInitialConnection = resolve;
    });
    let nativeListener: ((connection: NetworkConnection) => void) | undefined;

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
});
