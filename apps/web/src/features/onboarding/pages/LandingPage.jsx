import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';

export function LandingPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const isAuthenticated = Boolean(session?.accessToken);
  const ctaPath = isAuthenticated ? '/app' : '/region';
  const ctaLabel = isAuthenticated ? t('onboarding.enterMessenger') : t('onboarding.openMessenger');
  const featureCards = [
    { icon: 'chat', title: t('onboarding.directChatsTitle'), text: t('onboarding.directChatsText') },
    { icon: 'microphone', title: t('onboarding.voiceTitle'), text: t('onboarding.voiceText') },
    { icon: 'bell', title: t('onboarding.notificationsTitle'), text: t('onboarding.notificationsText') },
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
          <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" /><span>AraChat</span></Link>
          <div className="landing-topbar-actions">
            <LanguageSwitcher />
            <ThemeSwitcher />
            {!isAuthenticated ? <Link to="/login" className="landing-login-link">{t('onboarding.login')}</Link> : null}
          </div>
        </header>

        <div className="landing-hero-grid">
          <div className="landing-copy">
            <p className="eyebrow landing-beta-label"><span aria-hidden="true" />AraChat Web / Beta</p>
            <h1>{t('onboarding.title')}</h1>
            <p>{t('onboarding.subtitle')}</p>
            <div className="stack landing-actions">
              <Link to={ctaPath} className="button button-primary landing-primary-action">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
              {!isAuthenticated ? <Link to="/login" className="landing-secondary-action">{t('onboarding.login')}</Link> : null}
            </div>
            <div className="landing-trust-note"><span className="landing-trust-icon"><Icon name="shield" size={16} /></span>{t('onboarding.nexusIdFeature')}</div>
          </div>

          <div className="landing-showcase" aria-label={t('onboarding.previewLabel')}>
            <div className="landing-window">
              <div className="landing-window-topbar" aria-hidden="true">
                <div className="landing-window-controls"><i /><i /><i /></div>
                <div className="landing-window-address"><Icon name="shield" size={13} />arachat.app</div>
                <span />
              </div>
              <div className="landing-window-content">
                <aside className="landing-preview-sidebar">
                  <div className="landing-preview-brand"><img src="/icons/arachat-parrot-icon-192.png" alt="" /><strong>AraChat</strong><Icon name="pencil" size={15} /></div>
                  <div className="landing-preview-search"><Icon name="search" size={14} /><span>{t('onboarding.previewSearch')}</span></div>
                  <div className="landing-preview-chat active"><span className="landing-preview-avatar parrot"><img src="/icons/arachat-parrot-icon-192.png" alt="" /></span><div><strong>AraChat</strong><small>{t('onboarding.previewMessage2')}</small></div><time>12:34</time></div>
                  <div className="landing-preview-chat"><span className="landing-preview-avatar violet">А</span><div><strong>{t('onboarding.previewPersonOne')}</strong><small>{t('onboarding.previewPersonOneMessage')}</small></div><time>11:18</time></div>
                  <div className="landing-preview-chat"><span className="landing-preview-avatar blue">М</span><div><strong>{t('onboarding.previewPersonTwo')}</strong><small>{t('onboarding.previewVoiceMessage')}</small></div><time>{t('onboarding.previewYesterday')}</time></div>
                </aside>
                <div className="landing-preview-dialog">
                  <header className="landing-dialog-header">
                    <span className="landing-preview-avatar parrot"><img src="/icons/arachat-parrot-icon-192.png" alt="" /></span>
                    <div><strong>AraChat</strong><small><i />{t('messages.online')}</small></div>
                    <div className="landing-dialog-actions"><Icon name="search" size={16} /><Icon name="phone" size={16} /></div>
                  </header>
                  <div className="landing-dialog-messages">
                    <div className="landing-dialog-date">{t('onboarding.previewToday')}</div>
                    <div className="landing-bubble incoming">{t('onboarding.previewMessage1')}<time>12:32</time></div>
                    <div className="landing-bubble outgoing">{t('onboarding.previewMessage2')}<time>12:34 <Icon name="check" size={12} /></time></div>
                    <div className="landing-voice-preview"><span className="landing-preview-play" aria-label={t('onboarding.previewPlayVoice')}>▶</span><div><i><b /></i><small>0:12</small></div><Icon name="microphone" size={15} /></div>
                  </div>
                  <div className="landing-preview-composer"><Icon name="paperclip" size={17} /><span>{t('onboarding.previewComposer')}</span><Icon name="smile" size={17} /><span className="landing-preview-send" aria-label={t('onboarding.previewSend')}><Icon name="send" size={15} /></span></div>
                </div>
              </div>
            </div>
            <div className="landing-floating-card landing-floating-id"><Icon name="shield" size={17} /><span>AraChat ID</span><strong>•••• 3741</strong></div>
            <div className="landing-floating-card landing-floating-status"><span className="landing-live-dot" /><strong>{t('messages.online')}</strong><span>realtime</span></div>
          </div>
        </div>

        <section className="landing-section landing-features-section">
          <div className="landing-section-heading">
            <p className="eyebrow">{t('onboarding.whatInside')}</p>
            <h2>{t('onboarding.featuresTitle')}</h2>
          </div>
          <div className="landing-feature-cards">
            {featureCards.map((item) => (
              <article className="landing-feature-card" key={item.title}>
                <span className="landing-feature-icon"><Icon name={item.icon} size={22} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="landing-compact-row">
          <section className="landing-section landing-stage-card">
            <div>
              <p className="eyebrow">{t('onboarding.stageEyebrow')}</p>
              <h2>{t('onboarding.stageTitle')}</h2>
              <p>{t('onboarding.stageText')}</p>
            </div>
            <ul className="landing-stage-list">
              {stageItems.map((item, index) => <li className={index === 1 ? 'in-progress' : ''} key={item}><Icon name={index === 1 ? 'activity' : 'check'} size={16} />{item}</li>)}
            </ul>
          </section>

          <section className="landing-final-cta">
            <span className="landing-final-icon"><Icon name="sparkles" size={21} /></span>
            <h2>{t('onboarding.finalTitle')}</h2>
            <p>{t('onboarding.finalText')}</p>
            <div className="stack landing-final-actions">
              <Link to={ctaPath} className="button button-primary">{ctaLabel}<Icon name="arrowRight" size={17} /></Link>
            </div>
            <nav className="landing-legal-links centered" aria-label={t('onboarding.legalLinksLabel')}>
              <Link to="/privacy">{t('onboarding.privacyPolicy')}</Link>
              <span aria-hidden="true">·</span>
              <Link to="/terms">{t('onboarding.terms')}</Link>
            </nav>
          </section>
        </div>
      </section>
    </main>
  );
}
