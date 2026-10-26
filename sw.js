// يجعل البرنامج قابلاً للتثبيت، ويفتح الصفحة من الذاكرة إذا انقطع الإنترنت (الشبكة أولاً دائماً)
var C = 'points-v2';
self.addEventListener('install', function (e) { self.skipWaiting(); e.waitUntil(caches.open(C).then(function (c) { return c.addAll(['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png']); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // طلبات Apps Script لا تُخزَّن أبداً
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (r) { var cp = r.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); return r; })
    .catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('index.html'); }); }));
});
