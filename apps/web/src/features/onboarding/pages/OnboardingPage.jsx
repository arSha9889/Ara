import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';

const PHONE_COUNTRIES = [
  { code: 'RU', dialCode: '+7', flag: '🇷🇺', labelKey: 'phoneCountryRussia', example: '+7 999 123-45-67' },
  { code: 'KZ', dialCode: '+7', flag: '🇰🇿', labelKey: 'phoneCountryKazakhstan', example: '+7 701 123-45-67' },
];

export function OnboardingPage() {
  const { t } = useI18n();

  return (
    <main className="auth-page onboard-page">
      <section className="panel readable onboard-panel">
        <header className="landing-topbar onboard-topbar">
          <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" /><span>Nexus</span></Link>
          <div className="landing-switchers">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="onboard-copy">
          <p className="eyebrow">{t('onboarding.onboardEyebrow')}</p>
          <h1>{t('onboarding.onboardTitle')}</h1>
          <p className="muted">{t('onboarding.onboardText')}</p>
        </div>

        <div className="country-picker onboard-country-picker" role="list" aria-label={t('register.phoneCountry')}>
          {PHONE_COUNTRIES.map((country) => (
            <Link className="country-option onboard-country-option" to={`/register?country=${country.code}`} key={country.code} role="listitem">
              <span className="country-option-flag" aria-hidden="true">{country.flag}</span>
              <span className="country-option-copy">
                <strong>{t(`register.${country.labelKey}`)}</strong>
                <small>{country.dialCode} · {country.example}</small>
              </span>
              <span className="country-option-check" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        <div className="onboard-actions">
          <Link className="button button-secondary" to="/login">{t('auth.signIn')}</Link>
          <Link className="button button-secondary" to="/">{t('onboarding.backToLanding')}</Link>
        </div>
      </section>
    </main>
  );
}

