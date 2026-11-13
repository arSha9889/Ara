import { AraButton } from '../../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../../components/WorkspaceIcon.jsx';
import { openLegalDocument } from '../../../features/legal/openLegalDocument.js';

function updateStatus(t, updateState) {
  switch (updateState.phase) {
    case 'checking':
      return t('workspace.settingsPanel.updatesChecking');
    case 'up-to-date':
      return t('workspace.settingsPanel.updatesUpToDate');
    case 'available':
      return t('workspace.settingsPanel.updatesAvailable', { version: updateState.update?.version });
    case 'downloading':
      return updateState.progress === null
        ? t('workspace.settingsPanel.updatesDownloading')
        : t('workspace.settingsPanel.updatesDownloadProgress', { progress: updateState.progress });
    case 'ready':
      return t('workspace.settingsPanel.updatesReady');
    case 'restarting':
      return t('workspace.settingsPanel.updatesRestarting');
    case 'unavailable':
      return t('workspace.settingsPanel.updatesUnavailable');
    case 'error':
      return t('workspace.settingsPanel.updatesError');
    default:
      return t('workspace.settingsPanel.updatesStatus');
  }
}

function updateTone(phase) {
  if (phase === 'up-to-date' || phase === 'ready') return 'success';
  if (phase === 'available') return 'accent';
  if (phase === 'error' || phase === 'unavailable') return 'warning';
  return 'neutral';
}

export function AboutSettings({
  appVersion,
  isLoadingAppVersion,
  onCheckForUpdate,
  onDownloadUpdate,
  onRestartAfterUpdate,
  t,
  updateState,
}) {
  const versionText = isLoadingAppVersion
    ? t('workspace.settingsPanel.versionLoading')
    : appVersion || t('workspace.settingsPanel.versionUnavailable');
  const isChecking = updateState.phase === 'checking';
  const isDownloading = updateState.phase === 'downloading';
  const isRestarting = updateState.phase === 'restarting';
  const isBusy = isChecking || isDownloading || isRestarting;

  return (
    <div className="settings-content settings-about-content">
      <section className="workspace-section-card settings-about-card" aria-labelledby="settings-about-title">
        <div className="workspace-section-heading"><div><h2 id="settings-about-title">{t('workspace.settingsPanel.aboutTitle')}</h2><p>{t('workspace.settingsPanel.aboutText')}</p></div></div>
        <div className="settings-about-version"><div><strong>{t('workspace.settingsPanel.version')}</strong><output aria-live="polite">{versionText}</output></div></div>
      </section>
      <section className="workspace-section-card settings-about-card" aria-labelledby="settings-updates-title">
        <div className="workspace-section-heading"><div><h2 id="settings-updates-title">{t('workspace.settingsPanel.updatesTitle')}</h2><p>{t('workspace.settingsPanel.updatesText')}</p></div></div>
        <div className="settings-update-status" data-tone={updateTone(updateState.phase)} role="status" aria-live="polite">
          <Icon name={updateState.phase === 'error' || updateState.phase === 'unavailable' ? 'warning' : updateState.phase === 'up-to-date' || updateState.phase === 'ready' ? 'check' : updateState.phase === 'idle' ? 'info' : 'refresh'} size={16} />
          <span>{updateStatus(t, updateState)}</span>
        </div>
        {isDownloading ? <div className="settings-update-progress" role="progressbar" aria-label={t('workspace.settingsPanel.updatesDownloading')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={updateState.progress ?? undefined} aria-valuetext={updateStatus(t, updateState)}><span style={{ width: `${updateState.progress ?? 0}%` }} /></div> : null}
        <div className="settings-update-actions">
          {updateState.phase === 'available' ? <AraButton type="button" variant="primary" onClick={onDownloadUpdate}><Icon name="refresh" size={16} />{t('workspace.settingsPanel.updatesDownload')}</AraButton> : null}
          {updateState.phase === 'ready' ? <AraButton type="button" variant="primary" onClick={onRestartAfterUpdate}><Icon name="refresh" size={16} />{t('workspace.settingsPanel.updatesRestart')}</AraButton> : null}
          {updateState.phase !== 'available' && updateState.phase !== 'ready' && updateState.phase !== 'unavailable' ? <AraButton type="button" variant="secondary" disabled={isBusy} onClick={onCheckForUpdate}><Icon name="refresh" size={16} />{isChecking ? t('workspace.settingsPanel.updatesChecking') : t('workspace.settingsPanel.updatesCheck')}</AraButton> : null}
        </div>
      </section>
      <section className="workspace-section-card settings-about-card" aria-labelledby="settings-legal-title">
        <div className="workspace-section-heading"><div><h2 id="settings-legal-title">{t('workspace.settingsPanel.legalDocumentsTitle')}</h2><p>{t('workspace.settingsPanel.legalDocumentsText')}</p></div></div>
        <div className="settings-legal-links">
          <AraButton type="button" variant="secondary" onClick={() => void openLegalDocument('privacy')}><Icon name="document" size={16} />{t('workspace.settingsPanel.openPrivacyPolicy')}</AraButton>
          <AraButton type="button" variant="secondary" onClick={() => void openLegalDocument('terms')}><Icon name="document" size={16} />{t('workspace.settingsPanel.openTerms')}</AraButton>
        </div>
      </section>
    </div>
  );
}
