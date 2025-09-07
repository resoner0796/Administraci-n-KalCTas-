// Nombre y versión del caché
const CACHE_NAME = 'kalctas-admin-cache-v1';

// Archivos esenciales para que la app funcione (el "App Shell")
// Usamos rutas relativas para que funcione en subdirectorios de GitHub Pages.
const urlsToCache = [
  './',
  'index.html',
  'LOGO.png',
  'notification.mp3',
  'icon-192x192.png',
  'icon-512x512.png'
];

// Evento 'install': Se dispara cuando el Service Worker se instala.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caché abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': Intercepta las peticiones de red.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si el recurso está en caché, lo devuelve. Si no, lo busca en la red.
        return response || fetch(event.request);
      })
  );
});

// Evento 'activate': Limpia cachés antiguos.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
