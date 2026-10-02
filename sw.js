'use strict';
const VERSION = 'th6-20261002-mobile-update1';
const shell = ['order.html','admin.html','config.js','portal-api.js','customer-portal.js','address-picker.js','admin.js','portal.css','admin.css','pwa.js','pwa-route.js','order.webmanifest','admin.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(shell.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('th6-') && key !== VERSION).map(key => caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const relative = url.pathname.slice(new URL('./', self.location.href).pathname.length);
  if (!shell.includes(relative)) return;
  // 네트워크 우선. API와 개인 데이터는 캐시하지 않는다. 영업자 쿼리는 HTML과 분리해 유지한다.
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(VERSION).then(cache => cache.put(new URL(relative,self.location.href),copy))); }
    return response;
  }).catch(() => caches.match(new URL(relative,self.location.href)).then(response => response || Response.error())));
});
