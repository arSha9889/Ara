import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getCallIceConfiguration } from './callsApi.js';

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

function setVideoEnabled(stream, enabled) {
  stream?.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

function iceConfiguration(servers) {
  const iceServers = Array.isArray(servers)
    ? servers.map((server) => {
      const urls = Array.isArray(server?.urls)
        ? server.urls.filter((url) => typeof url === 'string' && url.trim())
        : typeof server?.urls === 'string' && server.urls.trim() ? server.urls.trim() : null;
      if (!urls || (Array.isArray(urls) && !urls.length)) return null;
      return {
        urls,
        ...(typeof server.username === 'string' && server.username ? { username: server.username } : {}),
        ...(typeof server.credential === 'string' && server.credential ? { credential: server.credential } : {}),
      };
    }).filter(Boolean)
    : [];

  return { iceServers, iceTransportPolicy: 'relay' };
}

export function isCallSignal(payload) {
  return CALL_EVENTS.has(payload?.event);
}

export function useDirectCall({ accessToken, currentUserId, canSignalCall, onRealtimeSend, onError, t }) {
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('audio');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [statusText, setStatusText] = useState('');

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceServersRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const makingOfferRef = useRef(false);
  const callIdRef = useRef(null);
  const chatIdRef = useRef(null);
  const callStateRef = useRef('idle');
  const callTypeRef = useRef('audio');
  const isMutedRef = useRef(false);
  const isVideoEnabledRef = useRef(false);
  const isCallerRef = useRef(false);
  const callTimeoutRef = useRef(null);
  const sendRealtimeRef = useRef(onRealtimeSend);
  sendRealtimeRef.current = onRealtimeSend;

  const canUseCalls = useMemo(() => Boolean(
    navigator.mediaDevices?.getUserMedia
    && typeof RTCPeerConnection !== 'undefined'
    && typeof MediaStream !== 'undefined',
  ), []);

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
    if (!chatId) return false;
    return Boolean(sendRealtimeRef.current?.({ ...payload, chat_id: chatId }));
  }, []);

  const resetCall = useCallback(() => {
    const connection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    connection?.close();
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    iceServersRef.current = null;
    pendingIceCandidatesRef.current = [];
    makingOfferRef.current = false;
    isCallerRef.current = false;
    callIdRef.current = null;
    chatIdRef.current = null;
    callTypeRef.current = 'audio';
    isMutedRef.current = false;
    isVideoEnabledRef.current = false;
    window.clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
    setCurrentCallState('idle');
    setCallType('audio');
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
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('workspace.callsPanel.mediaUnsupported'));

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
    if (!accessToken) throw new Error(t('workspace.callsPanel.unavailable'));

    const configuration = await getCallIceConfiguration(accessToken);
    if (!Array.isArray(configuration?.ice_servers) || !configuration.ice_servers.length) {
      throw new Error(t('workspace.callsPanel.unavailable'));
    }
    iceServersRef.current = configuration.ice_servers;
    return iceServersRef.current;
  }, [accessToken, t]);

  const ensurePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const servers = await loadIceServers();
    const connection = new RTCPeerConnection(iceConfiguration(servers));
    const nextRemoteStream = new MediaStream();
    peerConnectionRef.current = connection;
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
        if (!nextRemoteStream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
          nextRemoteStream.addTrack(track);
        }
      });
      setRemoteStream(new MediaStream(nextRemoteStream.getTracks()));
    };

    connection.onconnectionstatechange = () => {
      if (peerConnectionRef.current !== connection) return;
      if (connection.connectionState === 'connected') {
        setCurrentCallState('active');
        setStartedAt((current) => current ?? Date.now());
        setStatusText(t('workspace.callsPanel.connected'));
      } else if (['failed', 'disconnected'].includes(connection.connectionState)) {
        setStatusText(t('workspace.callsPanel.connectionInterrupted'));
      }
    };

    const stream = localStreamRef.current ?? await getLocalStream({
      withVideo: callTypeRef.current === 'video' && isVideoEnabledRef.current,
    });
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
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
        throw new Error(t('workspace.callsPanel.connectionError'));
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
        reportError(t('workspace.callsPanel.noAnswer'));
      } else {
        sendSignal({ event: 'call.reject', call_id: nextCallId });
      }
      resetCall();
    }, CALL_RING_TIMEOUT_MS);
  }, [reportError, resetCall, sendSignal, t]);

  const startCall = useCallback(async ({ chatId, peer, callType: nextCallType = 'audio' }) => {
    if (!chatId || !peer?.id || peer.id === currentUserId || !canUseCalls || !canSignalCall || callStateRef.current !== 'idle') return false;

    const nextCallId = createCallId(chatId);
    try {
      chatIdRef.current = chatId;
      callIdRef.current = nextCallId;
      isCallerRef.current = true;
      setCurrentCallType(nextCallType);
      setCurrentVideoEnabled(nextCallType === 'video');
      setCurrentCallState('calling');
      setStatusText(nextCallType === 'video' ? t('workspace.callsPanel.requestingCamera') : t('workspace.callsPanel.requestingMicrophone'));
      await getLocalStream({ withVideo: nextCallType === 'video' });
      setVideoEnabled(localStreamRef.current, nextCallType === 'video');
      await loadIceServers();
      if (!sendSignal({ event: 'call.invite', call_id: nextCallId, call_type: nextCallType })) {
        throw new Error(t('workspace.callsPanel.connectionError'));
      }
      startRingTimeout(nextCallId, true);
      setStatusText(t('workspace.callsPanel.calling'));
      return true;
    } catch (error) {
      resetCall();
      reportError(error.message || t('workspace.callsPanel.startError'));
      return false;
    }
  }, [canSignalCall, canUseCalls, currentUserId, getLocalStream, loadIceServers, reportError, resetCall, sendSignal, setCurrentCallState, setCurrentCallType, setCurrentVideoEnabled, startRingTimeout, t]);

  const acceptCall = useCallback(async ({ withVideo } = {}) => {
    if (!callIdRef.current || callStateRef.current !== 'incoming' || !canSignalCall) return false;

    const shouldEnableVideo = callTypeRef.current === 'video' && (withVideo ?? true);
    try {
      setCurrentCallState('connecting');
      setStatusText(shouldEnableVideo ? t('workspace.callsPanel.requestingCamera') : t('workspace.callsPanel.requestingMicrophone'));
      await getLocalStream({ withVideo: shouldEnableVideo });
      setVideoEnabled(localStreamRef.current, shouldEnableVideo);
      setCurrentVideoEnabled(shouldEnableVideo);
      await ensurePeerConnection();
      if (!sendSignal({ event: 'call.accept', call_id: callIdRef.current })) {
        throw new Error(t('workspace.callsPanel.connectionError'));
      }
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
      setStatusText(t('workspace.callsPanel.connecting'));
      return true;
    } catch (error) {
      sendSignal({ event: 'call.reject', call_id: callIdRef.current, reason: 'media_failed' });
      resetCall();
      reportError(error.message || t('workspace.callsPanel.startError'));
      return false;
    }
  }, [canSignalCall, ensurePeerConnection, getLocalStream, reportError, resetCall, sendSignal, setCurrentCallState, setCurrentVideoEnabled, t]);

  const rejectCall = useCallback(() => {
    if (callIdRef.current) sendSignal({ event: 'call.reject', call_id: callIdRef.current });
    resetCall();
  }, [resetCall, sendSignal]);

  const endCall = useCallback(() => {
    if (callIdRef.current) {
      const event = callStateRef.current === 'calling'
        ? 'call.cancel'
        : callStateRef.current === 'incoming' ? 'call.reject' : 'call.end';
      sendSignal({ event, call_id: callIdRef.current });
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
        setVideoEnabled(localStreamRef.current, false);
        setCurrentVideoEnabled(false);
        return;
      }

      const stream = await getLocalStream({ withVideo: true });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error(t('workspace.callsPanel.cameraStartError'));
      setVideoEnabled(stream, true);
      setCurrentVideoEnabled(true);

      const connection = peerConnectionRef.current;
      if (!connection || connection.connectionState !== 'connected') return;
      const sender = connection.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        connection.addTrack(videoTrack, stream);
        await createAndSendOffer();
      }
    } catch (error) {
      reportError(error.message || t('workspace.callsPanel.cameraStartError'));
    }
  }, [createAndSendOffer, getLocalStream, reportError, setCurrentVideoEnabled, t]);

  const handleSignal = useCallback(async (payload) => {
    if (!isCallSignal(payload)) return;

    try {
      if (payload.event === 'call.failed') {
        if (!payload.call_id || payload.call_id !== callIdRef.current) return;
        const message = payload.reason === 'peer_busy'
          ? t('workspace.callsPanel.peerBusy')
          : payload.reason === 'peer_offline'
            ? t('workspace.callsPanel.peerOffline')
            : t('workspace.callsPanel.connectionError');
        resetCall();
        reportError(message);
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
        setCurrentCallType(payload.call_type === 'video' ? 'video' : 'audio');
        setCurrentVideoEnabled(false);
        setCurrentCallState('incoming');
        setStatusText(payload.call_type === 'video' ? t('workspace.callsPanel.incomingVideo') : t('workspace.callsPanel.incomingAudio'));
        startRingTimeout(payload.call_id, false);
        return;
      }

      if (!payload.call_id || payload.call_id !== callIdRef.current) return;

      if (payload.event === 'call.accept') {
        window.clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        setCurrentCallState('connecting');
        setStatusText(t('workspace.callsPanel.connecting'));
        await createAndSendOffer();
        return;
      }

      if (payload.event === 'call.reject') {
        const message = payload.reason === 'busy'
          ? t('workspace.callsPanel.peerBusy')
          : payload.reason === 'unsupported_media'
            ? t('workspace.callsPanel.peerVideoUnsupported')
            : t('workspace.callsPanel.rejected');
        resetCall();
        reportError(message);
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
          throw new Error(t('workspace.callsPanel.connectionError'));
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
    } catch (error) {
      makingOfferRef.current = false;
      reportError(error.message || t('workspace.callsPanel.connectionError'));
    }
  }, [createAndSendOffer, currentUserId, ensurePeerConnection, flushIceCandidates, reportError, resetCall, sendSignal, setCurrentCallState, setCurrentCallType, setCurrentVideoEnabled, startRingTimeout, t]);

  useEffect(() => {
    if (!canSignalCall && callStateRef.current !== 'idle') resetCall();
  }, [canSignalCall, resetCall]);

  useEffect(() => () => {
    if (callIdRef.current) {
      const event = callStateRef.current === 'incoming'
        ? 'call.reject'
        : callStateRef.current === 'calling' ? 'call.cancel' : 'call.end';
      sendSignal({ event, call_id: callIdRef.current });
    }
    resetCall();
  }, [resetCall, sendSignal]);

  return {
    canUseCalls,
    canSignalCall,
    callState,
    callType,
    isMuted,
    isVideoEnabled,
    localStream,
    remoteStream,
    startedAt,
    statusText,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    handleSignal,
  };
}
