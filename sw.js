// Versioned, public-static-app-shell cache. Private inventory and Firebase APIs are NEVER cached here.
const CACHE='north-heights-app-v4-formfix-20261101';
const SHELL=['./','./index.html','./favicon.svg','./manifest.webmanifest',
  './src/style.css','./src/phase2.css','./src/phase3.css','./src/phase4.css',
  './src/app.js','./src/data-actions.js','./src/phase3.js','./src/phase4.js'];
const targets=new Set(SHELL.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('north-heights-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request, url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||!targets.has(url.pathname))return;
  const isNavigation=req.mode==='navigate';
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(isNavigation){
      try{
        const fresh=await fetch(req);
        if(fresh.ok)cache.put('./index.html',fresh.clone());
        return fresh;
      }catch{
        return await cache.match('./index.html') || await cache.match(new URL('./index.html',self.registration.scope).toString()) || new Response('<!doctype html><title>Offline</title><p>Reconnect and reload North Heights Inventory.</p>',{headers:{'Content-Type':'text/html'},status:503});
      }
    }
    const cached=await cache.match(req);
    if(cached)return cached;
    const response=await fetch(req);
    if(response.ok)await cache.put(req,response.clone());
    return response;
  })());
});
