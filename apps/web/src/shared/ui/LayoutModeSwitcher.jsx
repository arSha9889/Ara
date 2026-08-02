import { useLayoutMode } from '../../app/providers/LayoutModeProvider.jsx';
import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { Icon } from './Icon.jsx';

const layoutOptions = [
  { id: 'auto', icon: 'layoutAuto' },
  { id: 'desktop', icon: 'monitor' },
  { id: 'tablet', icon: 'tablet' },
  { id: 'mobile', icon: 'smartphone' },
];

export function LayoutModeSwitcher() {
  const { t } = useI18n();
  const { preference, effectiveMode, isFallback, setLayoutPreference } = useLayoutMode();

  return (
    <section className="layout-mode-card" aria-labelledby="layout-mode-title">
      <div className="layout-mode-heading">
        <span className="layout-mode-heading-icon" aria-hidden="true"><Icon name="layoutAuto" size={20} /></span>
        <div>
          <h3 id="layout-mode-title">{t('settings.layoutMode')}</h3>
          <p>{t('settings.layoutModeText')}</p>
        </div>
      </div>
      <div className="layout-mode-options" role="radiogroup" aria-label={t('settings.layoutMode')}>
        {layoutOptions.map((option) => {
          const isSelected = preference === option.id;
          return (
            <button
              className={`layout-mode-option ${isSelected ? 'active' : ''}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              key={option.id}
              onClick={() => setLayoutPreference(option.id)}
            >
              <span className="layout-mode-option-icon" aria-hidden="true"><Icon name={option.icon} size={20} /></span>
              <span>{t(`settings.layoutModeOptions.${option.id}`)}</span>
              {isSelected ? <span className="layout-mode-option-check" aria-hidden="true"><Icon name="check" size={13} strokeWidth={2.4} /></span> : null}
            </button>
          );
        })}
      </div>
      <p className={`layout-mode-status ${isFallback ? 'fallback' : ''}`} role="status" aria-live="polite">
        <Icon name={isFallback ? 'activity' : 'check'} size={15} />
        <span>{isFallback ? t('settings.layoutModeFallback') : t('settings.layoutModeCurrent')} <strong>{t(`settings.layoutModeOptions.${effectiveMode}`)}</strong></span>
      </p>
    </section>
  );
}
