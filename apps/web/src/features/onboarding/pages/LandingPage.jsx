import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { useFlagDayCampaign } from '../../../shared/config/seasonalCampaign.js';

// Insert the official channel URLs here. Empty values keep the cards safely inactive.
const PROJECT_SOCIAL_LINKS = {
  telegram: 'https://t.me/aramessage',
  max: '',
  vk: 'https://vk.ru/club241439239',
};

export function LandingPage() {
  const { t } = useI18n();
  const { session } = useSession();
  const isFlagDayCampaignActive = useFlagDayCampaign();
  const isAuthenticated = Boolean(session?.accessToken);
  const ctaPath = isAuthenticated ? '/app' : '/register';
  const ctaLabel = isAuthenticated ? t('onboarding.enterMessenger') : t('onboarding.openMessenger');
  const logoSrc = isFlagDayCampaignActive ? '/images/flag-day-ribbon-logo.jpg' : '/icons/arachat-parrot-icon-192.png';
  const featureCards = [
    { icon: 'chat', title: t('onboarding.directChatsTitle'), text: t('onboarding.directChatsText') },
    { icon: 'microphone', title: t('onboarding.voiceTitle'), text: t('onboarding.voiceText') },
    { icon: 'bell', title: t('onboarding.notificationsTitle'), text: t('onboarding.notificationsText') },
  ];
  const privacyCards = [
    { icon: 'shield', title: t('onboarding.privacyIdTitle'), text: t('onboarding.privacyIdText') },
    { icon: 'monitor', title: t('onboarding.privacyDevicesTitle'), text: t('onboarding.privacyDevicesText') },
    { icon: 'user', title: t('onboarding.privacyPhoneTitle'), text: t('onboarding.privacyPhoneText') },
  ];
  const stageItems = [
    t('onboarding.stageWebCore'),
    t('onboarding.stageRealtime'),
    t('onboarding.stageMobile'),
  ];
  const communityCards = [
    { key: 'telegram', logo: '/icons/social/telegram.svg', title: 'Telegram', text: t('onboarding.communityTelegramText'), href: PROJECT_SOCIAL_LINKS.telegram },
    { key: 'max', logo: '/icons/social/max.png', title: 'MAX', text: t('onboarding.communityMaxText'), href: PROJECT_SOCIAL_LINKS.max },
    { key: 'vk', logo: '/icons/social/vk.svg', title: 'VK', text: t('onboarding.communityVkText'), href: PROJECT_SOCIAL_LINKS.vk },
  ];

  return (
    <main className="auth-page landing-page">
      <section className={`hero-card landing-hero ${isFlagDayCampaignActive ? 'is-flag-day' : ''}`} id="product" aria-labelledby="landing-title">
        <div className="halo-ring" aria-hidden="true" />
        <header className="landing-topbar">
          <Link to="/" className="brand compact"><img className="brand-mark" src={logoSrc} alt="" aria-hidden="true" /><span>AraChat</span></Link>
          <nav className="landing-section-nav" aria-label={t('common.navigation')}>
            <a href="#product">{t('onboarding.navigationProduct')}</a>
            <a href="#capabilities">{t('onboarding.navigationCapabilities')}</a>
            <a href="#privacy">{t('onboarding.navigationPrivacy')}</a>
            <a href="#devices">{t('onboarding.navigationDevices')}</a>
            <a href="#community">{t('onboarding.navigationCommunity')}</a>
          </nav>
          <div className="landing-topbar-actions">
            <Link to="/presentation" className="landing-presentation-link">{t('onboarding.openPresentation')}</Link>
            <LanguageSwitcher />
            <ThemeSwitcher />
            {!isAuthenticated ? <Link to="/login" className="landing-login-link">{t('onboarding.login')}</Link> : null}
          </div>
        </header>

        <div className="landing-hero-grid">
          <div className="landing-copy">
            <p className="eyebrow landing-release-label"><span aria-hidden="true" />{t('onboarding.landingEyebrow')}</p>
            {isFlagDayCampaignActive ? <div className="flag-day-banner"><span className="flag-day-banner-mark" aria-hidden="true" /><span><strong>{t('seasonal.flagDayTitle')}</strong><small>{t('seasonal.flagDayUntil')}</small></span></div> : null}
            <h1 id="landing-title">{t('onboarding.landingTitle')}</h1>
            <p>{t('onboarding.landingSubtitle')}</p>
            <div className="stack landing-actions">
              <Link to={ctaPath} className="button button-primary landing-primary-action">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
              {!isAuthenticated ? <Link to="/login" className="landing-secondary-action">{t('onboarding.login')}</Link> : null}
            </div>
            <div className="landing-trust-note"><span className="landing-trust-icon"><Icon name="shield" size={16} /></span>{t('onboarding.nexusIdFeature')}</div>
          </div>

          <div className="landing-showcase" aria-label={t('onboarding.previewLabel')}>
            {isFlagDayCampaignActive ? <img className="flag-day-ribbon-art" src="/images/flag-day-ribbon-logo.jpg" alt="" aria-hidden="true" /> : null}
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
            {isFlagDayCampaignActive ? <div className="flag-day-logo-card"><img src="/images/flag-day-ribbon-logo.jpg" alt="" aria-hidden="true" /><span><strong>{t('seasonal.flagDayTitle')}</strong><small>{t('seasonal.flagDayUntil')}</small></span></div> : <div className="landing-floating-card landing-floating-id"><Icon name="shield" size={17} /><span>AraChat ID</span><strong>•••• 3741</strong></div>}
            <div className="landing-floating-card landing-floating-status"><span className="landing-live-dot" /><strong>{t('messages.online')}</strong><span>realtime</span></div>
          </div>
        </div>

        <section className="landing-section landing-features-section" id="capabilities" aria-labelledby="capabilities-title">
          <div className="landing-section-heading">
            <p className="eyebrow landing-section-kicker"><span>02</span>{t('onboarding.capabilitiesEyebrow')}</p>
            <h2 id="capabilities-title">{t('onboarding.capabilitiesTitle')}</h2>
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

        <section className="landing-section landing-privacy-section" id="privacy" aria-labelledby="privacy-title">
          <div className="landing-privacy-intro">
            <div>
              <p className="eyebrow landing-section-kicker"><span>03</span>{t('onboarding.privacyEyebrow')}</p>
              <h2 id="privacy-title">{t('onboarding.privacyTitle')}</h2>
              <p>{t('onboarding.privacyText')}</p>
            </div>
            <div className="landing-privacy-orbit" aria-hidden="true">
              <span className="landing-privacy-ring landing-privacy-ring-outer" />
              <span className="landing-privacy-ring landing-privacy-ring-inner" />
              <span className="landing-privacy-node landing-privacy-node-one" />
              <span className="landing-privacy-node landing-privacy-node-two" />
              <span className="landing-privacy-core"><Icon name="shield" size={27} /></span>
            </div>
          </div>
          <div className="landing-privacy-cards">
            {privacyCards.map((item) => (
              <article className="landing-privacy-card" key={item.title}>
                <span className="landing-feature-icon"><Icon name={item.icon} size={22} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-download-section" id="devices" aria-labelledby="download-title">
          <div className="landing-download-heading">
            <div>
              <p className="eyebrow landing-section-kicker"><span>04</span>{t('onboarding.devicesEyebrow')}</p>
              <h2 id="download-title">{t('onboarding.downloadTitle')}</h2>
            </div>
            <p>{t('onboarding.downloadText')}</p>
          </div>
          <div className="landing-store-grid">
            <button className="landing-store-card" type="button" disabled>
              <span className="landing-store-mark rustore" aria-hidden="true">Ru</span>
              <span className="landing-store-copy"><small>Android</small><strong>RuStore</strong><em>{t('onboarding.downloadAndroidRequirement')}</em></span>
              <span className="landing-store-status"><span aria-hidden="true" />{t('onboarding.downloadSoon')}</span>
            </button>
            <button className="landing-store-card" type="button" disabled>
              <span className="landing-store-mark apk" aria-hidden="true">APK</span>
              <span className="landing-store-copy"><small>Android</small><strong>{t('onboarding.downloadApk')}</strong><em>{t('onboarding.downloadAndroidRequirement')}</em></span>
              <span className="landing-store-status"><span aria-hidden="true" />{t('onboarding.downloadSoon')}</span>
            </button>
            <button className="landing-store-card" type="button" disabled>
              <span className="landing-store-mark ios" aria-hidden="true">iOS</span>
              <span className="landing-store-copy"><small>iPhone &amp; iPad</small><strong>App Store</strong><em>{t('onboarding.downloadIosRequirement')}</em></span>
              <span className="landing-store-status"><span aria-hidden="true" />{t('onboarding.downloadSoon')}</span>
            </button>
          </div>
          <p className="landing-download-note"><Icon name="bell" size={16} />{t('onboarding.downloadNote')}</p>
        </section>

        <section className="landing-section landing-community-section" id="community" aria-labelledby="community-title">
          <div className="landing-community-heading">
            <div>
              <p className="eyebrow landing-section-kicker"><span>05</span>{t('onboarding.communityEyebrow')}</p>
              <h2 id="community-title">{t('onboarding.communityTitle')}</h2>
            </div>
            <p>{t('onboarding.communityText')}</p>
          </div>
          <div className="landing-community-grid">
            {communityCards.map(({ key, logo, title, text, href }) => {
              const isAvailable = Boolean(href);
              const content = <>
                <span className="landing-community-icon"><img src={logo} alt="" /></span>
                <span className="landing-community-copy"><strong>{title}</strong><small>{text}</small></span>
                <span className="landing-community-status"><span aria-hidden="true" />{isAvailable ? t('onboarding.communityOpen') : t('onboarding.downloadSoon')}</span>
              </>;

              return isAvailable ? (
                <a className={`landing-community-card is-${key}`} href={href} target="_blank" rel="noreferrer" key={key}>
                  {content}
                </a>
              ) : (
                <article className={`landing-community-card is-${key}`} aria-disabled="true" key={key}>
                  {content}
                </article>
              );
            })}
          </div>
        </section>

        <div className="landing-compact-row">
          <section className="landing-section landing-stage-card" aria-labelledby="roadmap-title">
            <div>
              <p className="eyebrow landing-section-kicker"><span>06</span>{t('onboarding.roadmapEyebrow')}</p>
              <h2 id="roadmap-title">{t('onboarding.roadmapTitle')}</h2>
              <p>{t('onboarding.stageText')}</p>
            </div>
            <ul className="landing-stage-list">
              {stageItems.map((item, index) => <li className={index === 1 ? 'in-progress' : ''} key={item}><Icon name={index === 1 ? 'activity' : 'check'} size={16} />{item}</li>)}
            </ul>
          </section>

          <section className="landing-final-cta">
            <span className="landing-final-icon"><Icon name="sparkles" size={21} /></span>
            <p className="eyebrow landing-section-kicker"><span>07</span>{t('onboarding.finalEyebrow')}</p>
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
