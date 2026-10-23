import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';

export function PublicSiteHeader({ activePage = 'home', minimal = false, publicOnly = true, showAuthAction = true, showLanguage = true }) {
  const { t } = useI18n();
  const { session } = useSession();
  const isAuthenticated = Boolean(session?.accessToken);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const messengerPath = isAuthenticated ? '/app' : '/register';
  const messengerLabel = isAuthenticated ? t('onboarding.enterMessenger') : t('onboarding.openMessenger');

  const navigation = [
    { to: '/#story', label: t('comet.navigationStory'), isActive: activePage === 'home' },
    { to: '/news', label: t('comet.navigationNews'), isActive: activePage === 'news' },
    { to: '/download', label: t('onboarding.downloadNavigation'), isActive: activePage === 'download' },
    { to: '/#flight', label: t('comet.navigationFlight'), isActive: false },
    { to: '/#channels', label: t('comet.navigationChannels'), isActive: false },
  ];

  return (
    <header className={`ara-site-header ${minimal ? 'is-minimal' : ''}`}>
      <Link to="/" className="ara-brand" onClick={() => setIsMenuOpen(false)}>
        <img src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" />
        <span>AraChat</span>
      </Link>

      {!minimal ? <nav className="ara-site-nav" aria-label={t('common.navigation')}>
        {navigation.map((item) => (
          <Link to={item.to} aria-current={item.isActive ? 'page' : undefined} key={item.to}>{item.label}</Link>
        ))}
      </nav> : <span className="ara-site-header-spacer" aria-hidden="true" />}

      <div className="ara-site-actions">
        {showLanguage ? <LanguageSwitcher publicOnly={publicOnly} /> : null}
        <ThemeSwitcher />
        {showAuthAction ? <Link to={messengerPath} className="ara-header-cta">{messengerLabel}</Link> : null}
        {!minimal ? <button
          className="ara-menu-toggle"
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls="ara-mobile-navigation"
          aria-label={t('common.navigation')}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <Icon name={isMenuOpen ? 'x' : 'menu'} size={21} />
        </button> : null}
      </div>

      {!minimal && isMenuOpen ? <nav className="ara-mobile-navigation" id="ara-mobile-navigation" aria-label={t('common.navigation')}>
        {navigation.map((item) => <Link to={item.to} onClick={() => setIsMenuOpen(false)} key={item.to}>{item.label}</Link>)}
        {showAuthAction ? <Link to={messengerPath} className="ara-header-cta" onClick={() => setIsMenuOpen(false)}>{messengerLabel}</Link> : null}
      </nav> : null}
    </header>
  );
}
