const CACHE = 'lingualoop-mobile-v18';
const ASSETS = ['./', './index.html', './styles.css?v=11', './learning.js?v=1', './app.js?v=15', './manifest.webmanifest', './icon.svg'];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.location.href).href));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('lingualoop-mobile-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate';
  if (!navigation && !assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (!navigation) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(event.request);
      if (!response.ok) throw new Error('Asset unavailable');
      await cache.put(navigation ? './index.html' : event.request, response.clone());
      return response;
    } catch {
      // An HTML fallback is valid only for navigation, never for code or media.
      return await cache.match(navigation ? './index.html' : event.request) || Response.error();
    }
  })());
});
