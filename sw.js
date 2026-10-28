self.addEventListener("install",function(){self.skipWaiting()});
self.addEventListener("activate",function(e){e.waitUntil(self.clients.claim())});
self.addEventListener("fetch",function(e){
 if(e.request.method!=="GET")return;
 e.respondWith(fetch(e.request).then(function(r){
  if(r.ok&&e.request.mode==="navigate"){var c=r.clone();caches.open("lr1").then(function(k){k.put(e.request,c)})}
  return r}).catch(function(){return caches.match(e.request)}))});
