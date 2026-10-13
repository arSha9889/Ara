import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  getNetworkConnection,
  INITIAL_NETWORK_CONNECTION,
  networkClientIsAvailable,
  subscribeToNetworkConnection,
  UNAVAILABLE_NETWORK_CONNECTION,
  type NetworkConnection,
} from './networkClient';

const DISCONNECTION_CONFIRMATION_MS = 1_500;

interface NetworkContextValue {
  connection: NetworkConnection;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<NetworkConnection>(() =>
    networkClientIsAvailable() ? INITIAL_NETWORK_CONNECTION : UNAVAILABLE_NETWORK_CONNECTION,
  );

  useEffect(() => {
    if (!networkClientIsAvailable()) {
      return;
    }

    let active = true;
    let receivedNativeEvent = false;
    let disconnectionTimer: ReturnType<typeof setTimeout> | null = null;
    let connectionUpdateVersion = 0;

    function clearDisconnectionTimer(): void {
      if (disconnectionTimer) {
        clearTimeout(disconnectionTimer);
        disconnectionTimer = null;
      }
    }

    function setNextConnection(nextConnection: NetworkConnection): void {
      if (!active) {
        return;
      }
      const updateVersion = ++connectionUpdateVersion;

      if (nextConnection.state !== 'disconnected') {
        clearDisconnectionTimer();
        setConnection(nextConnection);
        return;
      }

      setConnection(currentConnection => ({
        state: 'connecting',
        transport:
          nextConnection.transport !== 'none'
            ? nextConnection.transport
            : currentConnection.transport !== 'none'
              ? currentConnection.transport
              : 'other',
      }));
      clearDisconnectionTimer();
      disconnectionTimer = setTimeout(() => {
        disconnectionTimer = null;
        getNetworkConnection()
          .then(confirmedConnection => {
            if (!active || connectionUpdateVersion !== updateVersion) {
              return;
            }
            setConnection(confirmedConnection);
          })
          .catch(() => {
            if (active && connectionUpdateVersion === updateVersion) {
              setConnection(UNAVAILABLE_NETWORK_CONNECTION);
            }
          });
      }, DISCONNECTION_CONFIRMATION_MS);
    }

    const unsubscribe = subscribeToNetworkConnection(nextConnection => {
      receivedNativeEvent = true;
      setNextConnection(nextConnection);
    });

    getNetworkConnection()
      .then(nextConnection => {
        if (active && !receivedNativeEvent) {
          setNextConnection(nextConnection);
        }
      })
      .catch(() => {
        if (active && !receivedNativeEvent) {
          setConnection(UNAVAILABLE_NETWORK_CONNECTION);
        }
      });

    return () => {
      active = false;
      clearDisconnectionTimer();
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ connection }), [connection]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);

  if (!context) {
    throw new Error('useNetwork должен использоваться внутри NetworkProvider.');
  }

  return context;
}
