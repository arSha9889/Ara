import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { AraButton } from '../../components/AraButton.jsx';

function formatNotificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang || 'ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function NotificationsPanel({ error, isLoading, isUpdating, notifications, onClearHistory, onMarkAllRead, onOpenNotification, onRetry, t }) {
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <section className="workspace-detail-panel workspace-notifications-panel" aria-labelledby="notifications-title">
      <header className="workspace-panel-heading">
        <div><p>{t('workspace.notificationsPanel.kicker')}</p><h1 id="notifications-title">{t('workspace.notificationsPanel.title')}</h1><span>{t('workspace.notificationsPanel.intro')}</span></div>
        <span className="workspace-panel-icon"><Icon name="bell" size={25} /></span>
      </header>
      <div className="workspace-section-card">
        <div className="workspace-section-heading">
          <div><h2>{t('workspace.notificationsPanel.inboxTitle')}</h2><p>{unreadCount ? t('workspace.notificationsPanel.unread', { count: unreadCount }) : t('workspace.notificationsPanel.allRead')}</p></div>
          <div className="notification-actions"><AraButton className="notification-mark-all" type="button" onClick={onMarkAllRead} disabled={!unreadCount || isLoading || isUpdating} size="compact" variant="secondary">{t('workspace.notificationsPanel.markAllRead')}</AraButton><AraButton className="notification-clear-history" type="button" onClick={onClearHistory} disabled={!notifications.length || isLoading || isUpdating} size="compact" variant="secondary">{t('workspace.notificationsPanel.clearHistory')}</AraButton></div>
        </div>
        {error ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.notificationsPanel.loadError')}</strong><span>{error}</span><AraButton type="button" onClick={onRetry} size="compact" variant="primary">{t('workspace.retry')}</AraButton></div> : null}
        {isLoading ? <p className="notification-list-status" role="status">{t('workspace.notificationsPanel.loading')}</p> : error ? null : notifications.length ? <div className="desktop-notification-list">
          {notifications.map((notification) => <AraButton className={`desktop-notification-row ${notification.read_at ? '' : 'is-unread'}`} type="button" key={notification.id} onClick={() => onOpenNotification(notification)} variant="ghost">
            <span className="desktop-notification-icon"><Icon name="bell" size={17} /></span>
            <span><strong>{notification.title}</strong><small>{notification.body}</small><time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time></span>
            {!notification.read_at ? <i aria-label={t('workspace.notificationsPanel.unreadIndicator')} /> : null}
          </AraButton>)}
        </div> : <div className="notifications-empty"><span className="feature-state-icon"><Icon name="bell" size={24} /></span><strong>{t('workspace.notificationsPanel.emptyTitle')}</strong><p>{t('workspace.notificationsPanel.emptyText')}</p></div>}
      </div>
    </section>
  );
}
