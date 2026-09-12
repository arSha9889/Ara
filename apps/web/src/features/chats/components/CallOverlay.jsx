import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { UserAvatar } from '../../../shared/ui/Avatar.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import {
  playCallAcceptedTone,
  playCallEndedTone,
  startCallTone,
  startIncomingCallTone,
} from '../callTone.js';

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function useCallDuration(startedAt) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt ? formatDuration(Math.max(0, Math.floor((now - startedAt) / 1000))) : '00:00';
}

function useMediaElementStream(ref, stream, muted = false) {
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream ?? null;
    ref.current.muted = muted;
  }, [muted, ref, stream]);
}

function StreamAudio({ stream }) {
  const ref = useRef(null);
  useMediaElementStream(ref, stream, false);
  return <audio ref={ref} autoPlay playsInline />;
}

function StreamVideo({ className, stream, muted = false }) {
  const ref = useRef(null);
  useMediaElementStream(ref, stream, muted);
  return <video className={className} ref={ref} autoPlay muted={muted} playsInline />;
}

function hasVideo(stream) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
}

function AudioVisual({ peer, title, callModeLabel, subtitle }) {
  return (
    <div className="call-visual">
      <div className="call-hero">
        <div className="call-avatar-orbit">
          <span className="call-wave one" />
          <span className="call-wave two" />
          <span className="call-wave three" />
          <UserAvatar profile={peer} fallback={title[0] || 'N'} />
        </div>
        <div className="call-hero-copy">
          <p>{callModeLabel}</p>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
      </div>
    </div>
  );
}

function CallControl({ active = false, children, className = '', label, onClick, type = 'button' }) {
  return (
    <button className={`call-control-button ${active ? 'active' : ''} ${className}`.trim()} type={type} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

export function CallOverlay({ call, peer, chatId, t }) {
  const navigate = useNavigate();
  const duration = useCallDuration(call.startedAt);
  const [isMinimized, setIsMinimized] = useState(false);
  const isVisible = call.callState !== 'idle';
  const isPreview = call.callState === 'preview';
  const isIncoming = call.callState === 'incoming';
  const isOutgoingRinging = call.callState === 'calling';
  const isActive = call.callState === 'active' || call.callState === 'connecting';
  const isVideoCall = call.callType === 'video';
  const showRemoteVideo = isVideoCall && hasVideo(call.remoteStream);
  const showLocalVideo = isVideoCall && call.isVideoEnabled && hasVideo(call.localStream);
  const previousCallStateRef = useRef(call.callState);
  const title = peer?.display_name || peer?.username || t('chats.directChat');
  const subtitle = call.statusText || (isActive ? t('calls.connected') : t('calls.calling'));
  const callModeLabel = isVideoCall ? t('calls.videoLabel') : t('calls.audioLabel');

  useEffect(() => {
    if (!isOutgoingRinging) return undefined;
    return startCallTone();
  }, [isOutgoingRinging]);

  useEffect(() => {
    if (!isIncoming) return undefined;
    return startIncomingCallTone();
  }, [isIncoming]);

  useEffect(() => {
    const previousCallState = previousCallStateRef.current;
    previousCallStateRef.current = call.callState;

    if (call.callState === 'connecting' && ['calling', 'incoming'].includes(previousCallState)) {
      playCallAcceptedTone();
    }
    if (call.callState === 'idle' && previousCallState !== 'idle') {
      playCallEndedTone();
    }
  }, [call.callState]);

  useEffect(() => {
    if (call.callState === 'idle') setIsMinimized(false);
  }, [call.callState]);

  useEffect(() => {
    if (call.callState === 'active' && !isVideoCall) setIsMinimized(true);
  }, [call.callState, isVideoCall]);

  if (!isVisible) return null;

  return (
    <>
      {!showRemoteVideo && call.remoteStream ? <StreamAudio stream={call.remoteStream} /> : null}
      {isMinimized ? (
        <aside className="call-mini-player" aria-label={t('calls.title')}>
          <button className="call-mini-player-main" type="button" onClick={() => setIsMinimized(false)} aria-label={t('calls.expand')}>
            <span className={`call-live-dot ${isActive ? 'active' : ''}`} aria-hidden="true" />
            <span className="call-mini-player-copy">
              <strong>{title}</strong>
              <span>{duration} · {subtitle}</span>
            </span>
          </button>
          {chatId ? <button className="call-mini-player-action" type="button" onClick={() => navigate(`/app/chats/${chatId}`)} aria-label={t('calls.openChat')} title={t('calls.openChat')}><Icon name="chat" size={18} /></button> : null}
          {!isIncoming ? <button className={`call-mini-player-action ${call.isMuted ? 'active' : ''}`} type="button" onClick={call.toggleMute} aria-label={call.isMuted ? t('calls.unmute') : t('calls.mute')} title={call.isMuted ? t('calls.unmute') : t('calls.mute')}><Icon name={call.isMuted ? 'microphoneOff' : 'microphone'} size={18} /></button> : null}
          <button className="call-mini-player-action hangup" type="button" onClick={call.endCall} aria-label={t('calls.hangUp')} title={t('calls.hangUp')}><Icon name="phoneOff" size={18} /></button>
        </aside>
      ) : (
        <div className={`call-overlay ${isVideoCall ? 'video-call-overlay' : ''}`} role="dialog" aria-modal="true" aria-label={isVideoCall ? t('calls.videoTitle') : t('calls.title')}>
          <div className="call-stage" aria-hidden="true"><span /><span /><span /></div>
          <section className={`call-card ${isVideoCall ? 'video-call-card' : 'audio-only'}`}>
            <div className="call-card-glow" aria-hidden="true" />
            <header className="call-topbar">
              <div className="call-peer-compact">
                <span className={`call-live-dot ${isActive ? 'active' : ''}`} aria-hidden="true" />
                <div>
                  <span>{isIncoming ? t('calls.incomingLabel') : callModeLabel}</span>
                  <strong>{isIncoming ? t('calls.waitingForAnswer') : subtitle}</strong>
                </div>
              </div>
              {!isPreview ? <div className="call-duration-pill" aria-label={`${t('calls.duration')}: ${duration}`}>{duration}</div> : null}
              {!isIncoming && !isPreview ? <button className="call-minimize-button" type="button" onClick={() => setIsMinimized(true)} aria-label={t('calls.minimize')} title={t('calls.minimize')}><Icon name="arrowRight" size={18} /></button> : null}
            </header>

            {isVideoCall ? (
              <div className="video-call-content">
                <div className={`remote-video-stage ${showRemoteVideo ? 'has-video' : ''}`}>
                  {showRemoteVideo ? <StreamVideo className="call-remote-video" stream={call.remoteStream} /> : <AudioVisual peer={peer} title={title} callModeLabel={callModeLabel} subtitle={isPreview ? t('calls.readyToStart') : subtitle} />}
                  <div className="remote-video-meta">
                    <span className={`call-live-dot ${isActive ? 'active' : ''}`} aria-hidden="true" />
                    <strong>{title}</strong>
                  </div>
                  <div className={`local-video-preview ${showLocalVideo ? 'has-video' : ''}`}>
                    {showLocalVideo ? <StreamVideo className="call-local-video" stream={call.localStream} muted /> : <div className="local-video-off"><Icon name="videoOff" size={20} /><span>{t('calls.cameraOff')}</span></div>}
                    <span className="local-video-label">{t('calls.you')}</span>
                  </div>
                </div>
                {isPreview ? <p className="video-preview-hint">{t('calls.previewHint')}</p> : null}
              </div>
            ) : (
              <div className="call-content"><AudioVisual peer={peer} title={title} callModeLabel={callModeLabel} subtitle={subtitle} /></div>
            )}

            <footer className="call-controls" aria-label={t('calls.controls')}>
              {isPreview ? (
                <>
                  <CallControl active={call.isMuted} label={call.isMuted ? t('calls.unmute') : t('calls.mute')} onClick={call.toggleMute}><span><Icon name={call.isMuted ? 'microphoneOff' : 'microphone'} size={22} /></span><small>{call.isMuted ? t('calls.unmuteShort') : t('calls.muteShort')}</small></CallControl>
                  <CallControl active={!call.isVideoEnabled} label={call.isVideoEnabled ? t('calls.turnCameraOff') : t('calls.turnCameraOn')} onClick={() => void call.toggleVideo()}><span><Icon name={call.isVideoEnabled ? 'video' : 'videoOff'} size={22} /></span><small>{call.isVideoEnabled ? t('calls.cameraShort') : t('calls.cameraOffShort')}</small></CallControl>
                  <CallControl className="accept" label={t('calls.startVideo')} onClick={() => void call.startVideoCall()}><span><Icon name="video" size={22} /></span><small>{t('calls.startShort')}</small></CallControl>
                  <CallControl className="hangup" label={t('common.close')} onClick={call.endCall}><span><Icon name="x" size={22} /></span><small>{t('common.close')}</small></CallControl>
                </>
              ) : isIncoming ? (
                <>
                  <CallControl className="decline" label={t('calls.reject')} onClick={call.rejectCall}><span><Icon name="x" size={22} /></span><small>{t('calls.reject')}</small></CallControl>
                  {isVideoCall ? <CallControl label={t('calls.answerAudio')} onClick={() => void call.acceptCall({ withVideo: false })}><span><Icon name="phone" size={21} /></span><small>{t('calls.audioShort')}</small></CallControl> : null}
                  <CallControl className="accept" label={isVideoCall ? t('calls.answerVideo') : t('calls.accept')} onClick={() => void call.acceptCall({ withVideo: isVideoCall })}><span><Icon name={isVideoCall ? 'video' : 'phone'} size={21} /></span><small>{isVideoCall ? t('calls.videoShort') : t('calls.accept')}</small></CallControl>
                </>
              ) : (
                <>
                  <CallControl active={call.isMuted} label={call.isMuted ? t('calls.unmute') : t('calls.mute')} onClick={call.toggleMute}><span><Icon name={call.isMuted ? 'microphoneOff' : 'microphone'} size={22} /></span><small>{call.isMuted ? t('calls.unmuteShort') : t('calls.muteShort')}</small></CallControl>
                  {isVideoCall ? <CallControl active={!call.isVideoEnabled} label={call.isVideoEnabled ? t('calls.turnCameraOff') : t('calls.turnCameraOn')} onClick={() => void call.toggleVideo()}><span><Icon name={call.isVideoEnabled ? 'video' : 'videoOff'} size={22} /></span><small>{call.isVideoEnabled ? t('calls.cameraShort') : t('calls.cameraOffShort')}</small></CallControl> : null}
                  <CallControl className="hangup" label={t('calls.hangUp')} onClick={call.endCall}><span><Icon name="phoneOff" size={22} /></span><small>{t('calls.hangUp')}</small></CallControl>
                </>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
