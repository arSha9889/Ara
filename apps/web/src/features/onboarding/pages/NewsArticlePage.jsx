import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraFooter } from '../components/AraFooter.jsx';
import { PublicSiteHeader } from '../components/PublicSiteHeader.jsx';
import { getPublishedProjectNewsArticle } from '../api/projectNewsApi.js';

export function NewsArticlePage() {
  const { slug } = useParams();
  const { language, t } = useI18n();
  const [article, setArticle] = useState(undefined);

  useEffect(() => {
    let isCurrent = true;
    setArticle(undefined);

    getPublishedProjectNewsArticle(slug, language).then((item) => {
      if (isCurrent) setArticle(item);
    }).catch(() => {
      if (isCurrent) setArticle(null);
    });

    return () => { isCurrent = false; };
  }, [language, slug]);

  return (
    <main className="public-page ara-page ara-news-page ara-article-page">
      <div className="ara-shell ara-news-shell">
        <a className="ara-skip-link" href="#article-content">{t('common.skipToContent')}</a>
        <PublicSiteHeader activePage="news" />

        {article ? (
          <article className="ara-article" id="article-content" tabIndex="-1" aria-labelledby="article-title">
            <div className="ara-article-meta">
              <Link to="/news"><Icon name="arrowLeft" size={17} />{t('comet.backToNews')}</Link>
              <time dateTime={article.published_at}>{new Date(article.published_at).toLocaleDateString(language)}</time>
            </div>
            <p className="ara-overline">{t('comet.newsKicker')}</p>
            <h1 id="article-title">{article.title}</h1>
            <p className="ara-article-lead">{article.excerpt}</p>
            <div className="ara-article-body">
              {article.content?.map((paragraph, index) => <p key={`${article.slug}-${index}`}>{paragraph}</p>)}
            </div>
          </article>
        ) : article === null ? (
          <section className="ara-news-empty ara-article-missing" id="article-content" tabIndex="-1" aria-labelledby="article-missing-title">
            <span className="ara-news-empty-icon" aria-hidden="true"><Icon name="search" size={24} /></span>
            <div>
              <p className="ara-overline">AraChat</p>
              <h1 id="article-missing-title">{t('comet.articleMissingTitle')}</h1>
              <p>{t('comet.articleMissingText')}</p>
              <Link to="/news" className="ara-button ara-button-primary">{t('comet.backToNews')}<Icon name="arrowRight" size={17} /></Link>
            </div>
          </section>
        ) : (
          <section className="ara-article-loading" id="article-content" tabIndex="-1" aria-live="polite" aria-busy="true">
            <span className="ara-sr-only">{t('common.loading')}</span>
            <div className="ara-news-skeleton" aria-hidden="true" />
            <div className="ara-news-skeleton" aria-hidden="true" />
            <div className="ara-news-skeleton" aria-hidden="true" />
          </section>
        )}

        <AraFooter />
      </div>
    </main>
  );
}
