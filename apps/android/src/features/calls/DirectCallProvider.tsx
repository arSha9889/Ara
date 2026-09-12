import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc';

import type {
  CallIceCandidate,
  RealtimeEvent,
} from '../../infrastructure/realtime/realtimeEvent';
import { getChat } from '../chats/api/chatApi';
import { useRealtime } from '../realtime/RealtimeProvider';
import { getCallIceConfiguration } from './api/callApi';
import { getRtcConfiguration } from './callConfig';
import {
  callFailureKeyForReason,
  type ActiveDirectCall,
  type CallFailureKey,
} from './callPresentation';

const CALL_RING_TIMEOUT_MS = 70_000;

interface StartDirectCallInput {
  chatId: string;
  peerName: string;
  peerUserId: string;
}

interface DirectCallContextValue {
  acceptCall(): Promise<void>;
  call: ActiveDirectCall | null;
  dismissCall(): void;
  endCall(): void;
  rejectCall(): void;
  startCall(input: StartDirectCallInput): Promise<void>;
  toggleMute(): void;
}

class CallWorkflowError extends Error {
  constructor(readonly failureKey: CallFailureKey) {
    super(failureKey);
  }
}

const DirectCallContext = createContext<DirectCallContextValue | null>(null);

function createCallId(chatId: string): string {
  return `call-${chatId}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(track => track.stop());
}

function isCallEvent(event: RealtimeEvent): boolean {
  return event.event.startsWith('call.');
}

function isForegroundAppState(state: string | null | undefined): boolean {
  return state === 'active' || state === 'unknown';
}

function isCurrentCall(call: ActiveDirectCall | null, callId: string): call is ActiveDirectCall {
  return Boolean(call && call.callId === callId);
}

function signalForEndingCall(call: ActiveDirectCall): 'call.cancel' | 'call.end' | 'call.reject' {
  if (call.isCaller && (call.phase === 'outgoing' || call.phase === 'requestingMicrophone')) {
    return 'call.cancel';
  }

  if (!call.isCaller && call.phase === 'requestingMicrophone') {
    return 'call.reject';
  }

  return 'call.end';
}

function failureKeyFromError(error: unknown, fallback: CallFailureKey): CallFailureKey {
  return error instanceof CallWorkflowError ? error.failureKey : fallback;
}

export function DirectCallProvider({ children }: { children: ReactNode }) {
  const { send, subscribeToEvents } = useRealtime();
  const [call, setCallState] = useState<ActiveDirectCall | null>(null);
  const callRef = useRef<ActiveDirectCall | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCall = useCallback((nextCall: ActiveDirectCall | null): void => {
    callRef.current = nextCall;
    setCallState(nextCall);
  }, []);

  const updateCall = useCallback((update: Partial<ActiveDirectCall>): void => {
    const current = callRef.current;
    if (current) {
      setCall({ ...current, ...update });
    }
  }, [setCall]);

  const clearRingTimeout = useCallback((): void => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const releaseResources = useCallback((): void => {
    clearRingTimeout();
    pendingIceCandidatesRef.current = [];

    const connection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (connection && connection.connectionState !== 'closed') {
      connection.close();
    }

    const stream = localStreamRef.current;
    localStreamRef.current = null;
    stopStream(stream);
  }, [clearRingTimeout]);

  const resetCall = useCallback((): void => {
    releaseResources();
    setCall(null);
  }, [releaseResources, setCall]);

  const finishWithFailure = useCallback((failure: CallFailureKey): void => {
    const current = callRef.current;
    releaseResources();
    if (current) {
      setCall({ ...current, connectedAt: null, failure, phase: 'failed' });
    }
  }, [releaseResources, setCall]);

  const sendCallSignal = useCallback(
    (
      event: string,
      callId: string,
      chatId: string,
      payload: Record<string, unknown> = {},
    ): boolean => send({ event, call_id: callId, chat_id: chatId, ...payload }),
    [send],
  );

  const prepareLocalAudio = useCallback(async (callId: string): Promise<MediaStream> => {
    const current = callRef.current;
    if (!isCurrentCall(current, callId)) {
      throw new CallWorkflowError('callCancelled');
    }

    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new CallWorkflowError('callPermissionDenied');
      }
    }

    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      throw new CallWorkflowError('callPermissionDenied');
    }

    const activeCall = callRef.current;
    if (!isCurrentCall(activeCall, callId)) {
      stopStream(stream);
      throw new CallWorkflowError('callCancelled');
    }

    stream.getAudioTracks().forEach(track => {
      track.enabled = !activeCall.isMuted;
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const flushIceCandidates = useCallback(async (): Promise<void> => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) {
      return;
    }

    const candidates = pendingIceCandidatesRef.current.splice(0);
    await Promise.all(
      candidates.map(candidate => connection.addIceCandidate(candidate).catch(() => undefined)),
    );
  }, []);

  const ensurePeerConnection = useCallback(async (callId: string): Promise<RTCPeerConnection> => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    if (!isCurrentCall(callRef.current, callId)) {
      throw new CallWorkflowError('callCancelled');
    }

    let iceConfiguration;
    try {
      iceConfiguration = await getCallIceConfiguration();
    } catch {
      throw new CallWorkflowError('callUnavailable');
    }

    if (!isCurrentCall(callRef.current, callId)) {
      throw new CallWorkflowError('callCancelled');
    }
    if (iceConfiguration.ice_servers.length === 0) {
      throw new CallWorkflowError('callUnavailable');
    }

    const connection = new RTCPeerConnection(getRtcConfiguration(iceConfiguration.ice_servers));
    connection.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      const activeCall = callRef.current;
      const candidate = event.candidate;
      if (!candidate || !isCurrentCall(activeCall, callId)) {
        return;
      }

      const signalCandidate: CallIceCandidate = { candidate: candidate.candidate };
      if (typeof candidate.sdpMid === 'string') {
        signalCandidate.sdpMid = candidate.sdpMid;
      }
      if (typeof candidate.sdpMLineIndex === 'number') {
        signalCandidate.sdpMLineIndex = candidate.sdpMLineIndex;
      }
      sendCallSignal('call.ice_candidate', callId, activeCall.chatId, {
        candidate: signalCandidate,
      });
    };
    connection.onconnectionstatechange = () => {
      const activeCall = callRef.current;
      if (!isCurrentCall(activeCall, callId)) {
        return;
      }
      if (connection.connectionState === 'connected') {
        updateCall({ connectedAt: Date.now(), failure: null, phase: 'active' });
      }
      if (connection.connectionState === 'failed') {
        sendCallSignal('call.end', callId, activeCall.chatId);
        finishWithFailure('callConnectionFailed');
      }
    };

    const stream = await prepareLocalAudio(callId);
    if (!isCurrentCall(callRef.current, callId)) {
      connection.close();
      throw new CallWorkflowError('callCancelled');
    }
    stream.getTracks().forEach(track => connection.addTrack(track, stream));
    peerConnectionRef.current = connection;
    return connection;
  }, [finishWithFailure, prepareLocalAudio, sendCallSignal, updateCall]);

  const startRingTimeout = useCallback((callId: string, isCaller: boolean): void => {
    clearRingTimeout();
    ringTimeoutRef.current = setTimeout(() => {
      const activeCall = callRef.current;
      if (!isCurrentCall(activeCall, callId)) {
        return;
      }
      sendCallSignal(
        isCaller ? 'call.cancel' : 'call.reject',
        callId,
        activeCall.chatId,
      );
      finishWithFailure(isCaller ? 'callNoAnswer' : 'callCancelled');
    }, CALL_RING_TIMEOUT_MS);
  }, [clearRingTimeout, finishWithFailure, sendCallSignal]);

  const startCall = useCallback(async ({ chatId, peerName, peerUserId }: StartDirectCallInput): Promise<void> => {
    if (!chatId || !peerUserId || callRef.current) {
      return;
    }

    const callId = createCallId(chatId);
    setCall({
      callId,
      chatId,
      connectedAt: null,
      failure: null,
      isCaller: true,
      isMuted: false,
      peerName,
      peerUserId,
      phase: 'requestingMicrophone',
    });

    try {
      await prepareLocalAudio(callId);
      await ensurePeerConnection(callId);
      const activeCall = callRef.current;
      if (!isCurrentCall(activeCall, callId)) {
        return;
      }
      if (!sendCallSignal('call.invite', callId, chatId)) {
        throw new CallWorkflowError('callConnectionFailed');
      }
      updateCall({ phase: 'outgoing' });
      startRingTimeout(callId, true);
    } catch (error) {
      if (isCurrentCall(callRef.current, callId)) {
        finishWithFailure(failureKeyFromError(error, 'callConnectionFailed'));
      }
    }
  }, [ensurePeerConnection, finishWithFailure, prepareLocalAudio, sendCallSignal, setCall, startRingTimeout, updateCall]);

  const rejectCall = useCallback((): void => {
    const activeCall = callRef.current;
    if (!activeCall || activeCall.phase !== 'incoming') {
      return;
    }
    sendCallSignal('call.reject', activeCall.callId, activeCall.chatId);
    resetCall();
  }, [resetCall, sendCallSignal]);

  const acceptCall = useCallback(async (): Promise<void> => {
    const incomingCall = callRef.current;
    if (!incomingCall || incomingCall.phase !== 'incoming') {
      return;
    }

    const { callId } = incomingCall;
    updateCall({ phase: 'requestingMicrophone' });
    try {
      await prepareLocalAudio(callId);
      await ensurePeerConnection(callId);
      const activeCall = callRef.current;
      if (!isCurrentCall(activeCall, callId)) {
        return;
      }
      if (!sendCallSignal('call.accept', callId, activeCall.chatId)) {
        throw new CallWorkflowError('callConnectionFailed');
      }
      clearRingTimeout();
      updateCall({ phase: 'connecting' });
    } catch (error) {
      const activeCall = callRef.current;
      if (isCurrentCall(activeCall, callId)) {
        sendCallSignal('call.reject', callId, activeCall.chatId, { reason: 'media_failed' });
        finishWithFailure(failureKeyFromError(error, 'callConnectionFailed'));
      }
    }
  }, [clearRingTimeout, ensurePeerConnection, finishWithFailure, prepareLocalAudio, sendCallSignal, updateCall]);

  const endCall = useCallback((): void => {
    const activeCall = callRef.current;
    if (!activeCall || activeCall.phase === 'failed') {
      return;
    }
    sendCallSignal(signalForEndingCall(activeCall), activeCall.callId, activeCall.chatId);
    resetCall();
  }, [resetCall, sendCallSignal]);

  const dismissCall = useCallback((): void => {
    if (callRef.current?.phase === 'failed') {
      resetCall();
    }
  }, [resetCall]);

  const toggleMute = useCallback((): void => {
    const activeCall = callRef.current;
    if (!activeCall || activeCall.phase !== 'active') {
      return;
    }
    const isMuted = !activeCall.isMuted;
    localStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
    updateCall({ isMuted });
  }, [updateCall]);

  const handleSignal = useCallback(async (event: RealtimeEvent): Promise<void> => {
    if (!isCallEvent(event)) {
      return;
    }

    if (event.event === 'call.failed') {
      const activeCall = callRef.current;
      if (activeCall && event.callId === activeCall.callId) {
        finishWithFailure(callFailureKeyForReason(event.reason));
      }
      return;
    }

    if (event.event === 'call.invite') {
      if (!event.callId || !event.chatId || !event.userId) {
        return;
      }
      const incomingCallId = event.callId;
      const incomingChatId = event.chatId;
      const incomingUserId = event.userId;
      if (event.callType === 'video') {
        sendCallSignal('call.reject', incomingCallId, incomingChatId, { reason: 'unsupported_media' });
        return;
      }
      if (callRef.current) {
        sendCallSignal('call.reject', incomingCallId, incomingChatId, { reason: 'busy' });
        return;
      }
      setCall({
        callId: incomingCallId,
        chatId: incomingChatId,
        connectedAt: null,
        failure: null,
        isCaller: false,
        isMuted: false,
        peerName: '',
        peerUserId: incomingUserId,
        phase: 'incoming',
      });
      startRingTimeout(incomingCallId, false);
      getChat(incomingChatId)
        .then(chat => {
          const activeCall = callRef.current;
          if (isCurrentCall(activeCall, incomingCallId)) {
            updateCall({
              peerName: chat.peer?.display_name || chat.peer?.username || activeCall.peerName,
              peerUserId: chat.peer?.id || activeCall.peerUserId,
            });
          }
        })
        .catch(() => undefined);
      return;
    }

    const activeCall = callRef.current;
    if (!activeCall || !event.callId || event.callId !== activeCall.callId) {
      return;
    }

    if (event.event === 'call.accept' && activeCall.isCaller) {
      clearRingTimeout();
      updateCall({ phase: 'connecting' });
      try {
        const connection = await ensurePeerConnection(activeCall.callId);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        const description = connection.localDescription;
        if (!description?.sdp || !sendCallSignal('call.offer', activeCall.callId, activeCall.chatId, {
          description: { sdp: description.sdp, type: 'offer' },
        })) {
          throw new CallWorkflowError('callConnectionFailed');
        }
      } catch (error) {
        const current = callRef.current;
        if (isCurrentCall(current, activeCall.callId)) {
          sendCallSignal('call.end', current.callId, current.chatId);
          finishWithFailure(failureKeyFromError(error, 'callConnectionFailed'));
        }
      }
      return;
    }

    if (event.event === 'call.reject') {
      finishWithFailure(event.reason === 'busy' ? 'callPeerBusy' : 'callRejected');
      return;
    }
    if (event.event === 'call.cancel' || event.event === 'call.end') {
      resetCall();
      return;
    }

    if (event.event === 'call.offer' && event.description) {
      try {
        const connection = await ensurePeerConnection(activeCall.callId);
        await connection.setRemoteDescription(new RTCSessionDescription(event.description));
        await flushIceCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        const description = connection.localDescription;
        if (!description?.sdp || !sendCallSignal('call.answer', activeCall.callId, activeCall.chatId, {
          description: { sdp: description.sdp, type: 'answer' },
        })) {
          throw new CallWorkflowError('callConnectionFailed');
        }
        updateCall({ phase: 'connecting' });
      } catch (error) {
        const current = callRef.current;
        if (isCurrentCall(current, activeCall.callId)) {
          sendCallSignal('call.end', current.callId, current.chatId);
          finishWithFailure(failureKeyFromError(error, 'callConnectionFailed'));
        }
      }
      return;
    }

    if (event.event === 'call.answer' && event.description) {
      try {
        const connection = peerConnectionRef.current;
        if (!connection || connection.signalingState === 'stable') {
          return;
        }
        await connection.setRemoteDescription(new RTCSessionDescription(event.description));
        await flushIceCandidates();
      } catch {
        const current = callRef.current;
        if (isCurrentCall(current, activeCall.callId)) {
          sendCallSignal('call.end', current.callId, current.chatId);
          finishWithFailure('callConnectionFailed');
        }
      }
      return;
    }

    if (event.event === 'call.ice_candidate' && event.candidate) {
      const candidate = new RTCIceCandidate(event.candidate);
      const connection = peerConnectionRef.current;
      if (!connection?.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      await connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }, [clearRingTimeout, ensurePeerConnection, finishWithFailure, flushIceCandidates, resetCall, sendCallSignal, setCall, startRingTimeout, updateCall]);

  useEffect(() => subscribeToEvents(event => {
    handleSignal(event).catch(() => {
      if (callRef.current) {
        finishWithFailure('callConnectionFailed');
      }
    });
  }), [finishWithFailure, handleSignal, subscribeToEvents]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (!isForegroundAppState(nextState) && callRef.current?.phase !== 'failed') {
        resetCall();
      }
    });
    return () => subscription.remove();
  }, [resetCall]);

  useEffect(() => () => {
    const activeCall = callRef.current;
    if (activeCall && activeCall.phase !== 'failed') {
      sendCallSignal(
        signalForEndingCall(activeCall),
        activeCall.callId,
        activeCall.chatId,
      );
    }
    releaseResources();
  }, [releaseResources, sendCallSignal]);

  const value = useMemo(
    () => ({ acceptCall, call, dismissCall, endCall, rejectCall, startCall, toggleMute }),
    [acceptCall, call, dismissCall, endCall, rejectCall, startCall, toggleMute],
  );

  return <DirectCallContext.Provider value={value}>{children}</DirectCallContext.Provider>;
}

export function useDirectCall(): DirectCallContextValue {
  const context = useContext(DirectCallContext);
  if (!context) {
    throw new Error('useDirectCall должен использоваться внутри DirectCallProvider.');
  }
  return context;
}
