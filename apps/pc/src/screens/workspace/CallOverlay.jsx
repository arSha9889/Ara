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

function CallControl({ active, children, className = '', disabled = false, label, onClick, ...rest }) {
  return <button className={`desktop-call-control ${className}`} type="button" aria-label={label} disabled={disabled} {...(typeof active === 'boolean' ? { 'aria-pressed': active } : {})} onClick={onClick} {...rest}>{children}</button>;
}

export function CallOverlay({ call, peer, t }) {
  const dialogRef = useRef(null);
  const shareStudioRef = useRef(null);
  const previousFocusRef = useRef(null);
  const shareStudioOpenRef = useRef(false);
  const [isShareStudioOpen, setIsShareStudioOpen] = useState(false);
  const [shareSource, setShareSource] = useState('screen');
  const [shareAudioEnabled, setShareAudioEnabled] = useState(true);
  const [isStartingShare, setIsStartingShare] = useState(false);
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
  const remoteScreenIsActive = call.remoteShareState?.status === 'active';
  const remoteScreenIsPaused = call.remoteShareState?.status === 'paused';
  const showRemoteScreen = remoteScreenIsActive && hasLiveVideo(call.remoteScreenStream);
  const showRemoteCamera = isVideoCall && hasLiveVideo(call.remoteCameraStream);
  const showRemoteVideo = showRemoteScreen || showRemoteCamera;
  const showLocalVideo = isVideoCall && call.isVideoEnabled && hasLiveVideo(call.localStream);
  const isSharing = call.screenShareState?.status !== 'stopped';
  const isSharePaused = call.screenShareState?.status === 'paused';
  const sourceLabel = (source) => source === 'window'
    ? t('workspace.callsPanel.shareSourceWindow')
    : t('workspace.callsPanel.shareSourceScreen');

  shareStudioOpenRef.current = isShareStudioOpen;

  function openShareStudio() {
    if (!call.canShareScreen || call.callState !== 'active') return;
    call.clearScreenShareNotice?.();
    setShareSource(call.screenShareState?.source ?? 'screen');
    setShareAudioEnabled(call.screenShareState?.audioEnabled ?? true);
    setIsShareStudioOpen(true);
  }

  function closeShareStudio() {
    if (isStartingShare) return;
    setIsShareStudioOpen(false);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector('[data-share-trigger]')?.focus());
  }

  async function startShareFromStudio() {
    setIsStartingShare(true);
    const didStart = await call.startScreenShare({ source: shareSource, withAudio: shareAudioEnabled });
    setIsStartingShare(false);
    if (didStart) {
      setIsShareStudioOpen(false);
      window.requestAnimationFrame(() => dialogRef.current?.querySelector('[data-share-trigger]')?.focus());
    }
  }

  useEffect(() => {
    if (!isVisible) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => focusableElements(dialogRef.current)[0]?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (shareStudioOpenRef.current) closeShareStudio();
        else if (callStateRef.current === 'incoming') rejectCallRef.current();
        else endCallRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = focusableElements(shareStudioOpenRef.current ? shareStudioRef.current : dialogRef.current);
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

  useEffect(() => {
    if (!isShareStudioOpen) return undefined;
    const frameId = window.requestAnimationFrame(() => focusableElements(shareStudioRef.current)[0]?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [isShareStudioOpen]);

  if (!isVisible) return null;

  return (
    <div className="desktop-call-overlay" role="presentation">
      {call.remoteStream ? <StreamAudio stream={call.remoteStream} /> : null}
      <section ref={dialogRef} className={`desktop-call-dialog ${isVideoCall ? 'is-video' : ''} ${isShareStudioOpen ? 'is-share-studio-open' : ''}`} role="dialog" aria-modal={!isShareStudioOpen} aria-hidden={isShareStudioOpen} aria-labelledby="desktop-call-title" aria-describedby="desktop-call-status">
        <header className="desktop-call-topbar">
          <span className={`desktop-call-live-dot ${isActive ? 'is-active' : ''}`} aria-hidden="true" />
          <span>{isIncoming ? t('workspace.callsPanel.incoming') : isVideoCall ? t('workspace.callsPanel.video') : t('workspace.callsPanel.audio')}</span>
          {!isIncoming ? <time aria-label={t('workspace.callsPanel.duration', { duration })}>{duration}</time> : null}
        </header>

        <div className={`desktop-call-media ${showRemoteVideo ? 'has-remote-video' : ''} ${showRemoteScreen ? 'has-remote-screen' : ''}`}>
          {showRemoteScreen ? <StreamVideo className="desktop-call-remote-video" stream={call.remoteScreenStream} muted /> : showRemoteCamera ? <StreamVideo className="desktop-call-remote-video" stream={call.remoteCameraStream} muted /> : remoteScreenIsActive || remoteScreenIsPaused ? (
            <div className="desktop-share-waiting-stage">
              <Icon name="screen" size={32} />
              <strong>{remoteScreenIsPaused ? t('workspace.callsPanel.remoteSharePaused') : t('workspace.callsPanel.remoteSharePreparing')}</strong>
              <span>{sourceLabel(call.remoteShareState?.source)}</span>
            </div>
          ) : (
            <div className="desktop-call-avatar-stage">
              <span className="desktop-call-avatar-orbit one" aria-hidden="true" />
              <span className="desktop-call-avatar-orbit two" aria-hidden="true" />
              <span className={`workspace-avatar workspace-avatar-large is-${avatarTone(peer?.id)}`} aria-hidden="true">{initials(peerName, peer?.username)}</span>
            </div>
          )}
          <div className="desktop-call-peer-copy">
            <h1 id="desktop-call-title">{peerName}</h1>
            {peerUsername ? <span>{peerUsername}</span> : null}
            <p id="desktop-call-status" role="status" aria-live="polite">{remoteScreenIsActive || remoteScreenIsPaused ? t('workspace.callsPanel.remoteSharing', { source: sourceLabel(call.remoteShareState?.source) }) : call.statusText || t('workspace.callsPanel.connecting')}</p>
          </div>
          {remoteScreenIsActive || remoteScreenIsPaused ? <div className="desktop-share-remote-chip"><Icon name="screen" size={14} /><span>{sourceLabel(call.remoteShareState?.source)}</span>{call.remoteShareState?.audioEnabled ? <Icon name="speaker" size={14} /> : null}</div> : null}
          {isSharing ? <div className="desktop-share-local-preview">
            {hasLiveVideo(call.localScreenStream) ? <StreamVideo className="desktop-share-local-preview-video" stream={call.localScreenStream} muted /> : null}
            <span><Icon name="screen" size={15} />{isSharePaused ? t('workspace.callsPanel.sharePaused') : t('workspace.callsPanel.sharing')}</span>
          </div> : null}
          {isVideoCall ? <div className={`desktop-call-local-video ${showLocalVideo ? 'has-video' : ''}`}>
            {showLocalVideo ? <StreamVideo className="desktop-call-local-video-element" stream={call.localStream} muted /> : <span><Icon name="camera" size={19} />{t('workspace.callsPanel.cameraOff')}</span>}
            <small>{t('workspace.callsPanel.you')}</small>
          </div> : null}
        </div>

        {isSharing ? <section className="desktop-share-console" aria-label={t('workspace.callsPanel.shareConsole')}>
          <div className="desktop-share-console-source"><span className="desktop-share-console-icon"><Icon name="screen" size={18} /></span><span><strong>{sourceLabel(call.screenShareState?.source)}</strong><small>{isSharePaused ? t('workspace.callsPanel.sharePaused') : t('workspace.callsPanel.sharing')}</small></span></div>
          <button className="desktop-share-console-action" type="button" onClick={call.toggleScreenSharePaused}><Icon name={isSharePaused ? 'play' : 'pause'} size={17} /><span>{isSharePaused ? t('workspace.callsPanel.resumeShare') : t('workspace.callsPanel.pauseShare')}</span></button>
          <button className="desktop-share-console-action" type="button" onClick={openShareStudio}><Icon name="switch" size={17} /><span>{t('workspace.callsPanel.changeSource')}</span></button>
          <label className="desktop-share-console-volume"><Icon name={call.screenShareState?.audioEnabled ? 'speaker' : 'speaker-off'} size={17} /><span className="sr-only">{t('workspace.callsPanel.shareAudioVolume')}</span><input type="range" min="0" max="100" value={call.screenAudioLevel} onChange={(event) => call.setScreenShareAudioLevel(event.target.value)} disabled={!call.screenShareState?.audioEnabled} /><output>{call.screenAudioLevel}%</output></label>
          <button className="desktop-share-console-stop" type="button" onClick={() => void call.stopScreenShare()}><Icon name="screen" size={17} /><span>{t('workspace.callsPanel.stopShare')}</span></button>
          {call.screenShareNotice ? <p className="desktop-share-console-notice" role="status">{call.screenShareNotice}</p> : null}
        </section> : null}

        <footer className="desktop-call-controls" aria-label={t('workspace.callsPanel.controls')}>
          {isIncoming ? <>
            <CallControl className="is-decline" label={t('workspace.callsPanel.decline')} onClick={call.rejectCall}><Icon name="phone-off" size={21} /><span>{t('workspace.callsPanel.decline')}</span></CallControl>
            {isVideoCall ? <CallControl label={t('workspace.callsPanel.answerAudio')} onClick={() => void call.acceptCall({ withVideo: false })}><Icon name="calls" size={21} /><span>{t('workspace.callsPanel.answerAudio')}</span></CallControl> : null}
            <CallControl className="is-accept" label={isVideoCall ? t('workspace.callsPanel.answerVideo') : t('workspace.callsPanel.answer')} onClick={() => void call.acceptCall({ withVideo: isVideoCall })}><Icon name={isVideoCall ? 'video' : 'calls'} size={21} /><span>{isVideoCall ? t('workspace.callsPanel.answerVideo') : t('workspace.callsPanel.answer')}</span></CallControl>
          </> : <>
            <CallControl active={call.isMuted} label={call.isMuted ? t('workspace.callsPanel.unmute') : t('workspace.callsPanel.mute')} onClick={call.toggleMute}><Icon name={call.isMuted ? 'mic-off' : 'mic'} size={21} /><span>{call.isMuted ? t('workspace.callsPanel.unmute') : t('workspace.callsPanel.mute')}</span></CallControl>
            {isVideoCall ? <CallControl active={!call.isVideoEnabled} label={call.isVideoEnabled ? t('workspace.callsPanel.cameraOff') : t('workspace.callsPanel.cameraOn')} onClick={() => void call.toggleVideo()}><Icon name="camera" size={21} /><span>{call.isVideoEnabled ? t('workspace.callsPanel.cameraOff') : t('workspace.callsPanel.cameraOn')}</span></CallControl> : null}
            <CallControl active={isSharing} disabled={call.callState !== 'active' || !call.canShareScreen} label={isSharing ? t('workspace.callsPanel.stopShare') : t('workspace.callsPanel.startShare')} onClick={isSharing ? () => void call.stopScreenShare() : openShareStudio} data-share-trigger><Icon name="screen" size={21} /><span>{isSharing ? t('workspace.callsPanel.stopShare') : t('workspace.callsPanel.startShare')}</span></CallControl>
            <CallControl className="is-end" label={call.callState === 'calling' ? t('workspace.callsPanel.cancel') : t('workspace.callsPanel.hangUp')} onClick={call.endCall}><Icon name="phone-off" size={21} /><span>{call.callState === 'calling' ? t('workspace.callsPanel.cancel') : t('workspace.callsPanel.hangUp')}</span></CallControl>
          </>}
        </footer>
      </section>
      {isShareStudioOpen ? <section ref={shareStudioRef} className="desktop-share-studio" role="dialog" aria-modal="true" aria-labelledby="desktop-share-studio-title" aria-describedby="desktop-share-studio-description">
        <header className="desktop-share-studio-header"><span className="desktop-share-studio-mark"><Icon name="screen" size={21} /></span><div><h2 id="desktop-share-studio-title">{t('workspace.callsPanel.shareStudioTitle')}</h2><p id="desktop-share-studio-description">{t('workspace.callsPanel.shareStudioDescription')}</p></div><button type="button" aria-label={t('common.close')} onClick={closeShareStudio} disabled={isStartingShare}><Icon name="close" size={18} /></button></header>
        <fieldset className="desktop-share-source-options"><legend>{t('workspace.callsPanel.shareSourceLegend')}</legend><button className={`desktop-share-source-option ${shareSource === 'screen' ? 'is-selected' : ''}`} type="button" aria-pressed={shareSource === 'screen'} onClick={() => setShareSource('screen')} disabled={isStartingShare}><Icon name="screen" size={24} /><span><strong>{t('workspace.callsPanel.shareSourceScreen')}</strong><small>{t('workspace.callsPanel.shareSourceScreenHint')}</small></span><Icon name="check" size={18} /></button><button className={`desktop-share-source-option ${shareSource === 'window' ? 'is-selected' : ''}`} type="button" aria-pressed={shareSource === 'window'} onClick={() => setShareSource('window')} disabled={isStartingShare}><Icon name="camera" size={24} /><span><strong>{t('workspace.callsPanel.shareSourceWindow')}</strong><small>{t('workspace.callsPanel.shareSourceWindowHint')}</small></span><Icon name="check" size={18} /></button></fieldset>
        <label className="desktop-share-audio-option"><input type="checkbox" checked={shareAudioEnabled} onChange={(event) => setShareAudioEnabled(event.target.checked)} disabled={isStartingShare} /><span><Icon name="speaker" size={19} /></span><span><strong>{t('workspace.callsPanel.shareSystemAudio')}</strong><small>{t('workspace.callsPanel.shareSystemAudioHint')}</small></span></label>
        {call.screenShareNotice ? <p className="desktop-share-studio-notice" role="status">{call.screenShareNotice}</p> : null}
        <footer className="desktop-share-studio-footer"><button className="button-secondary" type="button" onClick={closeShareStudio} disabled={isStartingShare}>{t('common.cancel')}</button><button className="button-primary" type="button" onClick={() => void startShareFromStudio()} disabled={isStartingShare}>{isStartingShare ? t('workspace.callsPanel.shareStudioOpening') : t('workspace.callsPanel.chooseSource')}</button></footer>
      </section> : null}
    </div>
  );
}
