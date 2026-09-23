import { useDensity } from '../../app/providers/DensityProvider.jsx';
import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { Icon } from './Icon.jsx';

const densityOptions = [
  { id: 'comfortable', icon: 'layoutComfortable' },
  { id: 'compact', icon: 'layoutCompact' },
];

export function DensitySwitcher() {
  const { t } = useI18n();
  const { preference, effectiveDensity, isFallback, setDensityPreference } = useDensity();

  return (
    <section className="density-card" aria-labelledby="density-title">
      <div className="density-heading">
        <span className="density-heading-icon" aria-hidden="true"><Icon name="layoutComfortable" size={20} /></span>
        <div>
          <h3 id="density-title">{t('settings.density')}</h3>
          <p>{t('settings.densityText')}</p>
        </div>
      </div>
      <div className="density-options" role="radiogroup" aria-label={t('settings.density')}>
        {densityOptions.map((option) => {
          const isSelected = preference === option.id;
          return (
            <button
              className={`density-option ${isSelected ? 'active' : ''}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              key={option.id}
              onClick={() => setDensityPreference(option.id)}
            >
              <Icon name={option.icon} size={19} />
              <span>{t(`settings.densityOptions.${option.id}`)}</span>
              {isSelected ? <Icon className="density-option-check" name="check" size={15} strokeWidth={2.4} /> : null}
            </button>
          );
        })}
      </div>
      <p className={`density-status ${isFallback ? 'fallback' : ''}`} role="status" aria-live="polite">
        <Icon name={isFallback ? 'smartphone' : 'check'} size={15} />
        <span>{isFallback ? t('settings.densityMobileFallback') : t('settings.densityCurrent')} <strong>{t(`settings.densityOptions.${effectiveDensity}`)}</strong></span>
      </p>
    </section>
  );
}
