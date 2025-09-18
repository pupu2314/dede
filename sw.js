const CACHE_NAME = 'overtime-calculator-v2'; // 更新版本號以觸發更新

// FIX: 使用絕對路徑來快取檔案
const urlsToCache = [
  '/dede/work.html',
  '/dede/manifest.json', // 也將 manifest 加入快取
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching files');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // 強制新的 Service Worker 立即啟用
});

self.addEventListener('activate', event => {
  // 刪除舊的快取
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName.startsWith('overtime-calculator-') && cacheName !== CACHE_NAME;
        }).map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache-first strategy
        return response || fetch(event.request);
      }
    )
  );
});
