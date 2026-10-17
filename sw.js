// Loopline service worker: works offline after the first visit.
const CACHE = 'loopline-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: try the network first so updates show up, fall back to the cache offline.
  // The server is a computer on the home network, so when the device is elsewhere the request
  // can hang rather than fail; after a few seconds open the cached copy and keep updating behind it.
  if (req.mode === 'navigate'){
    const net = fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(
      Promise.race([net, new Promise(r => setTimeout(r, 3000))])
        .then(res => res || caches.match('./index.html').then(hit => hit || net))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Google Fonts: serve from cache, refresh in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Everything else from this site: cache first.
  if (url.origin === self.location.origin){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
