/**
 * Service Worker for 加班費計算機 v2.8.6
 */

const CACHE_NAME = 'overtime-calculator-v2.8.6';
const urlsToCache = [
  './',
  './index.html',
  './work.css',
  './work.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // 核心修正：只處理 http 或 https 請求，忽略 chrome-extension 等
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          // 只有成功的 GET 請求才存入快取
          if (event.request.method === 'GET') {
            cache.put(event.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    }).catch(() => caches.match('./index.html'))
  );
});
