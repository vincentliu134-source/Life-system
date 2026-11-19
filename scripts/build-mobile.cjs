const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist-mobile');
const base = process.env.MOBILE_BASE_PATH || '/';
if (!/^\/(?:[^?#\\]*\/)?$/.test(base) || base.includes('//') || base.split('/').includes('..')) {
  throw new Error('MOBILE_BASE_PATH must be a pathname beginning and ending with /');
}
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.name !== 'sw.js') files.push(path.relative(dist, file).replaceAll(path.sep, '/'));
  }
}
collect(dist);
files.sort();
const hash = crypto.createHash('sha256').update(base);
for (const file of files) hash.update(file).update(fs.readFileSync(path.join(dist, file)));
const version = hash.digest('hex').slice(0, 12);
const cachePrefix = 'life-six-mobile-' + crypto.createHash('sha256').update(base).digest('hex').slice(0, 8) + '-';
const serviceWorker = `const BASE=${JSON.stringify(base)};
const PREFIX=${JSON.stringify(cachePrefix)};
const CACHE=PREFIX+${JSON.stringify(version)};
const ASSETS=${JSON.stringify([base, ...files.map(file => base + file)])};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE)||url.pathname.startsWith('/api/'))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok)event.waitUntil(cache.put(request,response.clone()));
    return response;
  }))));
});
`;
fs.writeFileSync(path.join(dist, 'sw.js'), serviceWorker);
console.log(`Mobile offline build: ${files.length} assets, cache ${version}`);
