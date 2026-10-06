import { useEffect, useRef, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

function initials(displayName, username) {
  const source = displayName || username || '?';
  return source.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function avatarTone(value) {
  const tones = ['violet', 'coral', 'blue', 'gold'];
  const score = [...String(value || '')].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return tones[score % tones.length];
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function useCallDuration(startedAt) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return undefined;
    const timerId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timerId);
  }, [startedAt]);

  return startedAt ? formatDuration(Math.max(0, Math.floor((now - startedAt) / 1_000))) : '00:00';
}

function StreamAudio({ stream }) {
  const elementRef = useRef(null);
  useEffect(() => {
    if (!elementRef.current) return;
    elementRef.current.srcObject = stream ?? null;
  }, [stream]);
  return <audio ref={elementRef} autoPlay playsInline />;
}

function StreamVideo({ className, stream, muted = false }) {
  const elementRef = useRef(null);
  useEffect(() => {
    if (!elementRef.current) return;
    elementRef.current.srcObject = stream ?? null;
    elementRef.current.muted = muted;
  }, [muted, stream]);
  return <video className={className} ref={elementRef} autoPlay muted={muted} playsInline />;
}

function hasLiveVideo(stream) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden'));
}

function CallControl({ active, children, className = '', label, onClick }) {
  return <button className={`desktop-call-control ${className}`} type="button" aria-label={label} {...(typeof active === 'boolean' ? { 'aria-pressed': active } : {})} onClick={onClick}>{children}</button>;
}

export function CallOverlay({ call, peer, t }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const { callState, endCall, rejectCall } = call;
  const callStateRef = useRef(callState);
  const endCallRef = useRef(endCall);
  const rejectCallRef = useRef(rejectCall);
  callStateRef.current = callState;
  endCallRef.current = endCall;
  rejectCallRef.current = rejectCall;
  const isVisible = callState !== 'idle';
  const isIncoming = callState === 'incoming';
  const isVideoCall = call.callType === 'video';
  const isActive = call.callState === 'active' || call.callState === 'connecting';
  const duration = useCallDuration(call.startedAt);
  const peerName = peer?.display_name || peer?.username || t('workspace.unknownUser');
  const peerUsername = peer?.username ? `@${peer.username}` : '';
  const showRemoteVideo = isVideoCall && hasLiveVideo(call.remoteStream);
  const showLocalVideo = isVideoCall && call.isVideoEnabled && hasLiveVideo(call.localStream);

  useEffect(() => {
    if (!isVisible) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => focusableElements(dialogRef.current)[0]?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (callStateRef.current === 'incoming') rejectCallRef.current();
        else endCallRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = focusableElements(dialogRef.current);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="desktop-call-overlay" role="presentation">
      {!showRemoteVideo && call.remoteStream ? <StreamAudio stream={call.remoteStream} /> : null}
      <section ref={dialogRef} className={`desktop-call-dialog ${isVideoCall ? 'is-video' : ''}`} role="dialog" aria-modal="true" aria-labelledby="desktop-call-title" aria-describedby="desktop-call-status">
        <header className="desktop-call-topbar">
          <span className={`desktop-call-live-dot ${isActive ? 'is-active' : ''}`} aria-hidden="true" />
          <span>{isIncoming ? t('workspace.callsPanel.incoming') : isVideoCall ? t('workspace.callsPanel.video') : t('workspace.callsPanel.audio')}</span>
          {!isIncoming ? <time aria-label={t('workspace.callsPanel.duration', { duration })}>{duration}</time> : null}
        </header>

        <div className={`desktop-call-media ${showRemoteVideo ? 'has-remote-video' : ''}`}>
          {showRemoteVideo ? <StreamVideo className="desktop-call-remote-video" stream={call.remoteStream} /> : (
            <div className="desktop-call-avatar-stage">
              <span className="desktop-call-avatar-orbit one" aria-hidden="true" />
              <span className="desktop-call-avatar-orbit two" aria-hidden="true" />
              <span className={`workspace-avatar workspace-avatar-large is-${avatarTone(peer?.id)}`} aria-hidden="true">{initials(peerName, peer?.username)}</span>
            </div>
          )}
          <div className="desktop-call-peer-copy">
            <h1 id="desktop-call-title">{peerName}</h1>
            {peerUsername ? <span>{peerUsername}</span> : null}
            <p id="desktop-call-status" role="status" aria-live="polite">{call.statusText || t('workspace.callsPanel.connecting')}</p>
          </div>
          {isVideoCall ? <div className={`desktop-call-local-video ${showLocalVideo ? 'has-video' : ''}`}>
            {showLocalVideo ? <StreamVideo className="desktop-call-local-video-element" stream={call.localStream} muted /> : <span><Icon name="camera" size={19} />{t('workspace.callsPanel.cameraOff')}</span>}
            <small>{t('workspace.callsPanel.you')}</small>
          </div> : null}
        </div>

        <footer className="desktop-call-controls" aria-label={t('workspace.callsPanel.controls')}>
          {isIncoming ? <>
            <CallControl className="is-decline" label={t('workspace.callsPanel.decline')} onClick={call.rejectCall}><Icon name="phone-off" size={21} /><span>{t('workspace.callsPanel.decline')}</span></CallControl>
            {isVideoCall ? <CallControl label={t('workspace.callsPanel.answerAudio')} onClick={() => void call.acceptCall({ withVideo: false })}><Icon name="calls" size={21} /><span>{t('workspace.callsPanel.answerAudio')}</span></CallControl> : null}
            <CallControl className="is-accept" label={isVideoCall ? t('workspace.callsPanel.answerVideo') : t('workspace.callsPanel.answer')} onClick={() => void call.acceptCall({ withVideo: isVideoCall })}><Icon name={isVideoCall ? 'video' : 'calls'} size={21} /><span>{isVideoCall ? t('workspace.callsPanel.answerVideo') : t('workspace.callsPanel.answer')}</span></CallControl>
          </> : <>
            <CallControl active={call.isMuted} label={call.isMuted ? t('workspace.callsPanel.unmute') : t('workspace.callsPanel.mute')} onClick={call.toggleMute}><Icon name={call.isMuted ? 'mic-off' : 'mic'} size={21} /><span>{call.isMuted ? t('workspace.callsPanel.unmute') : t('workspace.callsPanel.mute')}</span></CallControl>
            {isVideoCall ? <CallControl active={!call.isVideoEnabled} label={call.isVideoEnabled ? t('workspace.callsPanel.cameraOff') : t('workspace.callsPanel.cameraOn')} onClick={() => void call.toggleVideo()}><Icon name="camera" size={21} /><span>{call.isVideoEnabled ? t('workspace.callsPanel.cameraOff') : t('workspace.callsPanel.cameraOn')}</span></CallControl> : null}
            <CallControl className="is-end" label={call.callState === 'calling' ? t('workspace.callsPanel.cancel') : t('workspace.callsPanel.hangUp')} onClick={call.endCall}><Icon name="phone-off" size={21} /><span>{call.callState === 'calling' ? t('workspace.callsPanel.cancel') : t('workspace.callsPanel.hangUp')}</span></CallControl>
          </>}
        </footer>
      </section>
    </div>
  );
}
