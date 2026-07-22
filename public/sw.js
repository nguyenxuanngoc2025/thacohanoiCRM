// Service worker tối thiểu (passthrough) — KHÔNG cache, để CRM luôn dữ liệu tươi.
// Mục đích duy nhất: giúp trình duyệt coi web là "installable" và hiện nút Cài đặt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Không đăng ký handler 'fetch' → mọi request đi thẳng ra mạng như bình thường.

// ── Web Push (thông báo cá nhân) ─────────────────────────────────────────────
// Nhận payload JSON { title, body, url, tag } từ server → hiện thông báo hệ thống.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'CRM Thaco Auto';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/leads' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Bấm vào thông báo → mở/đưa lên trước tab tới url đính kèm.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/leads';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
