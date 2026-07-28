// Service worker mínimo para Entradas — Barreta Producciones
// Cachea el "shell" de la app (HTML + librerías) para que instale bien
// y abra rápido incluso con mala señal. NO cachea nada de Firebase:
// los datos en vivo y la lógica offline de tickets los maneja index.html
// con localStorage (ver downloadEventCache / pendingSync).
//
// Estrategia:
//  - index.html / navegación: NETWORK-FIRST (siempre la versión más nueva
//    si hay señal; la caché es solo el respaldo para cuando no hay internet).
//  - Librerías externas (QR, Firebase SDK, etc.): CACHE-FIRST, porque esas
//    casi nunca cambian y priorizan velocidad de carga.
//
// Importante: cada vez que se suba una versión nueva de index.html hay que
// subir todo el sw.js aunque no haya cambios visibles en este archivo,
// SOLO CAMBIANDO CACHE_NAME (ver abajo) — así el navegador detecta que el
// service worker es "distinto" y fuerza la actualización de inmediato.

const CACHE_NAME = 'entradas-shell-v2';

const SHELL_URLS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falla entero si UNA url falla; las agregamos de a una
      // para que el shell local se guarde igual aunque algún CDN falle.
      return Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nunca interceptar llamadas a Firebase: siempre en vivo.
  if (req.url.includes('firebaseio.com') || req.url.includes('firebasedatabase.app')) {
    return;
  }

  // Solo manejamos GET; el resto (POST/PUT de Firebase SDK) pasa directo.
  if (req.method !== 'GET') return;

  const isHtmlOrNav = req.mode === 'navigate' ||
                       req.url.endsWith('/') ||
                       req.url.endsWith('index.html');

  if (isHtmlOrNav) {
    // NETWORK-FIRST: siempre intenta traer la versión más nueva primero.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)) // sin señal: recién ahí usa la caché
    );
    return;
  }

  // CACHE-FIRST para librerías externas (no cambian entre versiones).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
