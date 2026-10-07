import type { MediaStream } from 'react-native-webrtc';

import type { TranslationKey } from '../../localization/messages';

export type DirectCallType = 'audio' | 'video';

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
  callType: DirectCallType;
  chatId: string;
  connectedAt: number | null;
  failure: CallFailureKey | null;
  isFrontCamera: boolean;
  isCaller: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  localStream: MediaStream | null;
  peerName: string;
  peerUserId: string;
  phase: DirectCallPhase;
  remoteStream: MediaStream | null;
}

export function callPhaseKey(call: Pick<ActiveDirectCall, 'callType' | 'phase'>): TranslationKey {
  const { callType, phase } = call;

  switch (phase) {
    case 'requestingMicrophone':
      return callType === 'video'
        ? 'callRequestingCameraAndMicrophone'
        : 'callRequestingMicrophone';
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
    case 'unsupported_media':
      return 'callUnavailable';
    default:
      return 'callConnectionFailed';
  }
}

export function formatCallDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
