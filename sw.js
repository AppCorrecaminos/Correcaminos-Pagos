const CACHE_NAME = 'correcaminos-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/auth.js',
  './js/data.js',
  './js/firebase-config.js',
  './img/Nuevo Logo Correcaminos.jpeg',
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

// Evento de Instalación: Se descargan y cachean todos los recursos estáticos
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Guardando archivos en caché estática...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Evento de Activación: Limpieza de cachés antiguas al actualizar la versión
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Borrando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Evento Fetch: Estrategia Stale-While-Revalidate para recursos locales y CDN
self.addEventListener('fetch', (e) => {
  // Ignorar solicitudes no GET, llamadas a Firestore API, u otras APIs externas que no sean de assets
  if (e.request.method !== 'GET' || e.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar recurso cacheado e intentar actualizar en segundo plano
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => { /* Silenciar fallos de red offline */ });
        
        return cachedResponse;
      }
      
      // Si no está en caché, ir a la red
      return fetch(e.request).catch(() => {
        // Fallback a index.html para peticiones de navegación
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
