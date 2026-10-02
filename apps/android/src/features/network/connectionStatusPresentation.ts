import type { TranslationKey } from '../../localization/messages';
import type { IconName } from '../../ui/Icon';
import type { RealtimeConnectionStatus } from '../realtime/RealtimeProvider';
import type { NetworkConnection, NetworkTransport } from './networkClient';

export type ConnectionStatusTone = 'danger' | 'primary';

export interface ConnectionStatusPresentation {
  icon: IconName;
  key: TranslationKey;
  tone: ConnectionStatusTone;
}

function connectingKeyForTransport(transport: NetworkTransport): TranslationKey {
  switch (transport) {
    case 'cellular':
      return 'networkConnectingMobile';
    case 'wifi':
      return 'networkConnectingWifi';
    default:
      return 'networkConnecting';
  }
}

export function connectionStatusPresentation(
  connection: NetworkConnection,
  realtimeConnectionStatus: RealtimeConnectionStatus | null,
): ConnectionStatusPresentation | null {
  switch (connection.state) {
    case 'checking':
    case 'connecting':
      return {
        icon: 'refresh',
        key: connectingKeyForTransport(connection.transport),
        tone: 'primary',
      };
    case 'disconnected':
      return { icon: 'close', key: 'networkOffline', tone: 'danger' };
    case 'unavailable':
      return null;
    case 'connected':
      if (realtimeConnectionStatus === 'connecting') {
        return { icon: 'refresh', key: 'networkConnectingAraChat', tone: 'primary' };
      }
      if (realtimeConnectionStatus === 'disconnected') {
        return { icon: 'refresh', key: 'networkRestoringAraChat', tone: 'primary' };
      }
      return null;
    default:
      return null;
  }
}
