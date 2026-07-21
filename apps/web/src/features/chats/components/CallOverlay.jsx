import { useEffect, useRef, useState } from 'react';

import { UserAvatar } from '../../../shared/ui/Avatar.jsx';

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

function StreamVideo({ className, label, muted, stream }) {
  const ref = useRef(null);
  useMediaElementStream(ref, stream, muted);

  return (
    <video
      ref={ref}
      className={className}
      aria-label={label}
      autoPlay
      playsInline
    />
  );
}

export function CallOverlay({ call, peer, t }) {
  const duration = useCallDuration(call.startedAt);
  const isVisible = call.callState !== 'idle';
  const isIncoming = call.callState === 'incoming';
  const isActive = call.callState === 'active' || call.callState === 'connecting';
  const remoteVideoTracks = call.remoteStream?.getVideoTracks() ?? [];
  const hasRemoteScreen = remoteVideoTracks.some((track) => track.readyState === 'live');
  const title = peer?.display_name || peer?.username || t('chats.directChat');
  const subtitle = call.statusText || (isActive ? t('calls.connected') : t('calls.calling'));
  const callModeLabel = hasRemoteScreen ? t('calls.remoteScreen') : (isIncoming ? t('calls.incomingLabel') : t('calls.audioLabel'));

  if (!isVisible) return null;

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label={t('calls.title')}>
      <div className="call-stage" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {call.remoteStream ? <StreamAudio stream={call.remoteStream} /> : null}

      <section className={`call-card ${hasRemoteScreen ? 'with-screen' : 'audio-only'}`}>
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
        </header>

        <div className="call-content">
          <div className="call-visual">
            {hasRemoteScreen ? (
              <StreamVideo className="call-screen-video" label={t('calls.remoteScreen')} stream={call.remoteStream} muted />
            ) : (
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
            )}
          </div>

          <aside className="call-side-panel" aria-label={t('calls.hdScreen')}>
            {call.screenStream ? (
              <div className="call-local-preview">
                <StreamVideo className="call-local-video" label={t('calls.yourScreen')} stream={call.screenStream} muted />
                <span>{t('calls.youShareScreen')}</span>
              </div>
            ) : (
              <div className="call-screen-placeholder">
                <span aria-hidden="true">▣</span>
                <p>{t('calls.screenReady')}</p>
              </div>
            )}
          </aside>
        </div>

        <footer className="call-controls" aria-label={t('calls.controls')}>
          {isIncoming ? (
            <>
              <button className="call-control-button decline" type="button" onClick={call.rejectCall} aria-label={t('calls.reject')}>
                <span aria-hidden="true">✕</span>
                <small>{t('calls.reject')}</small>
              </button>
              <button className="call-control-button accept" type="button" onClick={call.acceptCall} aria-label={t('calls.accept')}>
                <span aria-hidden="true">✓</span>
                <small>{t('calls.accept')}</small>
              </button>
            </>
          ) : (
            <>
              <button className={`call-control-button ${call.isMuted ? 'active' : ''}`} type="button" onClick={call.toggleMute} aria-label={call.isMuted ? t('calls.unmute') : t('calls.mute')}>
                <span aria-hidden="true">{call.isMuted ? '⌁' : '🎙'}</span>
                <small>{call.isMuted ? t('calls.unmuteShort') : t('calls.muteShort')}</small>
              </button>
              <button className={`call-control-button ${call.isScreenSharing ? 'active' : ''}`} type="button" onClick={call.toggleScreenShare} disabled={!isActive} aria-label={call.isScreenSharing ? t('calls.stopScreen') : t('calls.shareScreen')}>
                <span aria-hidden="true">▣</span>
                <small>{call.isScreenSharing ? t('calls.stopScreenShort') : t('calls.screenShort')}</small>
              </button>
              <button className="call-control-button hangup" type="button" onClick={call.endCall} aria-label={t('calls.hangUp')}>
                <span aria-hidden="true">☎</span>
                <small>{t('calls.hangUp')}</small>
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
