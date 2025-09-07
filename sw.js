// Importar los scripts de Firebase
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// --- 1. LÓGICA DE CACHÉ ---
const CACHE_NAME = 'kalctas-admin-cache-v1';

// Lista de archivos para el caché inicial.
// Se ha quitado 'notification.mp3' para evitar el error 206.
const urlsToCache = [
  './',
  'index.html',
  'LOGO.png',
  'icon-192x192.png',
  'icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

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


// --- 2. LÓGICA DE FIREBASE MESSAGING ---

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDuNHPsYnLD_qmbG2K9ieTIOCX6U4slD1E",
  authDomain: "tienda-kalctas.firebaseapp.com",
  projectId: "tienda-kalctas",
  storageBucket: "tienda-kalctas.firebasestorage.app",
  messagingSenderId: "374355691085",
  appId: "1:374355691085:web:18abb15678c7a6870bbe04"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Manejador de notificaciones en segundo plano
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: './icon-192x192.png' // Usamos ruta relativa por si acaso
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
