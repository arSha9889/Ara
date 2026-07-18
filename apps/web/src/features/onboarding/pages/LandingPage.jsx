import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';

export function LandingPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const ctaPath = session?.accessToken ? '/app' : '/onboarding';
  const featureCards = [
    { icon: '💬', title: t('onboarding.directChatsTitle'), text: t('onboarding.directChatsText') },
    { icon: '🎙', title: t('onboarding.voiceTitle'), text: t('onboarding.voiceText') },
    { icon: '🟢', title: t('onboarding.presenceTitle'), text: t('onboarding.presenceText') },
    { icon: '🔔', title: t('onboarding.notificationsTitle'), text: t('onboarding.notificationsText') },
  ];
  const stageItems = [
    t('onboarding.stageWebCore'),
    t('onboarding.stageRealtime'),
    t('onboarding.stageMobile'),
  ];

  return (
    <main className="auth-page landing-page">
      <section className="hero-card landing-hero">
        <div className="halo-ring" aria-hidden="true" />
        <header className="landing-topbar">
          <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" /><span>Nexus</span></Link>
          <div className="landing-switchers">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="landing-hero-grid">
          <div className="landing-copy">
            <p className="eyebrow">N-Web / Messenger v1</p>
            <h1>{t('onboarding.title')}</h1>
            <p>{t('onboarding.subtitle')}</p>
            <div className="feature-grid landing-feature-pills" aria-label="Nexus highlights">
              <span>{t('onboarding.nexusIdFeature')}</span>
              <span>{t('onboarding.directChatsFeature')}</span>
              <span>{t('onboarding.languagesFeature')}</span>
            </div>
            <div className="stack landing-actions">
              <Link to={ctaPath} className="button button-primary">{t('onboarding.openMessenger')}</Link>
            </div>
          </div>

          <div className="landing-phone" aria-label={t('onboarding.previewLabel')}>
            <div className="landing-phone-header">
              <span className="avatar">N</span>
              <div>
                <strong>Nexus Chat</strong>
                <span>{t('messages.online')}</span>
              </div>
            </div>
            <div className="landing-message incoming">{t('onboarding.previewMessage1')}</div>
            <div className="landing-message outgoing">{t('onboarding.previewMessage2')}</div>
            <div className="landing-typing" aria-hidden="true"><span /><span /><span /></div>
          </div>
        </div>

        <div className="landing-section landing-section-offset">
          <div>
            <p className="eyebrow">{t('onboarding.whatInside')}</p>
            <h2>{t('onboarding.featuresTitle')}</h2>
          </div>
          <div className="landing-feature-cards">
            {featureCards.map((item) => (
              <article className="landing-feature-card" key={item.title}>
                <span aria-hidden="true">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="landing-section landing-stage-card">
          <div>
            <p className="eyebrow">{t('onboarding.stageEyebrow')}</p>
            <h2>{t('onboarding.stageTitle')}</h2>
            <p>{t('onboarding.stageText')}</p>
          </div>
          <ul className="landing-stage-list">
            {stageItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="landing-final-cta">
          <h2>{t('onboarding.finalTitle')}</h2>
          <p>{t('onboarding.finalText')}</p>
          <Link to={ctaPath} className="button button-primary">{t('onboarding.openMessenger')}</Link>
        </div>
      </section>
    </main>
  );
}
