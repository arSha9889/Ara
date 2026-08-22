import { useContext } from 'react';

import { SessionContext } from './SessionProvider';

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession должен использоваться внутри SessionProvider.');
  }

  return context;
}
