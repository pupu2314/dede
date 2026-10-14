// 本機優先（cache-first）；更新由頁面觸發 CHECK_UPDATE，在背景比對後通知使用者
const CACHE = 'levelcrossing-v2';
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
const DATA = new URL('levelcrossing.json', SCOPE).href;
const CORE = [INDEX, DATA, new URL('manifest.json', SCOPE).href, new URL('icon-192.png', SCOPE).href, new URL('icon-512.png', SCOPE).href];
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all([
      ...CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})),
      ...CDN.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {}))
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 同源：頁面一律對應 INDEX，其餘以「網址去掉查詢字串」為 key
function keyFor(req, url) {
  return req.mode === 'navigate' ? INDEX : url.origin + url.pathname;
}

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(key, res.clone());
  return res;
}

// 背景比對 index.html 與資料檔；有差異才一次寫入快取並通知頁面
async function checkUpdate() {
  try {
    const cache = await caches.open(CACHE);
    const fresh = [];
    let changed = false;
    for (const u of [INDEX, DATA]) {
      const res = await fetch(new Request(u, { cache: 'no-cache' }));
      if (!res.ok) return;
      const old = await cache.match(u);
      const [a, b] = [await res.clone().text(), old ? await old.text() : null];
      if (a !== b) changed = true;
      fresh.push([u, res]);
    }
    if (!changed) return;
    await Promise.all(fresh.map(([u, r]) => cache.put(u, r)));
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'UPDATE_READY' }));
  } catch (_) { /* 離線或失敗：略過 */ }
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'CHECK_UPDATE') e.waitUntil(checkUpdate());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(cacheFirst(req, keyFor(req, url)));
  else if (url.hostname === 'unpkg.com') e.respondWith(cacheFirst(req, req.url));
});
