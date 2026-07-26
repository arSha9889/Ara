import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';

export function LandingPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const isAuthenticated = Boolean(session?.accessToken);
  const ctaPath = isAuthenticated ? '/app' : '/region';
  const ctaLabel = isAuthenticated ? t('onboarding.enterMessenger') : t('onboarding.openMessenger');
  const featureCards = [
    { icon: '💬', title: t('onboarding.directChatsTitle'), text: t('onboarding.directChatsText') },
    { icon: '🎙', title: t('onboarding.voiceTitle'), text: t('onboarding.voiceText') },
    { icon: '📣', title: t('onboarding.branchesTitle'), text: t('onboarding.branchesText') },
    { icon: '🔔', title: t('onboarding.notificationsTitle'), text: t('onboarding.notificationsText') },
  ];
  const stageItems = [
    t('onboarding.stageWebCore'),
    t('onboarding.stageRealtime'),
    t('onboarding.stageMobile'),
  ];
  const installCards = [
    {
      icon: '📱',
      title: t('onboarding.installPhoneTitle'),
      steps: [
        t('onboarding.installPhoneStep1'),
        t('onboarding.installPhoneStep2'),
        t('onboarding.installPhoneStep3'),
      ],
    },
    {
      icon: '💻',
      title: t('onboarding.installDesktopTitle'),
      steps: [
        t('onboarding.installDesktopStep1'),
        t('onboarding.installDesktopStep2'),
        t('onboarding.installDesktopStep3'),
      ],
    },
  ];

  return (
    <main className="auth-page landing-page">
      <section className="hero-card landing-hero">
        <div className="halo-ring" aria-hidden="true" />
        <header className="landing-topbar">
          <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" /><span>AraChat</span></Link>
          <div className="landing-switchers">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="landing-hero-grid">
          <div className="landing-copy">
            <p className="eyebrow">AraChat Web / Messenger v1</p>
            <h1>{t('onboarding.title')}</h1>
            <p>{t('onboarding.subtitle')}</p>
            <div className="feature-grid landing-feature-pills" aria-label="AraChat highlights">
              <span>{t('onboarding.nexusIdFeature')}</span>
              <span>{t('onboarding.directChatsFeature')}</span>
              <span>{t('onboarding.languagesFeature')}</span>
              <span>{t('onboarding.branchesFeature')}</span>
            </div>
            <div className="stack landing-actions">
              <Link to={ctaPath} className="button button-primary">{ctaLabel}</Link>
              {!isAuthenticated ? <Link to="/login" className="button button-secondary">{t('onboarding.login')}</Link> : null}
            </div>
            <nav className="landing-legal-links" aria-label={t('onboarding.legalLinksLabel')}>
              <Link to="/privacy">{t('onboarding.privacyPolicy')}</Link>
              <span aria-hidden="true">·</span>
              <Link to="/terms">{t('onboarding.terms')}</Link>
            </nav>
          </div>

          <div className="landing-showcase" aria-label={t('onboarding.previewLabel')}>
            <img className="landing-brand-art" src="/images/arachat-parrot-hero.jpeg" alt="" aria-hidden="true" />
            <div className="landing-phone">
              <div className="landing-phone-header">
                <img className="avatar landing-chat-avatar" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" />
                <div>
                  <strong>AraChat Chat</strong>
                  <span>{t('messages.online')}</span>
                </div>
              </div>
              <div className="landing-message incoming">{t('onboarding.previewMessage1')}</div>
              <div className="landing-message outgoing">{t('onboarding.previewMessage2')}</div>
              <div className="landing-typing" aria-hidden="true"><span /><span /><span /></div>
            </div>
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

        <div className="landing-section landing-install-section">
          <div className="landing-install-copy">
            <p className="eyebrow">{t('onboarding.installEyebrow')}</p>
            <h2>{t('onboarding.installTitle')}</h2>
            <p>{t('onboarding.installText')}</p>
          </div>
          <div className="landing-install-grid">
            {installCards.map((card) => (
              <article className="landing-install-card" key={card.title}>
                <div className="landing-install-card-head">
                  <span aria-hidden="true">{card.icon}</span>
                  <h3>{card.title}</h3>
                </div>
                <ol>
                  {card.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </article>
            ))}
          </div>
        </div>

        <div className="landing-compact-row">
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
            <div className="stack landing-final-actions">
              <Link to={ctaPath} className="button button-primary">{ctaLabel}</Link>
              {!isAuthenticated ? <Link to="/login" className="button button-secondary">{t('onboarding.login')}</Link> : null}
            </div>
            <nav className="landing-legal-links centered" aria-label={t('onboarding.legalLinksLabel')}>
              <Link to="/privacy">{t('onboarding.privacyPolicy')}</Link>
              <span aria-hidden="true">·</span>
              <Link to="/terms">{t('onboarding.terms')}</Link>
            </nav>
          </div>
        </div>
      </section>
    </main>
  );
}
