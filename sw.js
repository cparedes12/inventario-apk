// sw.js - Service Worker para funcionalidad PWA y actualizaciones automáticas

const CACHE_NAME = 'vlx-inventario-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
  // Para las llamadas a la API de GitHub, siempre ir a la red
  if (event.request.url.includes('api.github.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Verificar actualizaciones
          if (event.request.url.includes('/releases/latest')) {
            checkForAppUpdate(response.clone());
          }
          return response;
        })
        .catch(() => {
          // Si falla, devolver respuesta en caché si existe
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para otros recursos, intentar cache primero
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            // No cachear respuestas no exitosas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
  );
});

// Verificar actualizaciones de la app
async function checkForAppUpdate(response) {
  try {
    const data = await response.json();
    const latestVersion = data.tag_name;
    const currentVersion = CACHE_NAME.split('-v')[1];

    if (latestVersion && latestVersion !== `v${currentVersion}`) {
      // Notificar al cliente sobre la actualización
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'UPDATE_AVAILABLE',
            version: latestVersion,
            downloadUrl: data.assets[0]?.browser_download_url
          });
        });
      });

      // Mostrar notificación push si está permitido
      if (self.registration.showNotification) {
        self.registration.showNotification('🎉 Nueva versión disponible', {
          body: `VLX Inventario ${latestVersion} está disponible. Toca para actualizar.`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200],
          data: {
            url: data.assets[0]?.browser_download_url
          },
          actions: [
            {
              action: 'update',
              title: 'Actualizar ahora'
            },
            {
              action: 'later',
              title: 'Más tarde'
            }
          ]
        });
      }
    }
  } catch (error) {
    console.error('Error checking for updates:', error);
  }
}

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'update') {
    // Descargar la actualización
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

// Sincronización en segundo plano
self.addEventListener('sync', event => {
  if (event.tag === 'check-update') {
    event.waitUntil(
      fetch('https://api.github.com/repos/cparedes12/inventario-apk/releases/latest')
        .then(response => checkForAppUpdate(response))
    );
  }
});

// Periodicidad de sincronización (cada hora)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-update') {
    event.waitUntil(
      fetch('https://api.github.com/repos/cparedes12/inventario-apk/releases/latest')
        .then(response => checkForAppUpdate(response))
    );
  }
});