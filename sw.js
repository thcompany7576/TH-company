'use strict';
const VERSION = 'th6-20261007-controlheld';
const shell = ['order.html','admin.html','config.js','portal-api.js','customer-portal.js','contract-routes.js','address-picker.js','admin.js','admin-push.js','voice-notifications.js','dispatch-chat.js','portal.css','admin.css','th-theme.css','pwa.js','pwa-route.js','order.webmanifest','admin.webmanifest','icon-192.png','icon-512.png'];
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

function notificationUrl(tag){
  const url=new URL('admin.html',self.registration.scope),parts=String(tag||'').split(':'),id=parts[1];
  if(/^[a-f0-9-]{36}$/.test(id||'')){if(['customer','monitor'].includes(parts[0]))url.searchParams.set('thread',id);else if(['order','approved'].includes(parts[0]))url.searchParams.set('order',id);}
  return url.href;
}
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification('TH company', {
    body: typeof data.body === 'string' ? data.body.slice(0,200) : '새 알림이 도착했습니다. 관리페이지를 확인해 주세요.',
    icon: 'icon-192.png', badge: 'icon-192.png', tag: typeof data.tag === 'string' ? data.tag : 'th-company',
    data: {url: notificationUrl(data.tag)}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL(event.notification.data?.url||'admin.html',self.registration.scope);
  event.waitUntil(clients.openWindow(target.origin===self.location.origin&&target.pathname===new URL('admin.html',self.registration.scope).pathname?target.href:new URL('admin.html',self.registration.scope).href));
});
