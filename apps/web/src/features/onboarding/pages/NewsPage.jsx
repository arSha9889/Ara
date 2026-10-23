import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { OFFICIAL_CHANNELS } from '../../../shared/config/projectLinks.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraFooter } from '../components/AraFooter.jsx';
import { PublicSiteHeader } from '../components/PublicSiteHeader.jsx';
import { getPublishedProjectNews } from '../api/projectNewsApi.js';

export function NewsPage() {
  const { language, t } = useI18n();
  const [news, setNews] = useState([]);
  const [status, setStatus] = useState('loading');
  const [requestVersion, setRequestVersion] = useState(0);
  const activeChannels = OFFICIAL_CHANNELS.filter((channel) => channel.href);

  useEffect(() => {
    let isCurrent = true;
    setStatus('loading');

    getPublishedProjectNews(language).then((items) => {
      if (!isCurrent) return;
      setNews(items);
      setStatus('ready');
    }).catch(() => {
      if (!isCurrent) return;
      setNews([]);
      setStatus('error');
    });

    return () => { isCurrent = false; };
  }, [language, requestVersion]);

  return (
    <main className="public-page ara-page ara-news-page" aria-labelledby="news-title">
      <div className="ara-shell ara-news-shell">
        <a className="ara-skip-link" href="#news-content">{t('common.skipToContent')}</a>
        <PublicSiteHeader activePage="news" />

        <section className="ara-editorial-hero" id="news-content" tabIndex="-1">
          <div>
            <p className="ara-overline">{t('comet.newsKicker')}</p>
            <h1 id="news-title">{t('comet.newsTitle')}</h1>
            <p>{t('comet.newsLead')}</p>
          </div>
          <div className="ara-editorial-hero-signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        {status === 'loading' ? (
          <section className="ara-news-loading" aria-live="polite" aria-busy="true">
            <span className="ara-sr-only">{t('common.loading')}</span>
            {[0, 1, 2].map((item) => <div className="ara-news-skeleton" key={item} aria-hidden="true" />)}
          </section>
        ) : news.length ? (
          <section className="ara-news-feed" aria-label={t('comet.newsTitle')}>
            {news.map((item, index) => (
              <article className="ara-journal-entry" key={item.slug}>
                <div className="ara-journal-entry-meta">
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <time dateTime={item.published_at}>{new Date(item.published_at).toLocaleDateString(language)}</time>
                </div>
                <div>
                  <h2><Link to={`/news/${item.slug}`}>{item.title}<Icon name="arrowRight" size={20} /></Link></h2>
                  <p>{item.excerpt}</p>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="ara-news-empty" aria-labelledby="news-empty-title" aria-live={status === 'error' ? 'assertive' : undefined}>
            <span className="ara-news-empty-icon" aria-hidden="true"><Icon name={status === 'error' ? 'refresh' : 'sparkles'} size={25} /></span>
            <div>
              <p className="ara-overline">{t('comet.newsEmptyKicker')}</p>
              <h2 id="news-empty-title">{t('comet.newsEmptyTitle')}</h2>
              <p>{t('comet.newsEmptyText')}</p>
              {status === 'error' ? <button className="ara-button ara-button-secondary" type="button" onClick={() => setRequestVersion((version) => version + 1)}>{t('common.retry')}<Icon name="refresh" size={17} /></button> : null}
            </div>
            {activeChannels.length ? <div className="ara-news-channel-links">
              {activeChannels.map((channel) => <a href={channel.href} target="_blank" rel="noreferrer" key={channel.key}>{channel.title}<Icon name="arrowRight" size={15} /></a>)}
            </div> : null}
          </section>
        )}

        <AraFooter />
      </div>
    </main>
  );
}
