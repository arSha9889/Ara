export function shouldPromptForNotificationPermission({ desktopNotifications, permission }) {
  return desktopNotifications !== false && permission === 'default';
}
