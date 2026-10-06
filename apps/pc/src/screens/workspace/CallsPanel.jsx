import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

export function CallsPanel({ call, t }) {
  const isCallActive = call.callState !== 'idle';
  const signalingStatus = call.canSignalCall
    ? t('workspace.callsPanel.connected')
    : t('workspace.callsPanel.disconnected');
  const mediaStatus = call.canUseCalls
    ? t('workspace.callsPanel.available')
    : t('workspace.callsPanel.unsupported');

  return (
    <section className="workspace-detail-panel workspace-calls-panel" aria-labelledby="calls-title">
      <header className="workspace-panel-heading">
        <div>
          <p>{t('workspace.callsPanel.kicker')}</p>
          <h1 id="calls-title">{t('workspace.callsPanel.title')}</h1>
          <span>{t('workspace.callsPanel.intro')}</span>
        </div>
        <span className="workspace-panel-icon"><Icon name="calls" size={25} /></span>
      </header>

      <section className="call-start-card" aria-labelledby="call-start-title">
        <span className="call-start-icon" aria-hidden="true"><Icon name="calls" size={27} /></span>
        <div>
          <h2 id="call-start-title">{t('workspace.callsPanel.startTitle')}</h2>
          <p>{t('workspace.callsPanel.startText')}</p>
        </div>
      </section>

      {isCallActive ? <div className="call-active-notice" role="status" aria-live="polite">
        <Icon name={call.callType === 'video' ? 'video' : 'calls'} size={18} />
        <div><strong>{t('workspace.callsPanel.activeCall')}</strong><span>{call.statusText || t('workspace.callsPanel.connecting')}</span></div>
      </div> : null}

      <div className="workspace-section-card call-availability-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.callsPanel.availabilityTitle')}</h2><p>{t('workspace.callsPanel.availabilityText')}</p></div></div>
        <ul className="call-readiness-list">
          <li><span className="readiness-icon"><Icon name="calls" size={17} /></span><div><strong>{t('workspace.callsPanel.signaling')}</strong><span>{t('workspace.callsPanel.signalingText')}</span></div><em className={call.canSignalCall ? 'is-ready' : ''}>{signalingStatus}</em></li>
          <li><span className="readiness-icon"><Icon name="mic" size={17} /></span><div><strong>{t('workspace.callsPanel.microphone')}</strong><span>{t('workspace.callsPanel.microphoneText')}</span></div><em className={call.canUseCalls ? 'is-ready' : 'is-unavailable'}>{mediaStatus}</em></li>
          <li><span className="readiness-icon"><Icon name="camera" size={17} /></span><div><strong>{t('workspace.callsPanel.camera')}</strong><span>{t('workspace.callsPanel.cameraText')}</span></div><em className={call.canUseCalls ? 'is-ready' : 'is-unavailable'}>{mediaStatus}</em></li>
        </ul>
      </div>
    </section>
  );
}
