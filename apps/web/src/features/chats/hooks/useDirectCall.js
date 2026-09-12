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
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
};

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

function setVideoTracksEnabled(stream, enabled) {
  stream?.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export function isCallSignal(payload) {
  return CALL_EVENTS.has(payload?.event);
}

export function useDirectCall({ accessToken, currentUserId, socket, t, onError }) {
  const [callState, setCallState] = useState('idle');
  const [callId, setCallId] = useState(null);
  const [callType, setCallType] = useState('audio');
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
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
  const callStateRef = useRef('idle');
  const callTypeRef = useRef('audio');
  const isMutedRef = useRef(false);
  const isVideoEnabledRef = useRef(false);
  const isCallerRef = useRef(false);
  const callTimeoutRef = useRef(null);
  const socketRef = useRef(socket);
  const chatIdRef = useRef(null);
  socketRef.current = socket;

  const canUseCalls = useMemo(() => Boolean(
    navigator.mediaDevices?.getUserMedia
    && typeof RTCPeerConnection !== 'undefined'
  ), []);
  const canUseVideoCalls = canUseCalls;
  const canSignalCall = socket?.readyState === WebSocket.OPEN;

  const setCurrentCallState = useCallback((nextState) => {
    callStateRef.current = nextState;
    setCallState(nextState);
  }, []);

  const setCurrentCallType = useCallback((nextType) => {
    callTypeRef.current = nextType;
    setCallType(nextType);
  }, []);

  const setCurrentVideoEnabled = useCallback((enabled) => {
    isVideoEnabledRef.current = enabled;
    setIsVideoEnabled(enabled);
  }, []);

  const sendSignal = useCallback((payload, chatId = chatIdRef.current) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || !chatId) return false;
    try {
      socketRef.current.send(JSON.stringify({ ...payload, chat_id: chatId }));
      return true;
    } catch {
      return false;
    }
  }, []);

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
    callTypeRef.current = 'audio';
    isMutedRef.current = false;
    isVideoEnabledRef.current = false;
    setCurrentCallState('idle');
    setCallId(null);
    setCallType('audio');
    setRemoteUserId(null);
    setIsMuted(false);
    setIsVideoEnabled(false);
    setLocalStream(null);
    setRemoteStream(null);
    setStartedAt(null);
    setStatusText('');
  }, [setCurrentCallState]);

  const reportError = useCallback((message) => {
    setStatusText(message);
    onError?.(message);
  }, [onError]);

  const getLocalStream = useCallback(async ({ withVideo = false } = {}) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t('calls.mediaUnsupported'));
    }

    let stream = localStreamRef.current;
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: withVideo ? VIDEO_CONSTRAINTS : false,
      });
      localStreamRef.current = stream;
    } else if (withVideo && stream.getVideoTracks().length === 0) {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: VIDEO_CONSTRAINTS });
      cameraStream.getVideoTracks().forEach((track) => stream.addTrack(track));
    }

    setAudioEnabled(stream, !isMutedRef.current);
    setLocalStream(new MediaStream(stream.getTracks()));
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
        setCurrentCallState('active');
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

    const stream = localStreamRef.current ?? await getLocalStream({
      withVideo: callTypeRef.current === 'video' && isVideoEnabledRef.current,
    });
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    peerConnectionRef.current = connection;
    return connection;
  }, [getLocalStream, loadIceServers, sendSignal, setCurrentCallState, t]);

  const flushIceCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current.splice(0);
    await Promise.all(candidates.map((candidate) => connection.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const createAndSendOffer = useCallback(async () => {
    const connection = await ensurePeerConnection();
    if (!callIdRef.current || connection.signalingState !== 'stable') return false;

    makingOfferRef.current = true;
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (!connection.localDescription || !sendSignal({
        event: 'call.offer',
        call_id: callIdRef.current,
        description: connection.localDescription,
      })) {
        throw new Error(t('calls.connectionError'));
      }
      return true;
    } finally {
      makingOfferRef.current = false;
    }
  }, [ensurePeerConnection, sendSignal, t]);

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

  const startOutgoingCall = useCallback(async (nextCallType) => {
    const nextCallId = callIdRef.current;
    if (!nextCallId) throw new Error(t('calls.startError'));

    setCurrentCallState('calling');
    setStatusText(nextCallType === 'video' ? t('calls.startingVideo') : t('calls.requestingMicrophone'));
    await loadIceServers();
    if (!sendSignal({ event: 'call.invite', call_id: nextCallId, call_type: nextCallType })) {
      throw new Error(t('calls.connectionError'));
    }
    startRingTimeout(nextCallId, true);
    setStatusText(t('calls.calling'));
  }, [loadIceServers, sendSignal, setCurrentCallState, startRingTimeout, t]);

  const startCall = useCallback(async ({ chatId, peer, callType: nextCallType = 'audio' }) => {
    if (!chatId || !peer?.id || peer.id === currentUserId || !canUseCalls || !canSignalCall || callStateRef.current !== 'idle') return false;

    const nextCallId = createCallId(chatId);
    try {
      chatIdRef.current = chatId;
      callIdRef.current = nextCallId;
      isCallerRef.current = true;
      setCallId(nextCallId);
      setRemoteUserId(peer.id);
      setCurrentCallType(nextCallType);
      setCurrentVideoEnabled(false);
      if (nextCallType === 'video') {
        await getLocalStream({ withVideo: true });
        setVideoTracksEnabled(localStreamRef.current, true);
        setCurrentVideoEnabled(true);
      } else {
        await getLocalStream();
      }
      await startOutgoingCall(nextCallType);
      return true;
    } catch (err) {
      resetCall();
      reportError(err.message || t('calls.startError'));
      return false;
    }
  }, [canSignalCall, canUseCalls, currentUserId, getLocalStream, reportError, resetCall, setCurrentCallType, setCurrentVideoEnabled, startOutgoingCall, t]);

  const openVideoPreview = useCallback(async ({ chatId, peer }) => {
    if (!chatId || !peer?.id || peer.id === currentUserId || !canUseVideoCalls || !canSignalCall || callStateRef.current !== 'idle') return false;

    const nextCallId = createCallId(chatId);
    try {
      chatIdRef.current = chatId;
      callIdRef.current = nextCallId;
      isCallerRef.current = true;
      setCallId(nextCallId);
      setRemoteUserId(peer.id);
      setCurrentCallType('video');
      setCurrentCallState('preview');
      setStatusText(t('calls.cameraPreview'));
      await getLocalStream({ withVideo: true });
      setVideoTracksEnabled(localStreamRef.current, true);
      setCurrentVideoEnabled(true);
      return true;
    } catch {
      resetCall();
      reportError(t('calls.cameraStartError'));
      return false;
    }
  }, [canSignalCall, canUseVideoCalls, currentUserId, getLocalStream, reportError, resetCall, setCurrentCallState, setCurrentCallType, setCurrentVideoEnabled, t]);

  const startVideoCall = useCallback(async () => {
    if (callStateRef.current !== 'preview' || !canSignalCall) return false;
    try {
      await startOutgoingCall('video');
      return true;
    } catch (err) {
      resetCall();
      reportError(err.message || t('calls.startError'));
      return false;
    }
  }, [canSignalCall, reportError, resetCall, startOutgoingCall, t]);

  const acceptCall = useCallback(async ({ withVideo } = {}) => {
    if (!callIdRef.current || callStateRef.current !== 'incoming' || !canSignalCall) return;

    const shouldEnableVideo = callTypeRef.current === 'video' && (withVideo ?? true);
    try {
      setCurrentCallState('connecting');
      setStatusText(shouldEnableVideo ? t('calls.requestingCamera') : t('calls.requestingMicrophone'));
      await getLocalStream({ withVideo: shouldEnableVideo });
      setVideoTracksEnabled(localStreamRef.current, shouldEnableVideo);
      setCurrentVideoEnabled(shouldEnableVideo);
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
  }, [canSignalCall, ensurePeerConnection, getLocalStream, reportError, resetCall, sendSignal, setCurrentCallState, setCurrentVideoEnabled, t]);

  const rejectCall = useCallback(() => {
    if (!callIdRef.current) return;
    sendSignal({ event: 'call.reject', call_id: callIdRef.current });
    resetCall();
  }, [resetCall, sendSignal]);

  const endCall = useCallback(() => {
    if (callIdRef.current && callStateRef.current !== 'preview') {
      sendSignal({
        event: callStateRef.current === 'calling' ? 'call.cancel' : 'call.end',
        call_id: callIdRef.current,
      });
    }
    resetCall();
  }, [resetCall, sendSignal]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    setAudioEnabled(localStreamRef.current, !nextMuted);
  }, []);

  const toggleVideo = useCallback(async () => {
    if (callTypeRef.current !== 'video' || callStateRef.current === 'incoming') return;

    try {
      if (isVideoEnabledRef.current) {
        setVideoTracksEnabled(localStreamRef.current, false);
        setCurrentVideoEnabled(false);
        return;
      }

      const stream = await getLocalStream({ withVideo: true });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error(t('calls.cameraStartError'));
      setVideoTracksEnabled(stream, true);
      setCurrentVideoEnabled(true);

      const connection = peerConnectionRef.current;
      if (!connection || connection.connectionState !== 'connected') return;
      const sender = connection.getSenders().find((item) => item.track?.kind === 'video');
      if (!sender) {
        connection.addTrack(videoTrack, stream);
        await createAndSendOffer();
      } else {
        await sender.replaceTrack(videoTrack);
      }
    } catch (err) {
      reportError(err.message || t('calls.cameraStartError'));
    }
  }, [createAndSendOffer, getLocalStream, reportError, setCurrentVideoEnabled, t]);

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

      if (payload.user_id === currentUserId) return;

      if (payload.event === 'call.invite') {
        if (payload.call_id === callIdRef.current) return;
        if (callStateRef.current !== 'idle') {
          sendSignal({ event: 'call.reject', call_id: payload.call_id, reason: 'busy' }, payload.chat_id);
          return;
        }
        chatIdRef.current = payload.chat_id;
        callIdRef.current = payload.call_id;
        isCallerRef.current = false;
        setCallId(payload.call_id);
        setRemoteUserId(payload.user_id);
        setCurrentCallType(payload.call_type === 'video' ? 'video' : 'audio');
        setCurrentVideoEnabled(false);
        setCurrentCallState('incoming');
        setStatusText(payload.call_type === 'video' ? t('calls.incomingVideo') : t('calls.incoming'));
        startRingTimeout(payload.call_id, false);
        return;
      }

      if (!payload.call_id || payload.call_id !== callIdRef.current) return;

      if (payload.event === 'call.accept') {
        window.clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        setCurrentCallState('connecting');
        setStatusText(t('calls.connectingCall'));
        await createAndSendOffer();
        return;
      }

      if (payload.event === 'call.reject') {
        reportError(
          payload.reason === 'busy'
            ? t('calls.peerBusy')
            : payload.reason === 'unsupported_media'
              ? t('calls.peerVideoUnsupported')
              : t('calls.rejected'),
        );
        resetCall();
        return;
      }

      if (payload.event === 'call.cancel' || payload.event === 'call.end') {
        resetCall();
        return;
      }

      if (payload.event === 'call.offer' && payload.description) {
        const connection = await ensurePeerConnection();
        if (makingOfferRef.current || connection.signalingState !== 'stable') return;
        await connection.setRemoteDescription(payload.description);
        await flushIceCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        if (!sendSignal({ event: 'call.answer', call_id: payload.call_id, description: connection.localDescription })) {
          throw new Error(t('calls.connectionError'));
        }
        if (callStateRef.current !== 'active') setCurrentCallState('connecting');
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
  }, [createAndSendOffer, currentUserId, ensurePeerConnection, flushIceCandidates, reportError, resetCall, sendSignal, setCurrentCallState, setCurrentCallType, setCurrentVideoEnabled, startRingTimeout, t]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => () => {
    const activeCallId = callIdRef.current;
    const activeSocket = socketRef.current;
    if (activeCallId && callStateRef.current !== 'preview' && activeSocket?.readyState === WebSocket.OPEN) {
      try {
        activeSocket.send(JSON.stringify({
          event: isCallerRef.current ? 'call.cancel' : 'call.end',
          call_id: activeCallId,
          chat_id: chatIdRef.current,
        }));
      } catch {
        // Local cleanup still releases the peer connection and media tracks.
      }
    }
    resetCall();
  }, [resetCall]);

  return {
    canUseCalls,
    canUseVideoCalls,
    canSignalCall,
    callState,
    callId,
    callType,
    remoteUserId,
    isMuted,
    isVideoEnabled,
    localStream,
    remoteStream,
    startedAt,
    statusText,
    startCall,
    openVideoPreview,
    startVideoCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    handleSignal,
  };
}
