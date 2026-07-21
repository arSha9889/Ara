import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { deleteAccount, logoutSession } from '../../features/auth/api/authApi.js';
import { NotificationsMenu } from '../../features/notifications/components/NotificationsMenu.jsx';
import { useI18n } from '../providers/I18nProvider.jsx';
import { useNotifications } from '../providers/NotificationsProvider.jsx';
import { useSession } from '../providers/SessionProvider.jsx';

export function AppShell() {
  const { t } = useI18n();
  const { session, clearSession } = useSession();
  const { disableNotifications } = useNotifications();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isChatRoute = location.pathname.startsWith('/app/chats/');
  const navItems = [
    { to: '/app', icon: '💬', label: t('chats.title') },
    { to: '/app/profile', icon: '👤', label: t('profile.title') },
    { to: '/app/settings', icon: '⚙️', label: t('settings.title') },
  ];

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

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
    <div className={`app-shell ${isMenuOpen ? 'is-mobile-menu-open' : ''} ${isChatRoute ? 'is-chat-route' : ''}`}>
      <aside className="app-sidebar" aria-label={t('common.navigation')}>
        <div className="app-sidebar-topbar">
          <NavLink className="brand" to="/app" aria-label="Nexus" onClick={() => setIsMenuOpen(false)}>
            <img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" />
            <span>Nexus</span>
          </NavLink>
          <NotificationsMenu />
        </div>
        <div className={`app-menu ${isMenuOpen ? 'is-open' : ''}`}>
          <button
            className="app-menu-trigger"
            type="button"
            aria-label={t('common.navigation')}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <span className="app-menu-orb" aria-hidden="true">☰</span>
            <span>Меню</span>
            <span className="app-menu-chevron" aria-hidden="true">⌄</span>
          </button>
          <div className="app-menu-panel">
            <nav className="nav-list">
              {navItems.map((item) => (
                <NavLink to={item.to} key={item.to} end={item.to === '/app'} onClick={() => setIsMenuOpen(false)}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <button className="button button-secondary account-action-button logout-button" type="button" onClick={handleLogout}>
              <span className="account-action-icon" aria-hidden="true">↩</span>
              <span>{t('common.logout')}</span>
            </button>
            <button className="button button-danger account-action-button delete-account-button" type="button" onClick={handleDeleteAccount}>
              <span className="account-action-icon" aria-hidden="true">🗑</span>
              <span>{t('settings.deleteAccount')}</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
      {!isChatRoute ? (
        <nav className="mobile-bottom-nav" aria-label={t('common.navigation')}>
          {navItems.map((item) => (
            <NavLink className="mobile-bottom-nav-item" to={item.to} key={item.to} end={item.to === '/app'} onClick={() => setIsMenuOpen(false)}>
              <span className="mobile-bottom-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
