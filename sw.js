const CACHE='stardust-v2.2.2';
const MEDIA=['audio/stardust-ambient.mp3'];
const BASE=new URL('./',self.location).pathname;
const FILES=['','index.html','style.css','universe.css','app.mjs','model.mjs','space.mjs','audio.mjs','gestures.mjs','manifest.webmanifest','icon-platinum-32.png','icon-platinum-maskable.png','icon-platinum-180.png','icon-platinum-192.png','icon-platinum-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(p=>BASE+p))).then(()=>caches.open(CACHE).then(cache=>cache.addAll(MEDIA.map(p=>BASE+p))).catch(()=>{})).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('stardust-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(BASE))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(BASE+'index.html')));return;}
 if([...FILES,...MEDIA].some(p=>u.pathname===BASE+p)){event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request)));}});