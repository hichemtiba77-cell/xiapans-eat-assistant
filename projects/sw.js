const CACHE_NAME = 'fanfan-shell-v5';
const SHELL_FILES = [
  '/',
  '/home',
  '/stats',
  '/diary',
  '/chat',
  '/login',
  '/styles/tailwind.css',
  '/js/app.js?v=13',
  '/js/vendor/jquery-3.7.1.min.js',
  '/js/vendor/lucide-1.11.0.min.js',
  '/js/vendor/supabase.js',
  '/image/avatar.jpg',
  '/image/pet-1.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(SHELL_FILES.map(function (url) {
        return fetch(url).then(function (response) {
          if (response.ok) return cache.put(url, response);
        }).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      const network = fetch(request).then(function (response) {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, response.clone()); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
