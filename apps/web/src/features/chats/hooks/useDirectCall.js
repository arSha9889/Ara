import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getRtcConfiguration } from '../../../shared/webrtc/iceServers.js';
import { getCallIceConfiguration } from '../api/chatApi.js';

const CALL_EVENTS = new Set([
  'call.invite',
  'call.accept',
  'call.reject',
  'call.cancel',
  'call.end',
  'call.offer',
  'call.answer',
  'call.ice_candidate',
  'call.failed',
]);

const CALL_RING_TIMEOUT_MS = 70_000;

function createCallId(chatId) {
  const randomPart = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${chatId}-${Date.now()}-${randomPart}`;
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function setAudioEnabled(stream, enabled) {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export function isCallSignal(payload) {
  return CALL_EVENTS.has(payload?.event);
}

export function useDirectCall({ accessToken, chatId, currentUserId, peer, socket, t, onError }) {
  const [callState, setCallState] = useState('idle');
  const [callId, setCallId] = useState(null);
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [statusText, setStatusText] = useState('');

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceServersRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const makingOfferRef = useRef(false);
  const callIdRef = useRef(null);
  const isMutedRef = useRef(false);
  const isCallerRef = useRef(false);
  const callTimeoutRef = useRef(null);
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const canUseCalls = useMemo(() => Boolean(
    chatId
    && peer?.id
    && peer.id !== currentUserId
    && navigator.mediaDevices?.getUserMedia
    && typeof RTCPeerConnection !== 'undefined'
  ), [chatId, currentUserId, peer?.id]);
  const canSignalCall = socket?.readyState === WebSocket.OPEN;

  const sendSignal = useCallback((payload) => {
    if (socket?.readyState !== WebSocket.OPEN || !chatId) return false;
    try {
      socket.send(JSON.stringify({ ...payload, chat_id: chatId }));
      return true;
    } catch {
      return false;
    }
  }, [chatId, socket]);

  const resetCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    iceServersRef.current = null;
    window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    pendingIceCandidatesRef.current = [];
    makingOfferRef.current = false;
    isCallerRef.current = false;
    callIdRef.current = null;
    setCallState('idle');
    setCallId(null);
    setRemoteUserId(null);
    setIsMuted(false);
    setLocalStream(null);
    setRemoteStream(null);
    setStartedAt(null);
    setStatusText('');
  }, []);

  const reportError = useCallback((message) => {
    setStatusText(message);
    onError?.(message);
  }, [onError]);

  const getMicrophoneStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t('calls.mediaUnsupported'));
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    setAudioEnabled(stream, !isMutedRef.current);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, [t]);

  const loadIceServers = useCallback(async () => {
    if (iceServersRef.current) return iceServersRef.current;
    if (!accessToken) throw new Error(t('calls.unavailable'));

    const configuration = await getCallIceConfiguration(accessToken);
    if (!Array.isArray(configuration?.ice_servers) || configuration.ice_servers.length === 0) {
      throw new Error(t('calls.unavailable'));
    }
    iceServersRef.current = configuration.ice_servers;
    return iceServersRef.current;
  }, [accessToken, t]);

  const ensurePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const iceServers = await loadIceServers();
    const connection = new RTCPeerConnection(getRtcConfiguration(iceServers));
    const nextRemoteStream = new MediaStream();
    remoteStreamRef.current = nextRemoteStream;
    setRemoteStream(nextRemoteStream);

    connection.onicecandidate = (event) => {
      if (!event.candidate || !callIdRef.current) return;
      sendSignal({
        event: 'call.ice_candidate',
        call_id: callIdRef.current,
        candidate: event.candidate.toJSON(),
      });
    };

    connection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!nextRemoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          nextRemoteStream.addTrack(track);
        }
      });
      setRemoteStream(new MediaStream(nextRemoteStream.getTracks()));
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') {
        setCallState('active');
        setStartedAt((current) => current ?? Date.now());
        setStatusText(t('calls.connected'));
      }
      if (['failed', 'disconnected'].includes(connection.connectionState)) {
        setStatusText(t('calls.connectionInterrupted'));
      }
      if (connection.connectionState === 'closed') {
        setStatusText('');
      }
    };

    const stream = localStreamRef.current ?? await getMicrophoneStream();
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    peerConnectionRef.current = connection;
    return connection;
  }, [getMicrophoneStream, loadIceServers, sendSignal, t]);

  const flushIceCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current.splice(0);
    await Promise.all(candidates.map((candidate) => connection.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const startRingTimeout = useCallback((nextCallId, isCaller) => {
    window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = window.setTimeout(() => {
      if (callIdRef.current !== nextCallId) return;
      if (isCaller) {
        sendSignal({ event: 'call.cancel', call_id: nextCallId });
        reportError(t('calls.noAnswer'));
      } else {
        sendSignal({ event: 'call.reject', call_id: nextCallId });
      }
      resetCall();
    }, CALL_RING_TIMEOUT_MS);
  }, [reportError, resetCall, sendSignal, t]);

  const startCall = useCallback(async () => {
    if (!canUseCalls || !canSignalCall || callState !== 'idle') return;

    const nextCallId = createCallId(chatId);
    try {
      callIdRef.current = nextCallId;
      isCallerRef.current = true;
      setCallId(nextCallId);
      setRemoteUserId(peer.id);
      setCallState('calling');
      setStatusText(t('calls.requestingMicrophone'));
      await getMicrophoneStream();
      await loadIceServers();
      if (!sendSignal({ event: 'call.invite', call_id: nextCallId })) {
        throw new Error(t('calls.connectionError'));
      }
      startRingTimeout(nextCallId, true);
      setStatusText(t('calls.calling'));
    } catch (err) {
      resetCall();
      reportError(err.message || t('calls.startError'));
    }
  }, [callState, canUseCalls, chatId, getMicrophoneStream, loadIceServers, peer?.id, reportError, resetCall, sendSignal, startRingTimeout, t]);

  const acceptCall = useCallback(async () => {
    if (!callIdRef.current || callState !== 'incoming' || !canSignalCall) return;

    try {
      setCallState('connecting');
      setStatusText(t('calls.requestingMicrophone'));
      await getMicrophoneStream();
      await ensurePeerConnection();
      if (!sendSignal({ event: 'call.accept', call_id: callIdRef.current })) {
        throw new Error(t('calls.connectionError'));
      }
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
      setStatusText(t('calls.connectingCall'));
    } catch (err) {
      sendSignal({ event: 'call.reject', call_id: callIdRef.current, reason: 'media_failed' });
      resetCall();
      reportError(err.message || t('calls.startError'));
    }
  }, [callState, canSignalCall, ensurePeerConnection, getMicrophoneStream, reportError, resetCall, sendSignal, t]);

  const rejectCall = useCallback(() => {
    if (!callIdRef.current) return;
    sendSignal({ event: 'call.reject', call_id: callIdRef.current });
    resetCall();
  }, [resetCall, sendSignal]);

  const endCall = useCallback(() => {
    if (callIdRef.current) {
      sendSignal({
        event: callState === 'calling' ? 'call.cancel' : 'call.end',
        call_id: callIdRef.current,
      });
    }
    resetCall();
  }, [callState, resetCall, sendSignal]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    setAudioEnabled(localStreamRef.current, !nextMuted);
  }, []);

  const handleSignal = useCallback(async (payload) => {
    if (!isCallSignal(payload)) return;

    try {
      if (payload.event === 'call.failed') {
        if (!payload.call_id || payload.call_id !== callIdRef.current) return;
        const errorMessage = payload.reason === 'peer_busy'
          ? t('calls.peerBusy')
          : payload.reason === 'peer_offline'
            ? t('calls.peerOffline')
            : t('calls.connectionError');
        reportError(errorMessage);
        resetCall();
        return;
      }

      if (payload.chat_id !== chatId || payload.user_id === currentUserId) return;

      if (payload.event === 'call.invite') {
        if (payload.call_id === callIdRef.current) return;
        if (callState !== 'idle') {
          sendSignal({ event: 'call.reject', call_id: payload.call_id, reason: 'busy' });
          return;
        }
        callIdRef.current = payload.call_id;
        isCallerRef.current = false;
        setCallId(payload.call_id);
        setRemoteUserId(payload.user_id);
        setCallState('incoming');
        setStatusText(t('calls.incoming'));
        startRingTimeout(payload.call_id, false);
        return;
      }

      if (!payload.call_id || payload.call_id !== callIdRef.current) return;

      if (payload.event === 'call.accept') {
        window.clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        setCallState('connecting');
        setStatusText(t('calls.connectingCall'));
        const connection = await ensurePeerConnection();
        makingOfferRef.current = true;
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        sendSignal({ event: 'call.offer', call_id: payload.call_id, description: connection.localDescription });
        makingOfferRef.current = false;
        return;
      }

      if (payload.event === 'call.reject') {
        reportError(payload.reason === 'busy' ? t('calls.peerBusy') : t('calls.rejected'));
        resetCall();
        return;
      }

      if (payload.event === 'call.cancel' || payload.event === 'call.end') {
        resetCall();
        return;
      }

      if (payload.event === 'call.offer' && payload.description) {
        const connection = await ensurePeerConnection();
        const offerCollision = makingOfferRef.current || connection.signalingState !== 'stable';
        if (offerCollision && !isCallerRef.current) return;
        await connection.setRemoteDescription(payload.description);
        await flushIceCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        sendSignal({ event: 'call.answer', call_id: payload.call_id, description: connection.localDescription });
        setCallState('connecting');
        return;
      }

      if (payload.event === 'call.answer' && payload.description) {
        const connection = peerConnectionRef.current;
        if (!connection || connection.signalingState === 'stable') return;
        await connection.setRemoteDescription(payload.description);
        await flushIceCandidates();
        return;
      }

      if (payload.event === 'call.ice_candidate' && payload.candidate) {
        const candidate = new RTCIceCandidate(payload.candidate);
        const connection = peerConnectionRef.current;
        if (!connection?.remoteDescription) {
          pendingIceCandidatesRef.current.push(candidate);
          return;
        }
        await connection.addIceCandidate(candidate);
      }
    } catch (err) {
      makingOfferRef.current = false;
      reportError(err.message || t('calls.connectionError'));
    }
  }, [callState, chatId, currentUserId, ensurePeerConnection, flushIceCandidates, reportError, resetCall, sendSignal, startRingTimeout, t]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => () => {
    const activeCallId = callIdRef.current;
    const activeSocket = socketRef.current;
    if (activeCallId && activeSocket?.readyState === WebSocket.OPEN) {
      try {
        activeSocket.send(JSON.stringify({
          event: isCallerRef.current ? 'call.cancel' : 'call.end',
          call_id: activeCallId,
          chat_id: chatId,
        }));
      } catch {
        // The local cleanup still releases the microphone and peer connection.
      }
    }
    resetCall();
  }, [chatId, resetCall]);

  return {
    canUseCalls,
    canSignalCall,
    callState,
    callId,
    remoteUserId,
    isMuted,
    localStream,
    remoteStream,
    startedAt,
    statusText,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    handleSignal,
  };
}
