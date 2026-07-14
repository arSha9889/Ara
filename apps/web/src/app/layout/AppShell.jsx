import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { logoutSession } from '../../features/auth/api/authApi.js';
import { NotificationsMenu } from '../../features/notifications/components/NotificationsMenu.jsx';
import { LanguageSwitcher } from '../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../shared/ui/ThemeSwitcher.jsx';
import { useI18n } from '../providers/I18nProvider.jsx';
import { useNotifications } from '../providers/NotificationsProvider.jsx';
import { useSession } from '../providers/SessionProvider.jsx';

export function AppShell() {
  const { t } = useI18n();
  const { session, clearSession } = useSession();
  const { disableNotifications } = useNotifications();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navItems = [
    { to: '/app', icon: '💬', label: t('chats.title') },
    { to: '/app/profile', icon: '👤', label: t('profile.title') },
    { to: '/app/settings', icon: '⚙️', label: t('settings.title') },
  ];

  async function handleLogout() {
    await disableNotifications().catch(() => undefined);
    await logoutSession(session.refreshToken).catch(() => null);
    clearSession();
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label={t('common.navigation')}>
        <div className="app-sidebar-topbar">
          <NavLink className="brand" to="/app" aria-label="Nexus">
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
            <div className="app-menu-section">
              <div className="app-menu-switcher">
                <span className="nav-icon" aria-hidden="true">🌐</span>
                <LanguageSwitcher />
              </div>
              <div className="app-menu-switcher">
                <span className="nav-icon" aria-hidden="true">🎨</span>
                <ThemeSwitcher />
              </div>
            </div>
            <button className="button button-secondary logout-button" type="button" onClick={handleLogout}>
              <span aria-hidden="true">↩</span>
              <span>{t('common.logout')}</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
