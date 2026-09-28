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
    const unsubscribe = subscribeToNetworkConnection(nextConnection => {
      receivedNativeEvent = true;
      if (active) {
        setConnection(nextConnection);
      }
    });

    getNetworkConnection()
      .then(nextConnection => {
        if (active && !receivedNativeEvent) {
          setConnection(nextConnection);
        }
      })
      .catch(() => {
        if (active && !receivedNativeEvent) {
          setConnection(UNAVAILABLE_NETWORK_CONNECTION);
        }
      });

    return () => {
      active = false;
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
