// Service Worker for PWA
const CACHE_NAME = 'gongbu-seongj ong-v1';
const urlsToCache = [
  '/',
  '/dashboard.html',
  '/study.html',
  '/rivals.html',
  '/learning-materials.html',
  '/quiz-shared.html',
  '/quiz-maker.html',
  '/schools_data.js',
  '/universities_data.js'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
