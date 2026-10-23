import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { APP_DISTRIBUTION } from '../../../shared/config/projectLinks.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraFooter } from '../components/AraFooter.jsx';
import { AraProductPreview } from '../components/AraProductPreview.jsx';
import { CometSiteHeader } from '../components/CometSiteHeader.jsx';

function getPlatformAvailability(platform) {
  const channels = platform.groups.flatMap((group) => group.channels);
  return {
    hasAvailableChannel: channels.some((channel) => Boolean(channel.href)),
    hasUnavailableChannel: channels.some((channel) => !channel.href),
  };
}

function DownloadStatus({ isAvailable, t }) {
  const label = t(isAvailable ? 'onboarding.downloadAvailable' : 'onboarding.downloadSoon');

  return <span className={`ara-download-status ${isAvailable ? 'is-available' : ''}`}><span aria-hidden="true" />{label}</span>;
}

function DownloadAction({ channel, t }) {
  const isAvailable = Boolean(channel.href);
  const content = (
    <>
        <span className="ara-download-action-icon" aria-hidden="true"><Icon name={channel.icon} size={20} /></span>
        <span className="ara-download-action-copy">
        <strong>{t(channel.labelKey)}</strong>
        <small>{t(channel.descriptionKey)}</small>
      </span>
      {isAvailable ? (
          <span className="ara-download-action-arrow" aria-hidden="true"><Icon name="arrowRight" size={18} /></span>
      ) : (
        <DownloadStatus isAvailable={false} t={t} />
      )}
    </>
  );

  return isAvailable ? (
    <a className="ara-download-action is-ready" href={channel.href} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <div className="ara-download-action is-unavailable">
      {content}
    </div>
  );
}

function DownloadPlatformPanel({ platform, isActive, t }) {
  const { hasAvailableChannel, hasUnavailableChannel } = getPlatformAvailability(platform);
  const releaseNoteKey = hasAvailableChannel
    ? hasUnavailableChannel
      ? 'onboarding.downloadReleaseNotePartial'
      : 'onboarding.downloadReleaseNoteAvailable'
    : 'onboarding.downloadReleaseNote';

  return (
    <section
      className={`ara-download-panel ${isActive ? 'is-active' : ''}`}
      id={`download-panel-${platform.key}`}
      role="tabpanel"
      aria-labelledby={`download-tab-${platform.key}`}
      hidden={!isActive}
      tabIndex={isActive ? 0 : -1}
    >
      <div className="ara-download-panel-intro">
        <span className="ara-download-platform-icon" aria-hidden="true"><Icon name={platform.icon} size={28} /></span>
        <div>
          <div className="ara-download-panel-title-row">
            <p className="ara-overline">{t(platform.labelKey)}</p>
            <DownloadStatus isAvailable={hasAvailableChannel} t={t} />
          </div>
          <h2>{t(platform.descriptionKey)}</h2>
          {platform.requirementKey ? <p className="ara-download-requirement"><Icon name="check" size={16} />{t(platform.requirementKey)}</p> : null}
        </div>
      </div>

      <div className="ara-download-groups">
        {platform.groups.map((group) => (
          <article className="ara-download-group" key={group.key}>
            <div className="ara-download-group-heading">
              <span className="ara-download-group-icon" aria-hidden="true"><Icon name={group.icon} size={21} /></span>
              <div>
                <h3>{t(group.titleKey)}</h3>
                <p>{t(group.descriptionKey)}</p>
              </div>
            </div>
            <div className="ara-download-actions">
              {group.channels.map((channel) => <DownloadAction channel={channel} t={t} key={channel.key} />)}
            </div>
          </article>
        ))}
      </div>

      <p className="ara-download-release-note"><Icon name="sparkles" size={18} />{t(releaseNoteKey)}</p>
    </section>
  );
}

export function DownloadPage() {
  const { language, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef([]);
  const requestedPlatformKey = searchParams.get('platform');
  const activePlatform = APP_DISTRIBUTION.find((platform) => platform.key === requestedPlatformKey) ?? APP_DISTRIBUTION[0];

  function selectPlatform(platformKey) {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (platformKey === APP_DISTRIBUTION[0].key) {
      nextSearchParams.delete('platform');
    } else {
      nextSearchParams.set('platform', platformKey);
    }
    setSearchParams(nextSearchParams, { replace: true });
  }

  function handleTabKeyDown(event, index) {
    const isPrevious = event.key === 'ArrowLeft';
    const isNext = event.key === 'ArrowRight';
    const isFirst = event.key === 'Home';
    const isLast = event.key === 'End';

    if (!isPrevious && !isNext && !isFirst && !isLast) return;

    event.preventDefault();
    const nextIndex = isFirst
      ? 0
      : isLast
        ? APP_DISTRIBUTION.length - 1
        : (index + (isPrevious ? -1 : 1) + APP_DISTRIBUTION.length) % APP_DISTRIBUTION.length;
    const nextPlatform = APP_DISTRIBUTION[nextIndex];
    selectPlatform(nextPlatform.key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <main className="public-page ara-page ara-download-page" aria-labelledby="download-title">
      <div className="ara-shell">
        <a className="ara-skip-link" href="#download-content">{t('common.skipToContent')}</a>
        <CometSiteHeader activePage="download" />

        <section className="ara-download-hero" id="download-content" tabIndex="-1">
          <div>
            <p className="ara-overline">{t('onboarding.downloadPageKicker')}</p>
            <h1 id="download-title">{language === 'ru' ? 'AraChat на твоём устройстве.' : t('onboarding.downloadPageTitle')}</h1>
            <p>{t('onboarding.downloadPageText')}</p>
            <p className="ara-download-hero-note"><Icon name="shield" size={17} />{t('onboarding.downloadOfficialSourcesNote')}</p>
          </div>
          <AraProductPreview compact />
        </section>

        <section className="ara-download-selector" aria-labelledby="download-platforms-title">
          <div className="ara-section-heading">
            <p className="ara-overline">{t('onboarding.downloadPlatformsLabel')}</p>
            <h2 id="download-platforms-title">{t('onboarding.downloadPlatformsTitle')}</h2>
          </div>
          <div className="ara-download-tabs" role="tablist" aria-label={t('onboarding.downloadPlatformsLabel')}>
            {APP_DISTRIBUTION.map((platform, index) => {
              const isActive = platform.key === activePlatform.key;
              const tabId = `download-tab-${platform.key}`;
              const panelId = `download-panel-${platform.key}`;

              return (
                <button
                  className={`ara-download-tab ${isActive ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  id={tabId}
                  aria-controls={panelId}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  key={platform.key}
                  onClick={() => selectPlatform(platform.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  <span className="ara-download-tab-icon" aria-hidden="true"><Icon name={platform.icon} size={21} /></span>
                  <span>{t(platform.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {APP_DISTRIBUTION.map((platform) => (
          <DownloadPlatformPanel
            platform={platform}
            isActive={platform.key === activePlatform.key}
            t={t}
            key={platform.key}
          />
        ))}

        <section className="ara-security-notice" aria-labelledby="download-security-title">
          <span className="ara-security-icon" aria-hidden="true"><Icon name="shield" size={24} /></span>
          <div>
            <h2 id="download-security-title">Официальный источник установки</h2>
            <p>{t('onboarding.downloadOfficialSourcesNote')} {t('onboarding.downloadApkText')}</p>
            <p>Для Android загружайте APK только по кнопке на этой странице. Перед установкой проверьте адрес сайта в браузере.</p>
          </div>
        </section>

        <AraFooter />
      </div>
    </main>
  );
}
