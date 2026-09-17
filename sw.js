const CACHE_NAME = 'correcaminos-v5.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './validar.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/auth.js',
  './js/data.js',
  './js/firebase-config.js',
  './js/qrcode.min.js',
  './img/Nuevo%20Logo%20Correcaminos.jpeg',
  './img/icons/favicon.ico',
  './img/icons/icon-192.png',
  './img/icons/icon-512.png',
  './img/icons/icon-maskable.png',
  
  // CDNs y Dependencias Externas (Crucial para funcionamiento offline)
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];

// Evento de Instalación: Se descargan y cachean los recursos estáticos de forma resiliente
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Guardando archivos en caché v5...');
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => 
          cache.add(url).catch((err) => console.warn('[Service Worker] Aviso al cachear:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Evento de Activación: Limpieza agresiva de cualquier versión anterior
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Evento Fetch:
// 1. Network-First para HTML y scripts .js: Garantiza que cualquier dispositivo móvil siempre ejecute el código más reciente de GitHub al estar conectado.
// 2. Cache-First para imágenes, fuentes y estilos: Máxima velocidad y soporte offline completo.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  const url = new URL(e.request.url);
  const isCodeOrDoc = e.request.mode === 'navigate' || 
                      url.pathname.endsWith('.html') || 
                      url.pathname.endsWith('.js') ||
                      url.pathname === '/' ||
                      url.pathname.endsWith('/Correcaminos-Pagos/') ||
                      url.pathname.endsWith('/Correcaminos-Pagos');

  if (isCodeOrDoc) {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => { /* Offline fallback */ });
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
