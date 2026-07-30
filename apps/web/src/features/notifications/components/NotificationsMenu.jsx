import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';

export function NotificationsMenu() {
  const { t, language } = useI18n();
  const { notifications, unreadCount, isLoading, markAllRead, markNotificationRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  async function openNotification(notification) {
    setIsOpen(false);
    await markNotificationRead(notification.id);
    navigate(notification.url);
  }

  return (
    <div className={`notifications-menu ${isOpen ? 'is-open' : ''}`} ref={menuRef}>
      <button
        className="notification-bell"
        type="button"
        aria-label={t('notifications.title')}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon name="bell" size={19} />
        {unreadCount ? <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      <section className="notifications-popover" aria-label={t('notifications.title')}>
        <header className="notifications-popover-header">
          <div>
            <strong>{t('notifications.title')}</strong>
            {unreadCount ? <span>{t('notifications.unread').replace('{count}', unreadCount)}</span> : null}
          </div>
          <button className="text-button" type="button" onClick={markAllRead} disabled={!unreadCount}>{t('notifications.markAllRead')}</button>
        </header>
        <div className="notification-list">
          {isLoading ? <p className="muted">{t('notifications.loading')}</p> : null}
          {!isLoading && !notifications.length ? <p className="muted notification-empty">{t('notifications.empty')}</p> : null}
          {notifications.map((notification) => (
            <button className={`notification-item ${notification.read_at ? '' : 'unread'}`} type="button" key={notification.id} onClick={() => openNotification(notification)}>
              <span className="notification-item-icon" aria-hidden="true">✦</span>
              <span>
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
                <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString(language)}</time>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
