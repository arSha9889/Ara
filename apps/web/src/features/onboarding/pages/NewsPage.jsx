import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { OFFICIAL_CHANNELS } from '../../../shared/config/projectLinks.js';
import { getPublishedProjectNews } from '../../../shared/config/projectNews.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { CometSiteHeader } from '../components/CometSiteHeader.jsx';

export function NewsPage() {
  const { t } = useI18n();
  const news = getPublishedProjectNews();
  const activeChannels = OFFICIAL_CHANNELS.filter((channel) => channel.href);

  return (
    <main className="public-page comet-page comet-news-page" aria-labelledby="news-title">
      <div className="comet-shell">
        <CometSiteHeader activePage="news" />
        <section className="comet-news-hero">
          <span className="comet-news-hero-signal" aria-hidden="true" />
          <p className="comet-kicker"><span />{t('comet.newsKicker')}</p>
          <h1 id="news-title">{t('comet.newsTitle')}</h1>
          <p>{t('comet.newsLead')}</p>
        </section>

        {news.length ? (
          <section className="comet-news-timeline" aria-label={t('comet.newsTitle')}>
            {news.map((item) => (
              <article className="comet-news-entry" key={item.slug}>
                <p>{item.publishedAt}</p>
                <h2><Link to={`/news/${item.slug}`}>{item.title}</Link></h2>
                <p>{item.excerpt}</p>
              </article>
            ))}
          </section>
        ) : (
          <section className="comet-news-empty" aria-labelledby="news-empty-title">
            <span className="comet-news-empty-icon"><Icon name="sparkles" size={25} /></span>
            <div>
              <p className="comet-kicker">{t('comet.newsEmptyKicker')}</p>
              <h2 id="news-empty-title">{t('comet.newsEmptyTitle')}</h2>
              <p>{t('comet.newsEmptyText')}</p>
            </div>
            <div className="comet-news-channel-links">
              {activeChannels.map((channel) => <a href={channel.href} target="_blank" rel="noreferrer" key={channel.key}>{channel.title}<Icon name="arrowRight" size={15} /></a>)}
            </div>
          </section>
        )}

        <footer className="comet-news-footer">
          <Link to="/">{t('comet.backToHome')} <Icon name="arrowLeft" size={16} /></Link>
          <span>AraChat Comet</span>
        </footer>
      </div>
    </main>
  );
}
