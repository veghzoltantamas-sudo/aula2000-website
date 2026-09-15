/* ============================================================
   Aula 2000 — Service Worker
   Cache: aula2000-v0 + hash-alapú verzió
   Stratégia: navigáció → network-first, statikus → cache-first
   ============================================================ */

var CACHE_PREFIX = 'aula2000-v20260915-PDF-FIX-';
var FALLBACK_ICON = '/icons/icon-192.png';
var OFFLINE_PAGE = '/offline.html';

/* ---------------------------------------------------------
   Install — pre-cache offline oldal
   --------------------------------------------------------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_PREFIX + 'pages').then(function (cache) {
      return cache.addAll([OFFLINE_PAGE]);
    }).catch(function(){})
  );
  self.skipWaiting();
});

/* ---------------------------------------------------------
   Activate — régi cache-ek törlése
   --------------------------------------------------------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) {
          return name.indexOf(CACHE_PREFIX) === 0;
        }).map(function (name) {
          return caches.delete(name);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------------------------------------------------------
   Fetch
   --------------------------------------------------------- */
self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);

  /* Csak azonos origin */
  if (url.origin !== location.origin) return;

  /* API és FÁJL hívásokat nem kezeljük cache-sel, hogy a PDF-ek hiba nélkül nyíljanak */
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/fajl/') !== -1) return;

  /* Navigáció → network-first */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_PREFIX + 'pages').then(function (cache) {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            if (cached) return cached;
            // Offline fallback — ha nincs hálózat és nincs cache, az offline oldalt adjuk vissza
            return caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  /* Képek → cache-first + fallback */
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_PREFIX + 'images').then(function (cache) {
            cache.put(request, clone);
          });
          return response;
        }).catch(function () {
          return caches.match(FALLBACK_ICON);
        });
      })
    );
    return;
  }

  /* Statiszikus erőforrások (CSS, JS, font, stb.) → cache-first */
  if (request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'font' ||
      url.pathname.match(/\.(css|js|woff2?|ttf|otf|eot)$/)) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_PREFIX + 'static').then(function (cache) {
            cache.put(request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  /* Egyéb — network-first */
  event.respondWith(
    fetch(request).then(function (response) {
      if (request.method === 'GET' && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_PREFIX + 'misc').then(function (cache) {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(function () {
      return caches.match(request);
    })
  );
});
