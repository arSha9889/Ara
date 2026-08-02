import { Link, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';

const REGIONS = [
  { id: 'RU', flag: '🇷🇺', language: 'ru' },
  { id: 'KZ', flag: '🇰🇿', languages: ['kk', 'ru'] },
  { id: 'KG', flag: '🇰🇬', languages: ['ky', 'ru'] },
  { id: 'UA', flag: '🇺🇦', languages: ['uk', 'ru'] },
  { id: 'BY', flag: '🇧🇾', languages: ['be', 'ru'] },
  { id: 'UZ', flag: '🇺🇿', languages: ['uz', 'ru'] },
  { id: 'GLOBAL', flag: '🌍', language: 'en' },
];

export function RegionSelectionPage() {
  const { setLanguage, t } = useI18n();
  const navigate = useNavigate();

  function continueRegistration(region, language) {
    localStorage.setItem('nexus_registration_country', region.id);
    setLanguage(language);
    navigate('/register', { state: { country: region.id, language } });
  }

  return (
    <main className="auth-page region-selection-page">
      <section className="panel region-selection-panel">
        <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" /><span>AraChat</span></Link>
        <div className="region-selection-copy">
          <p className="eyebrow">AraChat</p>
          <h1>{t('region.title')}</h1>
          <p className="muted">{t('region.text')}</p>
        </div>
        <div className="region-selection-list" role="list">
          {REGIONS.map((region) => (
            <article className="region-selection-item" key={region.id} role="listitem">
              <span className="region-selection-flag" aria-hidden="true">{region.flag}</span>
              <div>
                <h2>{t(`region.${region.id}.title`)}</h2>
                <p>{t(`region.${region.id}.text`)}</p>
              </div>
              <div className="region-selection-actions">
                {(region.languages ?? [region.language]).map((language) => (
                  <button key={language} type="button" className="button button-secondary" onClick={() => continueRegistration(region, language)}>
                    {t(`region.languages.${language}`)}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
        <Link className="auth-switch-link" to="/login">{t('region.alreadyRegistered')}</Link>
      </section>
    </main>
  );
}
