// Service worker tối thiểu (passthrough) — KHÔNG cache, để CRM luôn dữ liệu tươi.
// Mục đích duy nhất: giúp trình duyệt coi web là "installable" và hiện nút Cài đặt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Không đăng ký handler 'fetch' → mọi request đi thẳng ra mạng như bình thường.
