// Nombre y versión del caché
const CACHE_NAME = 'kalctas-admin-cache-v1';

// Archivos esenciales para que la app funcione (el "App Shell")
const urlsToCache = [
  '/',
  '/index.html',
  '/LOGO.png',
  '/notification.mp3',
  '/icon-192x192.png',
  '/icon-512x512.png'
  // Si tuvieras archivos .css o .js externos, los agregarías aquí
];

// Evento 'install': Se dispara cuando el Service Worker se instala.
// Aquí es donde guardamos los archivos del App Shell en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caché abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': Se dispara cada vez que la app solicita un recurso (una imagen, un script, etc.).
// Interceptamos la petición y decidimos si la servimos desde el caché o desde la red.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si encontramos el recurso en el caché, lo devolvemos.
        if (response) {
          return response;
        }
        // Si no, lo pedimos a la red.
        return fetch(event.request);
      })
  );
});

// Evento 'activate': Se dispara cuando el nuevo Service Worker se activa.
// Aquí limpiamos los cachés antiguos que ya no se usan.
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
