// Nhận thông báo đẩy của Hệ thống BCĐT-TQ (chuyên viên THBC)
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { t: 'BCĐT-TQ', b: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.t || 'BCĐT-TQ', { icon: '/cv1953/icon-192.png', badge: '/cv1953/icon-192.png', body: d.b || '', tag: d.tag || 'bcdt', renotify: true, data: { u: d.u || '/cv1953/' } }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close(); var u = (e.notification.data && e.notification.data.u) || '/cv1953/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) { if (l[i].url.indexOf(self.location.origin) === 0 && 'focus' in l[i]) return l[i].focus(); }
    return self.clients.openWindow(u);
  }));
});
