import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { TelegramLoginButton } from '../../auth/components/TelegramLoginButton.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';

export function OnboardingPage() {
  const { t } = useI18n();

  return (
    <main className="auth-page">
      <section className="hero-card">
        <div className="halo-ring" aria-hidden="true" />
        <img className="hero-logo" src="/icons/nexus-icon-512.png" alt="Nexus" />
        <p className="eyebrow">N-Web / v1</p>
        <h1>{t('onboarding.title')}</h1>
        <p>{t('onboarding.subtitle')}</p>
        <div className="feature-grid" aria-label="Nexus highlights">
          <span>{t('onboarding.nexusIdFeature')}</span>
          <span>{t('onboarding.directChatsFeature')}</span>
          <span>{t('onboarding.languagesFeature')}</span>
        </div>
        <div className="stack">
          <TelegramLoginButton>{t('onboarding.telegram')}</TelegramLoginButton>
          <Link to="/login" className="button button-secondary">{t('onboarding.login')}</Link>
          <Link to="/recovery">{t('onboarding.recovery')}</Link>
        </div>
        <div className="toolbar">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </section>
    </main>
  );
}
