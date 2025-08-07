const CACHE_NAME = 'sant-padharamani-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/auth/login-page'
  // Note: External CDNs are not pre-cached due to CSP restrictions
  // They will be cached dynamically when successfully fetched
];

// External CDN URLs that we want to cache when possible
const externalCDNs = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

// Install event - cache local resources only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Only cache local resources to avoid CSP violations during install
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('Cache install failed:', error);
        // Don't fail installation if caching fails
      })
  );
  
  // Force activation of new service worker
  self.skipWaiting();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests that might violate CSP during install
  if (!event.request.url.startsWith(self.location.origin) && 
      !externalCDNs.some(cdn => event.request.url.startsWith(cdn))) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          console.log('Serving from cache:', event.request.url);
          return response;
        }
        
        // Important: Clone the request because it's a stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200) {
            console.log('Invalid response for:', event.request.url, response.status);
            return response;
          }
          
          // Only cache successful responses from allowed origins
          if (response.type === 'basic' || response.type === 'cors') {
            // Important: Clone the response because it's a stream
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('Caching:', event.request.url);
                cache.put(event.request, responseToCache);
              })
              .catch((error) => {
                console.log('Failed to cache:', event.request.url, error);
              });
          }

          return response;
        }).catch((error) => {
          console.log('Fetch failed for:', event.request.url, error);
          
          // Return a basic offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/').then((cachedResponse) => {
              return cachedResponse || new Response('App is offline', {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
              });
            });
          }
          
          // For other requests, don't return a 503 that might break the app
          throw error;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ])
  );
  
  console.log('Service worker activated and ready!');
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    // Handle offline actions here when back online
  }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New padharamani update',
    icon: '/manifest-icon-192.png',
    badge: '/manifest-icon-96.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/images/checkmark.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/images/xmark.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Sant Padharamani', options)
  );
});