'use strict';
// Solo la pagina «Server non raggiungibile» è in cache; /api/* e copertine mai (dati dietro login).
// Se cambia la lista dei file, cambia il nome della cache.
const CACHE = 'libreria-v2';
const FILES = ['/offline.html', '/style.css', '/emblem.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
});
