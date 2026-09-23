import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useTheme } from '../../../app/providers/ThemeProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';

const themeLabels = {
  halo: 'HALO',
  comet: 'COMET',
  liquid_glass: 'GLASS',
};

export function PublicSiteHeader({ activePage = 'home', minimal = false, publicOnly = true, showAuthAction = true, showLanguage = true }) {
  const { t } = useI18n();
  const { session } = useSession();
  const { theme } = useTheme();
  const isAuthenticated = Boolean(session?.accessToken);

  return (
    <header className={`public-site-header comet-site-header ${minimal ? 'is-minimal' : ''}`}>
      <Link to="/" className="brand compact comet-brand public-brand">
        <img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" />
        <span>AraChat</span>
        <small>{themeLabels[theme] ?? themeLabels.halo}</small>
      </Link>
      {!minimal ? (
        <nav className="public-site-nav comet-site-nav" aria-label={t('common.navigation')}>
          <Link to="/#story" aria-current={activePage === 'home' ? 'page' : undefined}>{t('comet.navigationStory')}</Link>
          <Link to="/news" aria-current={activePage === 'news' ? 'page' : undefined}>{t('comet.navigationNews')}</Link>
          <Link to="/#flight">{t('comet.navigationFlight')}</Link>
          <Link to="/#channels">{t('comet.navigationChannels')}</Link>
        </nav>
      ) : <span className="public-site-header-spacer" aria-hidden="true" />}
      <div className="public-site-actions comet-site-actions">
        {showLanguage ? <LanguageSwitcher publicOnly={publicOnly} /> : null}
        <ThemeSwitcher />
        {showAuthAction && !isAuthenticated ? <Link to="/login" className="public-site-auth-action comet-login-link">{t('onboarding.login')}</Link> : null}
        {showAuthAction && isAuthenticated ? <Link to="/app" className="public-site-auth-action comet-login-link">{t('onboarding.enterMessenger')}</Link> : null}
      </div>
    </header>
  );
}
