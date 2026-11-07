function SettingToggle({ checked, onChange, label, description }) {
  return (
    <div className="setting-toggle-row">
      <div><strong>{label}</strong><span>{description}</span></div>
      <button className={`setting-switch ${checked ? 'is-on' : ''}`} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

export function NotificationSettings({ notificationPermission, onDesktopNotificationsChange, onPreferenceChange, preferences, t }) {
  return (
    <div className="settings-content">
      <div className="workspace-section-card">
        <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.notificationsTitle')}</h2><p>{t('workspace.settingsPanel.notificationsText')}</p></div></div>
        <SettingToggle checked={preferences.desktopNotifications ?? true} onChange={onDesktopNotificationsChange} label={t('workspace.settingsPanel.desktopNotifications')} description={t('workspace.settingsPanel.desktopNotificationsText')} />
        <SettingToggle checked={preferences.messagePreview ?? true} onChange={(messagePreview) => onPreferenceChange({ messagePreview })} label={t('workspace.settingsPanel.messagePreview')} description={t('workspace.settingsPanel.messagePreviewText')} />
        <SettingToggle checked={preferences.soundEnabled} onChange={(soundEnabled) => onPreferenceChange({ soundEnabled })} label={t('workspace.settingsPanel.sound')} description={t('workspace.settingsPanel.soundText')} />
      </div>
      <div className="workspace-backend-note"><span aria-hidden="true" />{notificationPermission === 'granted' ? t('workspace.settingsPanel.notificationsReady') : t('workspace.settingsPanel.notificationsNotice')}</div>
    </div>
  );
}
