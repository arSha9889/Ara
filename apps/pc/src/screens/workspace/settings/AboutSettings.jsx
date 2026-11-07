import { AraButton } from '../../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../../components/WorkspaceIcon.jsx';
import { openLegalDocument } from '../../../features/legal/openLegalDocument.js';

export function AboutSettings({ appVersion, isLoadingAppVersion, t }) {
  const versionText = isLoadingAppVersion
    ? t('workspace.settingsPanel.versionLoading')
    : appVersion || t('workspace.settingsPanel.versionUnavailable');

  return (
    <div className="settings-content settings-about-content">
      <section className="workspace-section-card settings-about-card" aria-labelledby="settings-about-title">
        <div className="workspace-section-heading"><div><h2 id="settings-about-title">{t('workspace.settingsPanel.aboutTitle')}</h2><p>{t('workspace.settingsPanel.aboutText')}</p></div></div>
        <div className="settings-about-version"><div><strong>{t('workspace.settingsPanel.version')}</strong><output aria-live="polite">{versionText}</output></div></div>
      </section>
      <section className="workspace-section-card settings-about-card" aria-labelledby="settings-updates-title">
        <div className="workspace-section-heading"><div><h2 id="settings-updates-title">{t('workspace.settingsPanel.updatesTitle')}</h2><p>{t('workspace.settingsPanel.updatesText')}</p></div></div>
        <p className="settings-update-status">{t('workspace.settingsPanel.updatesStatus')}</p>
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
