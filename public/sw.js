/* 知了 Service Worker：接收推送并弹出系统通知 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = '知了 · 校园通知';
    let body = '有新的校园通知，点开看看';
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      const unread = (data.items || []).filter((i) => !i.is_read);
      if (unread.length) {
        const first = unread[0];
        title = first.title.slice(0, 40);
        body = `${unread.length} 条未读 · ${(first.summary || '').slice(0, 60)}`;
      } else {
        body = '暂时没有未读，点开看看';
      }
    } catch (e) {}
    await self.registration.showNotification(title, {
      body,
      tag: 'zhiliao-new',
      renotify: true,
      data: { url: '/' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.includes('127.0.0.1') || c.url.includes('localhost') || c.url.includes('onrender.com')) {
        return c.focus();
      }
    }
    return self.clients.openWindow('/');
  })());
});
