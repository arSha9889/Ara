import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { DONATION_DETAILS, OFFICIAL_CHANNELS, YOUTUBE_CHANNEL_URL } from '../../../shared/config/projectLinks.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { CometScene } from '../components/CometScene.jsx';
import { CometSiteHeader } from '../components/CometSiteHeader.jsx';
import { GeoSignalScene } from '../components/GeoSignalScene.jsx';
import { getPublishedProjectNews } from '../api/projectNewsApi.js';

export function LandingPage() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const { hash } = useLocation();
  const isAuthenticated = Boolean(session?.accessToken);
  const ctaPath = isAuthenticated ? '/app' : '/register';
  const ctaLabel = isAuthenticated ? t('onboarding.enterMessenger') : t('onboarding.openMessenger');
  const [news, setNews] = useState([]);
  const [isDonationDialogOpen, setIsDonationDialogOpen] = useState(false);
  const [donationCopyState, setDonationCopyState] = useState('idle');
  const donationTriggerRef = useRef(null);
  const donationDialogRef = useRef(null);
  const donationDialogCloseRef = useRef(null);
  const wasDonationDialogOpenRef = useRef(false);
  const storyScenes = [
    { type: 'voice', kicker: t('comet.voiceKicker'), title: t('comet.voiceTitle'), text: t('comet.voiceText'), icon: 'microphone' },
    { type: 'devices', kicker: t('comet.devicesKicker'), title: t('comet.devicesTitle'), text: t('comet.devicesText'), icon: 'monitor' },
    { type: 'privacy', kicker: t('comet.privacyKicker'), title: t('comet.privacyTitle'), text: t('comet.privacyText'), icon: 'shield' },
  ];

  useEffect(() => {
    const sectionId = hash.slice(1);
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (!section) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, [hash]);

  useEffect(() => {
    let isCurrent = true;
    getPublishedProjectNews(language).then((items) => {
      if (isCurrent) setNews(items);
    }).catch(() => {
      if (isCurrent) setNews([]);
    });
    return () => { isCurrent = false; };
  }, [language]);

  const closeDonationDialog = useCallback(() => {
    setIsDonationDialogOpen(false);
    setDonationCopyState('idle');
  }, []);

  const copyDonationPhone = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(DONATION_DETAILS.phone);
      } else {
        const input = document.createElement('textarea');
        input.value = DONATION_DETAILS.phone;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('copy failed');
      }
      setDonationCopyState('copied');
    } catch {
      setDonationCopyState('failed');
    }
  }, []);

  useEffect(() => {
    if (!isDonationDialogOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    donationDialogCloseRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeDonationDialog();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDonationDialog, isDonationDialogOpen]);

  useEffect(() => {
    if (!isDonationDialogOpen && wasDonationDialogOpenRef.current) donationTriggerRef.current?.focus();
    wasDonationDialogOpenRef.current = isDonationDialogOpen;
  }, [isDonationDialogOpen]);

  useEffect(() => {
    if (donationCopyState === 'idle') return undefined;
    const timeoutId = window.setTimeout(() => setDonationCopyState('idle'), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [donationCopyState]);

  function trapDonationDialogFocus(event) {
    if (event.key !== 'Tab' || !donationDialogRef.current) return;

    const focusableElements = [...donationDialogRef.current.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focusableElements.length) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && (document.activeElement === donationDialogRef.current || document.activeElement === firstFocusable)) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  return (
    <main className="public-page comet-page comet-landing-page" aria-labelledby="landing-title">
      <div className="comet-shell">
        <CometSiteHeader />

        <section className="comet-hero" id="product">
          <div className="comet-hero-copy">
            <p className="comet-kicker"><span />{t('comet.heroKicker')}</p>
            <h1 id="landing-title">{t('comet.heroTitle')}</h1>
            <p>{t('comet.heroText')}</p>
            <div className="stack comet-hero-actions">
              <Link to={ctaPath} className="button button-primary">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
              <a className="comet-text-action" href="#story">{t('comet.heroSecondary')}<Icon name="arrowRight" size={17} /></a>
            </div>
            <p className="comet-hero-note"><Icon name="shield" size={16} />{t('comet.heroNote')}</p>
          </div>
          <GeoSignalScene />
        </section>

        <section className="comet-story" id="story" aria-labelledby="story-title">
          <div className="comet-section-intro">
            <p className="comet-kicker"><span />{t('comet.storyKicker')}</p>
            <h2 id="story-title">{t('comet.storyTitle')}</h2>
            <p>{t('comet.storyLead')}</p>
          </div>
          <div className="comet-story-scenes">
            {storyScenes.map((scene, index) => (
              <article className={`comet-story-scene is-${scene.type}`} key={scene.type}>
                <div className="comet-story-copy">
                  <span className="comet-scene-count">0{index + 1}</span>
                  <span className="comet-scene-icon"><Icon name={scene.icon} size={20} /></span>
                  <p>{scene.kicker}</p>
                  <h3>{scene.title}</h3>
                  <p>{scene.text}</p>
                </div>
                <CometScene type={scene.type} />
              </article>
            ))}
          </div>
        </section>

        <section className="comet-pulse" id="pulse" aria-labelledby="pulse-title">
          <div className="comet-pulse-heading">
            <div>
              <p className="comet-kicker"><span />{t('comet.pulseKicker')}</p>
              <h2 id="pulse-title">{t('comet.pulseTitle')}</h2>
            </div>
            <p>{t('comet.pulseLead')}</p>
          </div>
          <div className="comet-pulse-layout">
            {news.length ? (
              <article className="comet-featured-news"><p>{new Date(news[0].published_at).toLocaleDateString(language)}</p><h3>{news[0].title}</h3><p>{news[0].excerpt}</p><Link to={`/news/${news[0].slug}`}>{t('comet.readNews')}<Icon name="arrowRight" size={16} /></Link></article>
            ) : (
              <article className="comet-featured-news is-empty">
                <span className="comet-pulse-orbit" aria-hidden="true" />
                <p>{t('comet.newsEmptyKicker')}</p>
                <h3>{t('comet.pulseEmptyTitle')}</h3>
                <p>{t('comet.pulseEmptyText')}</p>
                <Link to="/news">{t('comet.openNews')}<Icon name="arrowRight" size={16} /></Link>
              </article>
            )}
            <article className={`comet-video-card ${YOUTUBE_CHANNEL_URL ? 'is-ready' : 'is-coming'}`}>
              <div className="comet-video-preview" aria-hidden="true"><span><Icon name="youtube" size={25} /></span><i /><i /><i /></div>
              <div>
                <p>{t('comet.videoKicker')}</p>
                <h3>{t('comet.videoTitle')}</h3>
                <p>{t(YOUTUBE_CHANNEL_URL ? 'comet.videoReadyText' : 'comet.videoComingText')}</p>
                {YOUTUBE_CHANNEL_URL ? <a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noreferrer">{t('comet.openYoutube')}<Icon name="arrowRight" size={16} /></a> : <span className="comet-coming-label">{t('comet.comingSoon')}</span>}
              </div>
            </article>
          </div>
        </section>

        <section className="comet-flight" id="flight" aria-labelledby="flight-title">
          <div className="comet-flight-copy">
            <p className="comet-kicker"><span />{t('comet.flightKicker')}</p>
            <h2 id="flight-title">{t('comet.flightTitle')}</h2>
            <p>{t('comet.flightLead')}</p>
          </div>
          <ol className="comet-flight-track">
            {['web', 'realtime', 'android', 'desktop'].map((stage) => <li className={`is-${stage}`} key={stage}><span><Icon name={stage === 'web' ? 'check' : stage === 'realtime' ? 'activity' : 'sparkles'} size={16} /></span><div><small>{t(`comet.flight${stage[0].toUpperCase()}${stage.slice(1)}Status`)}</small><strong>{t(`comet.flight${stage[0].toUpperCase()}${stage.slice(1)}Title`)}</strong></div></li>)}
          </ol>
        </section>

        <section className="comet-support" id="support" aria-labelledby="support-title">
          <span className="comet-support-orbit comet-support-orbit-one" aria-hidden="true" />
          <span className="comet-support-orbit comet-support-orbit-two" aria-hidden="true" />
          <div className="comet-support-copy">
            <p className="comet-kicker"><span />{t('comet.donationKicker')}</p>
            <h2 id="support-title">{t('comet.donationTitle')}</h2>
            <p>{t('comet.donationLead')}</p>
            <ul className="comet-support-focus">
              <li>
                <span aria-hidden="true"><Icon name="activity" size={18} /></span>
                <div>
                  <strong>{t('comet.donationInfrastructureTitle')}</strong>
                  <p>{t('comet.donationInfrastructureText')}</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true"><Icon name="sparkles" size={18} /></span>
                <div>
                  <strong>{t('comet.donationDevelopmentTitle')}</strong>
                  <p>{t('comet.donationDevelopmentText')}</p>
                </div>
              </li>
            </ul>
          </div>
          <aside className="comet-support-action" aria-labelledby="donation-action-title">
            <span className="comet-support-action-icon" aria-hidden="true"><Icon name="phone" size={22} /></span>
            <p className="comet-support-action-label">{t('comet.donationMethod')}</p>
            <h3 id="donation-action-title">{t('comet.donationActionTitle')}</h3>
            <p>{t('comet.donationActionText')}</p>
            <button
              className="button button-primary"
              type="button"
              ref={donationTriggerRef}
              aria-haspopup="dialog"
              aria-expanded={isDonationDialogOpen}
              onClick={() => {
                setDonationCopyState('idle');
                setIsDonationDialogOpen(true);
              }}
            >
              {t('comet.donationOpenDetails')}<Icon name="arrowRight" size={17} />
            </button>
            <small>{t('comet.donationAmountNote')}</small>
          </aside>
        </section>

        <section className="comet-channels" id="channels" aria-labelledby="channels-title">
          <div className="comet-channels-copy">
            <p className="comet-kicker"><span />{t('comet.channelsKicker')}</p>
            <h2 id="channels-title">{t('comet.channelsTitle')}</h2>
            <p>{t('comet.channelsLead')}</p>
          </div>
          <div className="comet-constellation">
            <span className="comet-constellation-core" aria-hidden="true"><img src="/icons/arachat-parrot-icon-192.png" alt="" /></span>
            {OFFICIAL_CHANNELS.map((channel) => {
              const content = <><span className="comet-channel-icon">{channel.asset ? <img src={channel.asset} alt="" /> : <Icon name={channel.icon} size={22} />}</span><span><strong>{channel.title}</strong><small>{channel.href ? t('comet.channelOpen') : t('comet.channelSoon')}</small></span></>;
              return channel.href ? <a className={`comet-channel is-${channel.key}`} href={channel.href} target="_blank" rel="noreferrer" key={channel.key}>{content}</a> : <div className={`comet-channel is-${channel.key} is-unavailable`} key={channel.key}>{content}</div>;
            })}
          </div>
        </section>

        <section className="comet-final" aria-labelledby="final-title">
          <span className="comet-final-signal" aria-hidden="true" />
          <p className="comet-kicker"><span />AraChat Comet</p>
          <h2 id="final-title">{t('comet.finalTitle')}</h2>
          <p>{t('comet.finalText')}</p>
          <div className="stack comet-final-actions"><Link to={ctaPath} className="button button-primary">{ctaLabel}<Icon name="arrowRight" size={17} /></Link></div>
          <nav aria-label={t('onboarding.legalLinksLabel')}><Link to="/privacy">{t('onboarding.privacyPolicy')}</Link><span aria-hidden="true">·</span><Link to="/terms">{t('onboarding.terms')}</Link><span aria-hidden="true">·</span><Link to="/presentation">{t('onboarding.openPresentation')}</Link></nav>
        </section>
      </div>

      {isDonationDialogOpen ? (
        <div className="comet-donation-dialog-layer" role="presentation" onMouseDown={closeDonationDialog}>
          <section
            className="comet-donation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-dialog-title"
            aria-describedby="donation-dialog-description"
            ref={donationDialogRef}
            tabIndex="-1"
            onKeyDown={trapDonationDialogFocus}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="comet-donation-dialog-close" type="button" ref={donationDialogCloseRef} onClick={closeDonationDialog} aria-label={t('common.close')}>
              <Icon name="x" size={19} />
            </button>
            <div className="comet-donation-dialog-heading">
              <span className="comet-donation-dialog-icon" aria-hidden="true"><Icon name="phone" size={22} /></span>
              <div>
                <p className="comet-kicker"><span />{t('comet.donationDialogKicker')}</p>
                <h2 id="donation-dialog-title">{t('comet.donationDialogTitle')}</h2>
                <p id="donation-dialog-description">{t('comet.donationDialogText')}</p>
              </div>
            </div>

            <ol className="comet-donation-steps">
              <li><span>1</span><p>{t('comet.donationStepOne')}</p></li>
              <li><span>2</span><p>{t('comet.donationStepTwo')}</p></li>
              <li><span>3</span><p>{t('comet.donationStepThree')}</p></li>
            </ol>

            <dl className="comet-donation-details">
              <div>
                <dt>{t('comet.donationRecipientLabel')}</dt>
                <dd>{DONATION_DETAILS.recipient}</dd>
              </div>
              <div>
                <dt>{t('comet.donationPhoneLabel')}</dt>
                <dd className="comet-donation-phone-row">
                  <strong>{DONATION_DETAILS.phoneDisplay}</strong>
                  <button className="comet-donation-copy" type="button" onClick={copyDonationPhone} aria-describedby="donation-copy-status">
                    <Icon name={donationCopyState === 'copied' ? 'check' : 'copy'} size={17} />
                    {t(donationCopyState === 'copied' ? 'common.copied' : 'comet.donationCopyPhone')}
                  </button>
                  <span id="donation-copy-status" className={`comet-donation-copy-status ${donationCopyState === 'failed' ? 'is-error' : ''}`} role="status" aria-live="polite">
                    {donationCopyState === 'failed' ? t('comet.donationCopyError') : ''}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t('comet.donationBankLabel')}</dt>
                <dd>{DONATION_DETAILS.banks.join(' · ')}</dd>
              </div>
            </dl>

            <p className="comet-donation-dialog-note"><Icon name="shield" size={16} />{t('comet.donationSafetyNote')}</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
