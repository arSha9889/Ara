import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { CometSiteHeader } from '../components/CometSiteHeader.jsx';
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
    <main className="public-page comet-page comet-news-page">
      <div className="comet-shell">
        <CometSiteHeader activePage="news" />
        {article ? (
          <article className="comet-article">
            <p className="comet-kicker">{new Date(article.published_at).toLocaleDateString(language)}</p>
            <h1>{article.title}</h1>
            <p className="comet-article-lead">{article.excerpt}</p>
            {article.content?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </article>
        ) : article === null ? (
          <section className="comet-news-empty comet-article-missing" aria-labelledby="article-missing-title">
            <span className="comet-news-empty-icon"><Icon name="search" size={24} /></span>
            <div>
              <p className="comet-kicker">AraChat Comet</p>
              <h1 id="article-missing-title">{t('comet.articleMissingTitle')}</h1>
              <p>{t('comet.articleMissingText')}</p>
              <Link to="/news" className="button button-primary">{t('comet.backToNews')}<Icon name="arrowRight" size={17} /></Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
