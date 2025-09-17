const CACHE_NAME = 'overtime-calculator-v1';
// 我們需要快取的檔案列表
const urlsToCache = [
  './work.html',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// 安裝 Service Worker 並快取應用程式外殼 (App Shell)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 攔截網路請求，並從快取或網路提供回應
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取中有符合的回應，就直接回傳
        if (response) {
          return response;
        }
        // 如果快取中沒有，則從網路擷取
        return fetch(event.request);
      }
    )
  );
});
