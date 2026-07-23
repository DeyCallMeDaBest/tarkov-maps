/* Tarkov Maps — service worker: app shell cache + map imagery cache (fan-made personal tool) */
const SHELL='tkm-shell-v1';
const ART='tkm-art-v1';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(SHELL).then(c=>c.addAll(['./','./index.html'])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==SHELL&&k!==ART).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return; /* API POSTs pass through — the app has its own localStorage cache for those */
  /* app shell: network-first so updates land, cache fallback for offline */
  if(u.origin===location.origin){
    e.respondWith(
      fetch(e.request).then(r=>{const cp=r.clone();caches.open(SHELL).then(c=>c.put(e.request,cp));return r;})
      .catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html')))
    );
    return;
  }
  /* map tiles / item icons / leaflet CDN: cache-first — offline maps after first view */
  if(u.hostname==='assets.tarkov.dev'||u.hostname==='cdnjs.cloudflare.com'){
    e.respondWith(
      caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{
        if(r.ok){const cp=r.clone();caches.open(ART).then(c=>c.put(e.request,cp));}
        return r;
      }))
    );
  }
});
