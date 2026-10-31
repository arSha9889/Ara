import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { DownloadConfirmationDialog } from './DownloadConfirmationDialog.jsx';

export function PublicSiteHeader({ activePage = 'home', minimal = false, publicOnly = true, showAuthAction = true, showLanguage = true }) {
  const { t } = useI18n();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const downloadTriggerRef = useRef(null);
  const messengerLabel = t('onboarding.openMessenger');

  const navigation = [
    { to: '/#story', label: t('comet.navigationStory'), isActive: activePage === 'home' },
    { to: '/news', label: t('comet.navigationNews'), isActive: activePage === 'news' },
    { to: '/download', label: t('onboarding.downloadNavigation'), isActive: activePage === 'download' },
    { to: '/subscription', label: 'Подписка', isActive: activePage === 'subscription' },
    { to: '/#flight', label: t('comet.navigationFlight'), isActive: false },
    { to: '/#channels', label: t('comet.navigationChannels'), isActive: false },
  ];

  function closeMenu() {
    setIsMenuOpen(false);
  }

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  function openDownloadDialog(event) {
    downloadTriggerRef.current = event.currentTarget;
    closeMenu();
    setIsDownloadDialogOpen(true);
  }

  return (
    <>
      <header className={`ara-site-header ${minimal ? 'is-minimal' : ''}`}>
        <Link to="/" className="ara-brand" onClick={closeMenu}>
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
          {showAuthAction ? <button className="ara-header-cta" type="button" aria-haspopup="dialog" aria-expanded={isDownloadDialogOpen} onClick={openDownloadDialog}>{messengerLabel}</button> : null}
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

        {!minimal ? <>
          {isMenuOpen ? <button className="ara-mobile-menu-backdrop" type="button" aria-label={t('common.close')} onClick={closeMenu} /> : null}
          <nav className={`ara-mobile-navigation ${isMenuOpen ? 'is-open' : ''}`} id="ara-mobile-navigation" aria-label={t('common.navigation')} aria-hidden={!isMenuOpen}>
          {navigation.map((item) => <Link to={item.to} onClick={closeMenu} key={item.to}>{item.label}</Link>)}
          {showAuthAction ? <button className="ara-header-cta" type="button" aria-haspopup="dialog" aria-expanded={isDownloadDialogOpen} onClick={openDownloadDialog}>{messengerLabel}</button> : null}
          </nav>
        </> : null}
      </header>
      <DownloadConfirmationDialog
        isOpen={isDownloadDialogOpen}
        onClose={() => setIsDownloadDialogOpen(false)}
        returnFocusRef={downloadTriggerRef}
      />
    </>
  );
}
