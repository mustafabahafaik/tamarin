// Tamarin service worker — network-first.
// Çevrimiçiyken her zaman ağdan taze dosya alınır (ve önbelleğe kopyalanır);
// ağ yoksa önbellekteki kopya verilir. Yeni bir uygulama dosyası eklenince
// SHELL listesine ekle ve CACHE sürümünü artır.

const CACHE = 'tamarin-v11';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/dates.js',
  './js/ics.js',
  './js/weather.js',
  './js/face.js',
  './js/status.js',
  './js/sound.js',
  './js/settings.js',
  './js/weather-fx.js',
  './js/vault.js',
  './js/form.js',
  './js/phone-art.js',
  './js/modules/bills.js',
  './js/modules/school.js',
  './js/modules/days.js',
  './js/modules/tasks.js',
  './js/modules/vault.js',
  './js/modules/phones.js',
  './manifest.webmanifest',
  './assets/tamarin.webp',
  './assets/tamarin-blink.webp',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Başka sitelere giden istekler (ör. Open-Meteo) service worker'a uğramadan ağa gider.
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  try {
    // no-cache: tarayıcının HTTP önbelleğini atla, sunucuya "değişti mi?" diye sor.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}
