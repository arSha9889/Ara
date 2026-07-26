self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let notification = {};
  try {
    notification = event.data?.json() ?? {};
  } catch {
    notification = {
      title: 'AraChat — проверка Push',
      body: event.data?.text() || 'Тестовое push-уведомление',
      url: '/app',
    };
  }
  const options = {
    body: notification.body || 'Новое сообщение в AraChat',
    icon: '/icons/arachat-parrot-icon-192.png',
    badge: '/icons/arachat-parrot-icon-192.png',
    tag: notification.chat_id || notification.id || 'arachat-push-test',
    renotify: true,
    data: { url: notification.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(notification.title || 'AraChat', options));
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
