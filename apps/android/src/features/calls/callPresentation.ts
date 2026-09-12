import type { TranslationKey } from '../../localization/messages';

export type DirectCallPhase =
  | 'requestingMicrophone'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active'
  | 'failed';

export type CallFailureKey =
  | 'callUnavailable'
  | 'callPermissionDenied'
  | 'callPeerOffline'
  | 'callPeerBusy'
  | 'callRejected'
  | 'callNoAnswer'
  | 'callConnectionFailed'
  | 'callCancelled';

export interface ActiveDirectCall {
  callId: string;
  chatId: string;
  connectedAt: number | null;
  failure: CallFailureKey | null;
  isCaller: boolean;
  isMuted: boolean;
  peerName: string;
  peerUserId: string;
  phase: DirectCallPhase;
}

export function callPhaseKey(phase: DirectCallPhase): TranslationKey {
  switch (phase) {
    case 'requestingMicrophone':
      return 'callRequestingMicrophone';
    case 'outgoing':
      return 'callCalling';
    case 'incoming':
      return 'callIncoming';
    case 'connecting':
      return 'callConnecting';
    case 'active':
      return 'callConnected';
    case 'failed':
      return 'callUnavailable';
  }
}

export function callFailureKeyForReason(reason: string | undefined): CallFailureKey {
  switch (reason) {
    case 'peer_offline':
      return 'callPeerOffline';
    case 'peer_busy':
    case 'caller_busy':
    case 'busy':
      return 'callPeerBusy';
    case 'media_failed':
      return 'callPermissionDenied';
    default:
      return 'callConnectionFailed';
  }
}

export function formatCallDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
