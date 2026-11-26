const CACHE = 'crc-moh-final-v1';
const scope = new URL(self.registration.scope);
const app = new URL('design/potch-master.html', scope);
const assets = [
  'design/potch-master.html', 'design/potch-live.js', 'design/potch-production.css',
  'manifest.json', 'icon-192.png', 'icon-512.png', 'favicon-32.png',
  'assets/images/apple-touch-icon.png'
].map(path => new URL(path, scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => /^crc-moh-(os-|final-)/.test(key) && key !== CACHE)
      .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const isApp = event.request.mode === 'navigate' && url.pathname === app.pathname;
  if (!isApp && !assets.includes(url.href)) return;
  // Auth redirects can contain one-time credentials. Never store their URLs.
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok && !url.search) {
      const cache = await caches.open(CACHE);
      await cache.put(url.href, response.clone());
    }
    return response;
  }).catch(async () => (await caches.open(CACHE)).match(isApp ? app.href : url.href)));
});

self.addEventListener('push', event => {
  let id;
  try { id = event.data?.json()?.id; } catch { /* A generic alert still opens the inbox. */ }
  event.waitUntil(self.registration.showNotification('CRC Ministry of Helps', {
    body: 'You have a new ministry notification.',
    icon: new URL('icon-192.png', scope).href,
    badge: new URL('favicon-32.png', scope).href,
    tag: typeof id === 'string' ? 'crc-moh-' + id : 'crc-moh',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(app.href);
  target.hash = 'alerts';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).pathname === app.pathname);
    if (existing) {
      existing.postMessage({ type: 'open-alerts' });
      await existing.focus();
    } else {
      await clients.openWindow(target.href);
    }
  })());
});
