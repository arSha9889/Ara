self.addEventListener('push', (event) => {
  let notification = {};
  let isDevToolsTest = false;
  try {
    notification = event.data?.json() ?? {};
  } catch {
    notification = {
      title: 'Nexus — проверка Push',
      body: event.data?.text() || 'Тестовое push-уведомление',
      url: '/app',
    };
    isDevToolsTest = true;
  }
  const options = {
    body: notification.body || 'Новое сообщение в Nexus',
    icon: '/icons/nexus-icon-192.png',
    badge: '/icons/nexus-icon-192.png',
    tag: notification.chat_id || notification.id || 'nexus-push-test',
    renotify: true,
    data: { url: notification.url || '/app' },
  };
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasVisibleNexusWindow = windows.some((client) => (
      client.url.startsWith(self.location.origin) && client.visibilityState === 'visible'
    ));
    if (isDevToolsTest || !hasVisibleNexusWindow) {
      await self.registration.showNotification(notification.title || 'Nexus', options);
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      existing.navigate(targetUrl);
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});
