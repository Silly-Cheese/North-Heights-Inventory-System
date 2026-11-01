// Retired North Heights cache worker. Previously cached JavaScript could keep an old
// form handler running after GitHub Pages updated. IndexedDB count queues are untouched.
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    self.registration.unregister(),
    caches.keys().then(keys=>Promise.all(keys
      .filter(key=>key.startsWith('north-heights-app-'))
      .map(key=>caches.delete(key))))
  ]));
});
// No fetch handler. GitHub Pages resources use ordinary browser networking.
