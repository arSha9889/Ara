import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getRtcConfiguration } from '../../../shared/webrtc/iceServers.js';

const CALL_EVENTS = new Set([
  'call.invite',
  'call.accept',
  'call.reject',
  'call.cancel',
  'call.end',
  'call.offer',
  'call.answer',
  'call.ice_candidate',
  'call.screen_stopped',
]);

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

function replaceSenderTrack(peerConnection, kind, nextTrack) {
  const sender = peerConnection
    ?.getSenders()
    .find((item) => item.track?.kind === kind || (!item.track && kind === 'video'));

  if (!sender) return Promise.resolve();
  return sender.replaceTrack(nextTrack ?? null);
}

export function isCallSignal(payload) {
  return CALL_EVENTS.has(payload?.event);
}

export function useDirectCall({ chatId, currentUserId, peer, socket, t, onError }) {
  const [callState, setCallState] = useState('idle');
  const [callId, setCallId] = useState(null);
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [statusText, setStatusText] = useState('');

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const makingOfferRef = useRef(false);
  const callIdRef = useRef(null);
  const isMutedRef = useRef(false);
  const isCallerRef = useRef(false);

  const canUseCalls = useMemo(() => Boolean(
    chatId
    && peer?.id
    && peer.id !== currentUserId
    && navigator.mediaDevices?.getUserMedia
    && typeof RTCPeerConnection !== 'undefined'
  ), [chatId, currentUserId, peer?.id]);

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
    stopStream(screenStreamRef.current);
    localStreamRef.current = null;
    screenStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    makingOfferRef.current = false;
    isCallerRef.current = false;
    callIdRef.current = null;
    setCallState('idle');
    setCallId(null);
    setRemoteUserId(null);
    setIsMuted(false);
    setIsScreenSharing(false);
    setLocalStream(null);
    setRemoteStream(null);
    setScreenStream(null);
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

  const ensurePeerConnection = useCallback(async () => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const connection = new RTCPeerConnection(getRtcConfiguration());
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
  }, [getMicrophoneStream, sendSignal, t]);

  const flushIceCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current.splice(0);
    await Promise.all(candidates.map((candidate) => connection.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const startCall = useCallback(async () => {
    if (!canUseCalls || callState !== 'idle') return;

    const nextCallId = createCallId(chatId);
    try {
      callIdRef.current = nextCallId;
      isCallerRef.current = true;
      setCallId(nextCallId);
      setRemoteUserId(peer.id);
      setCallState('calling');
      setStatusText(t('calls.requestingMicrophone'));
      await getMicrophoneStream();
      sendSignal({ event: 'call.invite', call_id: nextCallId });
      setStatusText(t('calls.calling'));
    } catch (err) {
      resetCall();
      reportError(err.message || t('calls.startError'));
    }
  }, [callState, canUseCalls, chatId, getMicrophoneStream, peer?.id, reportError, resetCall, sendSignal, t]);

  const acceptCall = useCallback(async () => {
    if (!callIdRef.current || callState !== 'incoming') return;

    try {
      setCallState('connecting');
      setStatusText(t('calls.requestingMicrophone'));
      await getMicrophoneStream();
      await ensurePeerConnection();
      sendSignal({ event: 'call.accept', call_id: callIdRef.current });
      setStatusText(t('calls.connectingCall'));
    } catch (err) {
      sendSignal({ event: 'call.reject', call_id: callIdRef.current, reason: 'media_failed' });
      resetCall();
      reportError(err.message || t('calls.startError'));
    }
  }, [callState, ensurePeerConnection, getMicrophoneStream, reportError, resetCall, sendSignal, t]);

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

  const stopScreenShare = useCallback(async ({ notify = true } = {}) => {
    const connection = peerConnectionRef.current;
    await replaceSenderTrack(connection, 'video', null);
    stopStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);
    if (notify && callIdRef.current) {
      sendSignal({ event: 'call.screen_stopped', call_id: callIdRef.current });
    }
  }, [sendSignal]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || !peerConnectionRef.current) {
      reportError(t('calls.screenUnsupported'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      const [track] = stream.getVideoTracks();
      if (!track) return;

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      track.addEventListener('ended', () => {
        void stopScreenShare();
      }, { once: true });

      const connection = peerConnectionRef.current;
      const videoSender = connection.getSenders().find((sender) => sender.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(track);
      } else {
        connection.addTrack(track, stream);
      }

      makingOfferRef.current = true;
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      sendSignal({ event: 'call.offer', call_id: callIdRef.current, description: connection.localDescription });
      setStatusText(t('calls.screenSharing'));
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        reportError(err.message || t('calls.screenStartError'));
      }
      await stopScreenShare({ notify: false });
    } finally {
      makingOfferRef.current = false;
    }
  }, [reportError, sendSignal, stopScreenShare, t]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      void stopScreenShare();
      return;
    }
    void startScreenShare();
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  const handleSignal = useCallback(async (payload) => {
    if (!isCallSignal(payload) || payload.chat_id !== chatId || payload.user_id === currentUserId) return;

    try {
      if (payload.event === 'call.invite') {
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
        return;
      }

      if (!payload.call_id || payload.call_id !== callIdRef.current) return;

      if (payload.event === 'call.accept') {
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

      if (payload.event === 'call.screen_stopped') {
        const currentRemoteStream = remoteStreamRef.current;
        currentRemoteStream?.getVideoTracks().forEach((track) => {
          currentRemoteStream.removeTrack(track);
        });
        if (currentRemoteStream) {
          setRemoteStream(new MediaStream(currentRemoteStream.getTracks()));
        }
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
  }, [callState, chatId, currentUserId, ensurePeerConnection, flushIceCandidates, reportError, resetCall, sendSignal, t]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => () => resetCall(), [chatId, resetCall]);

  return {
    canUseCalls,
    callState,
    callId,
    remoteUserId,
    isMuted,
    isScreenSharing,
    localStream,
    remoteStream,
    screenStream,
    startedAt,
    statusText,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleScreenShare,
    handleSignal,
  };
}
