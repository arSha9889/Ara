import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { getProjectNewsBySlug } from '../../../shared/config/projectNews.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { CometSiteHeader } from '../components/CometSiteHeader.jsx';

export function NewsArticlePage() {
  const { slug } = useParams();
  const { t } = useI18n();
  const article = getProjectNewsBySlug(slug);

  return (
    <main className="public-page comet-page comet-news-page">
      <div className="comet-shell">
        <CometSiteHeader activePage="news" />
        {article ? (
          <article className="comet-article">
            <p className="comet-kicker">{article.publishedAt}</p>
            <h1>{article.title}</h1>
            <p className="comet-article-lead">{article.excerpt}</p>
            {article.content?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </article>
        ) : (
          <section className="comet-news-empty comet-article-missing" aria-labelledby="article-missing-title">
            <span className="comet-news-empty-icon"><Icon name="search" size={24} /></span>
            <div>
              <p className="comet-kicker">AraChat Comet</p>
              <h1 id="article-missing-title">{t('comet.articleMissingTitle')}</h1>
              <p>{t('comet.articleMissingText')}</p>
              <Link to="/news" className="button button-primary">{t('comet.backToNews')}<Icon name="arrowRight" size={17} /></Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
