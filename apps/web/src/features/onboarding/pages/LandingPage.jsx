import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { APP_DISTRIBUTION, DONATION_DETAILS, OFFICIAL_CHANNELS, YOUTUBE_CHANNEL_URL } from '../../../shared/config/projectLinks.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { CometSiteHeader } from '../components/CometSiteHeader.jsx';
import { AraFooter } from '../components/AraFooter.jsx';
import { AraProductPreview } from '../components/AraProductPreview.jsx';
import { DownloadConfirmationDialog } from '../components/DownloadConfirmationDialog.jsx';
import { getPublishedProjectNews } from '../api/projectNewsApi.js';

function isPlatformAvailable(platform) {
  return platform.groups.some((group) => group.channels.some((channel) => channel.href));
}

export function LandingPage() {
  const { language, t } = useI18n();
  const { hash } = useLocation();
  const ctaLabel = t('onboarding.openMessenger');
  const [news, setNews] = useState([]);
  const [newsStatus, setNewsStatus] = useState('loading');
  const [isDonationDialogOpen, setIsDonationDialogOpen] = useState(false);
  const [donationCopyState, setDonationCopyState] = useState('idle');
  const donationTriggerRef = useRef(null);
  const donationDialogRef = useRef(null);
  const donationDialogCloseRef = useRef(null);
  const wasDonationDialogOpenRef = useRef(false);
  const downloadTriggerRef = useRef(null);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const features = [
    { key: 'chats', icon: 'chat', title: t('onboarding.directChatsTitle'), text: t('onboarding.directChatsText') },
    { key: 'voice', icon: 'microphone', title: t('onboarding.voiceTitle'), text: t('onboarding.voiceText') },
    { key: 'privacy', icon: 'shield', title: t('onboarding.privacyTitle'), text: t('onboarding.privacyText') },
    { key: 'branches', icon: 'branches', title: t('onboarding.branchesTitle'), text: t('onboarding.branchesText') },
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
    setNewsStatus('loading');
    getPublishedProjectNews(language).then((items) => {
      if (isCurrent) {
        setNews(items);
        setNewsStatus('ready');
      }
    }).catch(() => {
      if (isCurrent) {
        setNews([]);
        setNewsStatus('error');
      }
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

  function openDownloadDialog(event) {
    downloadTriggerRef.current = event.currentTarget;
    setIsDownloadDialogOpen(true);
  }

  return (
    <main className="public-page ara-page ara-landing-page" aria-labelledby="landing-title">
      <div className="ara-shell">
        <a className="ara-skip-link" href="#main-content">{t('common.skipToContent')}</a>
        <CometSiteHeader />

        <section className="ara-hero" id="main-content" tabIndex="-1">
          <div className="ara-hero-copy">
            <p className="ara-overline">AraShift Atmosphere</p>
            <h1 id="landing-title">{t('comet.heroTitle')}</h1>
            <p>{t('comet.heroText')}</p>
            <div className="ara-actions">
              <button className="ara-button ara-button-primary" type="button" aria-haspopup="dialog" aria-expanded={isDownloadDialogOpen} onClick={openDownloadDialog}>{ctaLabel}<Icon name="arrowRight" size={18} /></button>
              <Link to="/download" className="ara-button ara-button-secondary">{t('onboarding.downloadNavigation')}<Icon name="arrowRight" size={17} /></Link>
            </div>
            <p className="ara-hero-note"><Icon name="shield" size={16} />{t('comet.heroNote')}</p>
          </div>
          <AraProductPreview />
        </section>

        <section className="ara-platform-strip" aria-label={t('onboarding.downloadPlatformsLabel')}>
          {APP_DISTRIBUTION.map((platform) => {
            const isAvailable = isPlatformAvailable(platform);
            return (
              <Link className={`ara-platform-link ${isAvailable ? 'is-available' : ''}`} to={platform.key === 'android' ? '/download' : `/download?platform=${platform.key}`} key={platform.key}>
                <span className="ara-platform-link-icon"><Icon name={platform.icon} size={19} /></span>
                <span><strong>{t(platform.labelKey)}</strong><small>{t(isAvailable ? 'onboarding.downloadAvailable' : 'onboarding.downloadSoon')}</small></span>
                <Icon name="arrowRight" size={17} />
              </Link>
            );
          })}
        </section>

        <section className="ara-features" id="story" aria-labelledby="story-title">
          <div className="ara-section-heading">
            <p className="ara-overline">{t('comet.storyKicker')}</p>
            <h2 id="story-title">{t('comet.storyTitle')}</h2>
            <p>{t('comet.storyLead')}</p>
          </div>
          <div className="ara-feature-grid">
            {features.map((feature) => (
              <article className={`ara-feature ara-feature-${feature.key}`} key={feature.key}>
                <span className="ara-feature-icon" aria-hidden="true"><Icon name={feature.icon} size={21} /></span>
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
                {feature.key === 'chats' ? <AraProductPreview compact /> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="ara-development" id="flight" aria-labelledby="flight-title">
          <div className="ara-development-copy">
            <p className="ara-overline">{t('comet.flightKicker')}</p>
            <h2 id="flight-title">{t('comet.flightTitle')}</h2>
            <p>{t('comet.flightLead')}</p>
          </div>
          <ol className="ara-development-track">
            {['web', 'realtime', 'android', 'desktop'].map((stage) => (
              <li key={stage}>
                <span className="ara-development-icon"><Icon name={stage === 'web' ? 'check' : stage === 'realtime' ? 'activity' : 'sparkles'} size={17} /></span>
                <div>
                  <small>{t(`comet.flight${stage[0].toUpperCase()}${stage.slice(1)}Status`)}</small>
                  <strong>{t(`comet.flight${stage[0].toUpperCase()}${stage.slice(1)}Title`)}</strong>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="ara-pulse" id="pulse" aria-labelledby="pulse-title">
          <div className="ara-section-heading">
            <p className="ara-overline">{t('comet.pulseKicker')}</p>
            <h2 id="pulse-title">{t('comet.pulseTitle')}</h2>
            <p>{t('comet.pulseLead')}</p>
          </div>
          <div className="ara-pulse-layout">
            {newsStatus === 'loading' ? (
              <article className="ara-news-card is-loading" aria-live="polite">
                <p>{t('common.loading')}</p>
                <span className="ara-news-skeleton ara-news-skeleton-title" aria-hidden="true" />
                <span className="ara-news-skeleton ara-news-skeleton-text" aria-hidden="true" />
              </article>
            ) : newsStatus === 'error' ? (
              <article className="ara-news-card is-error">
                <p>{language === 'ru' ? 'Новости временно недоступны' : 'Project news are temporarily unavailable'}</p>
                <h3>{language === 'ru' ? 'Не удалось получить обновления проекта' : 'We could not load project updates'}</h3>
                <p>{language === 'ru' ? 'Попробуйте открыть журнал позже или воспользуйтесь официальными каналами AraChat.' : 'Try the journal again later or use AraChat official channels.'}</p>
                <Link to="/news">{t('comet.openNews')}<Icon name="arrowRight" size={16} /></Link>
              </article>
            ) : news.length ? (
              <article className="ara-news-card">
                <p>{new Date(news[0].published_at).toLocaleDateString(language)}</p>
                <h3>{news[0].title}</h3>
                <p>{news[0].excerpt}</p>
                <Link to={`/news/${news[0].slug}`}>{t('comet.readNews')}<Icon name="arrowRight" size={16} /></Link>
              </article>
            ) : (
              <article className="ara-news-card is-empty">
                <span className="ara-news-card-signal" aria-hidden="true" />
                <p>{t('comet.newsEmptyKicker')}</p>
                <h3>{t('comet.pulseEmptyTitle')}</h3>
                <p>{t('comet.pulseEmptyText')}</p>
                <Link to="/news">{t('comet.openNews')}<Icon name="arrowRight" size={16} /></Link>
              </article>
            )}
            <article className={`ara-video-card ${YOUTUBE_CHANNEL_URL ? 'is-ready' : 'is-coming'}`}>
              <div className="ara-video-card-icon" aria-hidden="true"><Icon name="youtube" size={28} /></div>
              <div>
                <p>{t('comet.videoKicker')}</p>
                <h3>{t('comet.videoTitle')}</h3>
                <p>{t(YOUTUBE_CHANNEL_URL ? 'comet.videoReadyText' : 'comet.videoComingText')}</p>
                {YOUTUBE_CHANNEL_URL ? <a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noreferrer">{t('comet.openYoutube')}<Icon name="arrowRight" size={16} /></a> : <span className="comet-coming-label">{t('comet.comingSoon')}</span>}
              </div>
            </article>
          </div>
        </section>

        <section className="ara-support" id="support" aria-labelledby="support-title">
          <div className="ara-support-copy">
            <p className="ara-overline">{t('comet.donationKicker')}</p>
            <h2 id="support-title">{t('comet.donationTitle')}</h2>
            <p>{t('comet.donationLead')}</p>
            <ul className="ara-support-focus">
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
          <aside className="ara-support-action" aria-labelledby="donation-action-title">
            <span className="ara-support-action-icon" aria-hidden="true"><Icon name="phone" size={22} /></span>
            <p className="ara-overline">{t('comet.donationMethod')}</p>
            <h3 id="donation-action-title">{t('comet.donationActionTitle')}</h3>
            <p>{t('comet.donationActionText')}</p>
            <button
              className="ara-button ara-button-primary"
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

        <section className="ara-channels" id="channels" aria-labelledby="channels-title">
          <div className="ara-section-heading">
            <p className="ara-overline">{t('comet.channelsKicker')}</p>
            <h2 id="channels-title">{t('comet.channelsTitle')}</h2>
            <p>{t('comet.channelsLead')}</p>
          </div>
          <div className="ara-channels-list">
            {OFFICIAL_CHANNELS.map((channel) => {
              const content = <><span className="ara-channel-icon">{channel.asset ? <img src={channel.asset} alt="" /> : <Icon name={channel.icon} size={22} />}</span><span><strong>{channel.title}</strong><small>{channel.href ? t('comet.channelOpen') : t('comet.channelSoon')}</small></span>{channel.href ? <Icon name="arrowRight" size={17} /> : null}</>;
              return channel.href ? <a className="ara-channel" href={channel.href} target="_blank" rel="noreferrer" key={channel.key}>{content}</a> : <div className="ara-channel is-unavailable" key={channel.key}>{content}</div>;
            })}
          </div>
        </section>

        <section className="ara-final" aria-labelledby="final-title">
          <span className="ara-final-mark" aria-hidden="true"><img src="/icons/arachat-parrot-icon-192.png" alt="" /></span>
          <h2 id="final-title">{language === 'ru' ? 'Твои люди. Твоё пространство.' : t('comet.finalTitle')}</h2>
          <p>{language === 'ru' ? 'Оставайся на связи с AraChat.' : t('comet.finalText')}</p>
          <div className="ara-actions"><button className="ara-button ara-button-primary" type="button" aria-haspopup="dialog" aria-expanded={isDownloadDialogOpen} onClick={openDownloadDialog}>{ctaLabel}<Icon name="arrowRight" size={17} /></button><Link to="/download" className="ara-button ara-button-secondary">{t('onboarding.downloadNavigation')}<Icon name="arrowRight" size={17} /></Link></div>
        </section>

        <AraFooter />
      </div>

      {isDonationDialogOpen ? (
        <div className="ara-donation-dialog-layer" role="presentation" onMouseDown={closeDonationDialog}>
          <section
            className="ara-donation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-dialog-title"
            aria-describedby="donation-dialog-description"
            ref={donationDialogRef}
            tabIndex="-1"
            onKeyDown={trapDonationDialogFocus}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="ara-donation-dialog-close" type="button" ref={donationDialogCloseRef} onClick={closeDonationDialog} aria-label={t('common.close')}>
              <Icon name="x" size={19} />
            </button>
            <div className="ara-donation-dialog-heading">
              <span className="ara-donation-dialog-icon" aria-hidden="true"><Icon name="phone" size={22} /></span>
              <div>
                <p className="ara-overline">{t('comet.donationDialogKicker')}</p>
                <h2 id="donation-dialog-title">{t('comet.donationDialogTitle')}</h2>
                <p id="donation-dialog-description">{t('comet.donationDialogText')}</p>
              </div>
            </div>

            <ol className="ara-donation-steps">
              <li><span>1</span><p>{t('comet.donationStepOne')}</p></li>
              <li><span>2</span><p>{t('comet.donationStepTwo')}</p></li>
              <li><span>3</span><p>{t('comet.donationStepThree')}</p></li>
            </ol>

            <dl className="ara-donation-details">
              <div>
                <dt>{t('comet.donationRecipientLabel')}</dt>
                <dd>{DONATION_DETAILS.recipient}</dd>
              </div>
              <div>
                <dt>{t('comet.donationPhoneLabel')}</dt>
                <dd className="ara-donation-phone-row">
                  <strong>{DONATION_DETAILS.phoneDisplay}</strong>
                  <button className="ara-donation-copy" type="button" onClick={copyDonationPhone} aria-describedby="donation-copy-status">
                    <Icon name={donationCopyState === 'copied' ? 'check' : 'copy'} size={17} />
                    {t(donationCopyState === 'copied' ? 'common.copied' : 'comet.donationCopyPhone')}
                  </button>
                  <span id="donation-copy-status" className={`ara-donation-copy-status ${donationCopyState === 'failed' ? 'is-error' : ''}`} role="status" aria-live="polite">
                    {donationCopyState === 'failed' ? t('comet.donationCopyError') : ''}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t('comet.donationBankLabel')}</dt>
                <dd>{DONATION_DETAILS.banks.join(' · ')}</dd>
              </div>
            </dl>

            <p className="ara-donation-dialog-note"><Icon name="shield" size={16} />{t('comet.donationSafetyNote')}</p>
          </section>
        </div>
      ) : null}
      <DownloadConfirmationDialog
        isOpen={isDownloadDialogOpen}
        onClose={() => setIsDownloadDialogOpen(false)}
        returnFocusRef={downloadTriggerRef}
      />
    </main>
  );
}
