import { NativeEventEmitter, NativeModules } from 'react-native';

export type NetworkConnectionState =
  | 'checking'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unavailable';
export type NetworkTransport = 'cellular' | 'none' | 'other' | 'wifi';

export interface NetworkConnection {
  state: NetworkConnectionState;
  transport: NetworkTransport;
}

interface NativeNetworkModule {
  addListener(eventName: string): void;
  getNetworkState?(): Promise<unknown>;
  removeListeners(count: number): void;
}

const NETWORK_STATE_EVENT = 'AraChatNetworkState';
const NETWORK_CONNECTION_STATES = new Set<NetworkConnectionState>([
  'checking',
  'connecting',
  'connected',
  'disconnected',
  'unavailable',
]);
const NETWORK_TRANSPORTS = new Set<NetworkTransport>(['cellular', 'none', 'other', 'wifi']);

export const INITIAL_NETWORK_CONNECTION: NetworkConnection = {
  state: 'checking',
  transport: 'none',
};
export const UNAVAILABLE_NETWORK_CONNECTION: NetworkConnection = {
  state: 'unavailable',
  transport: 'none',
};

const nativeNetwork = NativeModules.AraChatNetwork as NativeNetworkModule | undefined;
const nativeNetworkEvents = nativeNetwork ? new NativeEventEmitter(nativeNetwork) : null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseNetworkConnection(value: unknown): NetworkConnection | null {
  if (!isRecord(value)) {
    return null;
  }

  const { state, transport } = value;
  if (
    typeof state !== 'string' ||
    typeof transport !== 'string' ||
    !NETWORK_CONNECTION_STATES.has(state as NetworkConnectionState) ||
    !NETWORK_TRANSPORTS.has(transport as NetworkTransport)
  ) {
    return null;
  }

  return {
    state: state as NetworkConnectionState,
    transport: transport as NetworkTransport,
  };
}

export function networkClientIsAvailable(): boolean {
  return Boolean(nativeNetwork?.getNetworkState);
}

export async function getNetworkConnection(): Promise<NetworkConnection> {
  if (!nativeNetwork?.getNetworkState) {
    return UNAVAILABLE_NETWORK_CONNECTION;
  }

  const connection = parseNetworkConnection(await nativeNetwork.getNetworkState());
  return connection ?? UNAVAILABLE_NETWORK_CONNECTION;
}

export function subscribeToNetworkConnection(listener: (connection: NetworkConnection) => void): () => void {
  if (!nativeNetworkEvents) {
    return () => undefined;
  }

  const subscription = nativeNetworkEvents.addListener(NETWORK_STATE_EVENT, (value: unknown) => {
    const connection = parseNetworkConnection(value);
    if (connection) {
      listener(connection);
    }
  });
  return () => subscription.remove();
}
