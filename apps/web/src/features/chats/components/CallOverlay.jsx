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

export function CallOverlay({ call, peer, chatId, t }) {
  const navigate = useNavigate();
  const duration = useCallDuration(call.startedAt);
  const [isMinimized, setIsMinimized] = useState(false);
  const isVisible = call.callState !== 'idle';
  const isIncoming = call.callState === 'incoming';
  const isOutgoingRinging = call.callState === 'calling';
  const isActive = call.callState === 'active' || call.callState === 'connecting';
  const previousCallStateRef = useRef(call.callState);
  const title = peer?.display_name || peer?.username || t('chats.directChat');
  const subtitle = call.statusText || (isActive ? t('calls.connected') : t('calls.calling'));
  const callModeLabel = isIncoming ? t('calls.incomingLabel') : t('calls.audioLabel');

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
    if (call.callState === 'active') setIsMinimized(true);
  }, [call.callState]);

  if (!isVisible) return null;

  return (
    <>
      {call.remoteStream ? <StreamAudio stream={call.remoteStream} /> : null}
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
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label={t('calls.title')}>
      <div className="call-stage" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <section className="call-card audio-only">
        <div className="call-card-glow" aria-hidden="true" />
        <header className="call-topbar">
          <div className="call-peer-compact">
            <span className={`call-live-dot ${isActive ? 'active' : ''}`} aria-hidden="true" />
            <div>
              <span>{callModeLabel}</span>
              <strong>{isIncoming ? t('calls.waitingForAnswer') : subtitle}</strong>
            </div>
          </div>
          <div className="call-duration-pill" aria-label={`${t('calls.duration')}: ${duration}`}>{duration}</div>
          {!isIncoming ? <button className="call-minimize-button" type="button" onClick={() => setIsMinimized(true)} aria-label={t('calls.minimize')} title={t('calls.minimize')}><Icon name="arrowRight" size={18} /></button> : null}
        </header>

          <div className="call-content">
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
          </div>

        <footer className="call-controls" aria-label={t('calls.controls')}>
          {isIncoming ? (
            <>
              <button className="call-control-button decline" type="button" onClick={call.rejectCall} disabled={!call.canSignalCall} aria-label={t('calls.reject')}>
                <span aria-hidden="true"><Icon name="x" size={22} /></span>
                <small>{t('calls.reject')}</small>
              </button>
              <button className="call-control-button accept" type="button" onClick={call.acceptCall} disabled={!call.canSignalCall} aria-label={t('calls.accept')}>
                <span aria-hidden="true"><Icon name="phone" size={21} /></span>
                <small>{t('calls.accept')}</small>
              </button>
            </>
          ) : (
            <>
              <button className={`call-control-button ${call.isMuted ? 'active' : ''}`} type="button" onClick={call.toggleMute} aria-label={call.isMuted ? t('calls.unmute') : t('calls.mute')}>
                <span aria-hidden="true"><Icon name={call.isMuted ? 'microphoneOff' : 'microphone'} size={22} /></span>
                <small>{call.isMuted ? t('calls.unmuteShort') : t('calls.muteShort')}</small>
              </button>
              <button className="call-control-button hangup" type="button" onClick={call.endCall} aria-label={t('calls.hangUp')}>
                <span aria-hidden="true"><Icon name="phoneOff" size={22} /></span>
                <small>{t('calls.hangUp')}</small>
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
      )}
    </>
  );
}
