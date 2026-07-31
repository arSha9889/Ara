import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { deleteAccount, logoutSession } from '../../features/auth/api/authApi.js';
import { NotificationsMenu } from '../../features/notifications/components/NotificationsMenu.jsx';
import { useI18n } from '../providers/I18nProvider.jsx';
import { useNotifications } from '../providers/NotificationsProvider.jsx';
import { useSession } from '../providers/SessionProvider.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';

export function AppNavigationTrigger({ isMenuOpen, onToggle, className = '' }) {
  const { t } = useI18n();

  return (
    <button
      className={`app-navigation-trigger ${className}`.trim()}
      type="button"
      aria-label={t('common.navigation')}
      aria-expanded={isMenuOpen}
      onClick={onToggle}
    >
      <Icon name={isMenuOpen ? 'x' : 'menu'} size={22} />
    </button>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const { session, clearSession } = useSession();
  const { disableNotifications } = useNotifications();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isChatRoute = location.pathname.startsWith('/app/chats/');
  const isChatsWorkspace = location.pathname === '/app' || isChatRoute;
  const isAdministrator = session.user?.is_official === true;
  const navItems = [
    { to: '/app', icon: 'chat', label: t('chats.title') },
    { to: '/app/branches', icon: 'branches', label: t('chats.publicBranches') },
    { to: '/app/profile', icon: 'user', label: t('profile.title') },
    { to: '/app/settings', icon: 'settings', label: t('settings.title') },
    ...(isAdministrator ? [{ to: '/admin', icon: 'shield', label: t('auth.adminEntry') }] : []),
  ];
  const mobileNavItems = navItems.filter((item) => item.to !== '/app/branches');

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleLogout() {
    await disableNotifications().catch(() => undefined);
    await logoutSession(session.refreshToken).catch(() => null);
    clearSession();
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t('settings.deleteAccountConfirm'))) return;
    await disableNotifications().catch(() => undefined);
    await deleteAccount(session.accessToken);
    clearSession();
  }

  return (
    <div className={`app-shell ${isMenuOpen ? 'is-navigation-open' : ''} ${isChatRoute ? 'is-chat-route' : ''}`}>
      {!isChatsWorkspace ? <AppNavigationTrigger isMenuOpen={isMenuOpen} onToggle={() => setIsMenuOpen((current) => !current)} /> : null}
      {isMenuOpen ? <button className="app-navigation-backdrop" type="button" aria-label={t('common.close')} onClick={() => setIsMenuOpen(false)} /> : null}
      <aside className="app-navigation-drawer" aria-label={t('common.navigation')} aria-hidden={!isMenuOpen} inert={!isMenuOpen ? '' : undefined}>
        <div className="app-navigation-topbar">
          <NavLink className="brand" to="/app" aria-label="AraChat" onClick={() => setIsMenuOpen(false)}>
            <img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" />
            <span>AraChat</span>
          </NavLink>
          <NotificationsMenu />
        </div>
        <div className="app-navigation-content">
          <nav className="nav-list">
            {navItems.map((item) => (
              <NavLink to={item.to} key={item.to} end={item.to === '/app'} onClick={() => setIsMenuOpen(false)}>
                <span className="nav-icon" aria-hidden="true"><Icon name={item.icon} size={18} /></span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="app-navigation-account-actions">
            <button className="button button-secondary account-action-button logout-button" type="button" onClick={handleLogout}>
              <span className="account-action-icon" aria-hidden="true"><Icon name="logout" size={18} /></span>
              <span>{t('common.logout')}</span>
            </button>
            <button className="button button-danger account-action-button delete-account-button" type="button" onClick={handleDeleteAccount}>
              <span className="account-action-icon" aria-hidden="true"><Icon name="trash" size={18} /></span>
              <span>{t('settings.deleteAccount')}</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <Outlet context={{ isMenuOpen, toggleNavigation: () => setIsMenuOpen((current) => !current) }} />
      </main>
      <nav className="mobile-bottom-nav" aria-label={t('common.navigation')}>
          {mobileNavItems.map((item) => (
            <NavLink
              className={({ isActive }) => `mobile-bottom-nav-item ${isActive || (item.to === '/app' && isChatRoute) ? 'active' : ''}`}
              to={item.to}
              key={item.to}
              end={item.to === '/app'}
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="mobile-bottom-nav-icon" aria-hidden="true"><Icon name={item.icon} size={21} /></span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
    </div>
  );
}
