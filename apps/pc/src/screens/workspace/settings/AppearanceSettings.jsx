import { WorkspaceIcon as Icon } from '../../../components/WorkspaceIcon.jsx';
import { SUPPORTED_LANGUAGES } from '../../../i18n/copy.js';

const COLOR_PALETTES = ['green', 'cyan', 'yellow', 'orange'];

function LanguageFlag({ flag }) {
  if (flag === 'ru') {
    return <svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#fff" d="M0 0h30v6.67H0z" /><path fill="#1f57a6" d="M0 6.67h30v6.66H0z" /><path fill="#d9444c" d="M0 13.33h30V20H0z" /></svg>;
  }

  if (flag === 'kz') {
    return <svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#00afca" d="M0 0h30v20H0z" /><circle cx="16" cy="10" r="4.2" fill="#f9d648" /><path fill="#f9d648" d="M0 0h2v20H0zm3 0h1v20H3zM5 0h1v20H5z" /></svg>;
  }

  return <svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#fff" d="M0 0h30v20H0z" />{[0, 3, 6, 9, 12, 15, 18].map((y) => <path d={`M0 ${y}h30v1.54H0z`} fill="#b22234" key={y} />)}<path fill="#3c3b6e" d="M0 0h13.5v10.77H0z" /></svg>;
}

export function AppearanceSettings({ density, onPreferenceChange, preferences, t }) {
  return (
    <div className="settings-content">
      <div className="workspace-section-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.appearanceTitle')}</h2><p>{t('workspace.settingsPanel.appearanceText')}</p></div></div>
        <div className="setting-control-block">
          <strong>{t('workspace.settingsPanel.theme')}</strong>
          <div className="theme-choice-grid">
            {['light', 'dark'].map((theme) => <button className={`theme-choice theme-choice-${theme} ${preferences.theme === theme ? 'is-selected' : ''}`} type="button" key={theme} aria-pressed={preferences.theme === theme} onClick={() => onPreferenceChange({ theme })}><span aria-hidden="true" /><b>{t(`common.${theme}`)}</b><i><Icon name="check" size={13} /></i></button>)}
          </div>
          <div className="color-palette-control">
            <strong>{t('workspace.settingsPanel.colorPalette')}</strong>
            <p>{t('workspace.settingsPanel.colorPaletteText')}</p>
            <div className="color-palette-choice-grid" role="group" aria-label={t('workspace.settingsPanel.colorPalette')}>
              {COLOR_PALETTES.map((palette) => {
                const isSelected = preferences.colorPalette === palette;
                return <button className={`color-palette-choice color-palette-choice-${palette} ${isSelected ? 'is-selected' : ''}`} type="button" key={palette} aria-pressed={isSelected} onClick={() => onPreferenceChange({ colorPalette: palette })}><span className="color-palette-swatch" aria-hidden="true" /><b>{t(`workspace.settingsPanel.palette${palette[0].toUpperCase()}${palette.slice(1)}`)}</b><i aria-hidden="true"><Icon name="check" size={13} /></i></button>;
              })}
            </div>
          </div>
        </div>
        <fieldset className="setting-control-block language-choice-group">
          <legend>{t('workspace.settingsPanel.language')}</legend>
          <p id="language-choice-description">{t('workspace.settingsPanel.languageText')}</p>
          <div className="language-choice-list">
            {SUPPORTED_LANGUAGES.map((language) => {
              const isSelected = preferences.language === language.id;
              return (
                <label className={`language-choice ${isSelected ? 'is-selected' : ''}`} key={language.id}>
                  <input type="radio" name="language" value={language.id} checked={isSelected} onChange={() => onPreferenceChange({ language: language.id })} aria-describedby="language-choice-description" />
                  <span className="language-choice-flag"><LanguageFlag flag={language.flag} /></span>
                  <span className="language-choice-copy"><strong>{language.label}</strong><small>{language.id.toUpperCase()}</small></span>
                  <span className="language-choice-state" aria-hidden="true"><Icon name="check" size={15} /></span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="workspace-section-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.densityTitle')}</h2><p>{t('workspace.settingsPanel.densityText')}</p></div></div>
        <div className="density-choices">
          {['comfortable', 'compact'].map((value) => <button className={density === value ? 'is-selected' : ''} type="button" key={value} aria-pressed={density === value} onClick={() => onPreferenceChange({ density: value })}><span className={`density-preview density-preview-${value}`} aria-hidden="true"><i /><i /><i /></span><span><strong>{t(`workspace.settingsPanel.${value}`)}</strong><small>{t(`workspace.settingsPanel.${value}Text`)}</small></span><Icon name="check" size={17} /></button>)}
        </div>
      </div>
    </div>
  );
}
