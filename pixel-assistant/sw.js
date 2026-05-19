const CACHE = 'pixel-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/memory.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon.svg'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  // Pass through API calls, only cache app shell
  if (e.request.url.includes('api.deepseek') ||
      e.request.url.includes('wttr.in')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
