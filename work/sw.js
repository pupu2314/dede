/**
 * Service Worker for 加班費計算機 v2.8.3
 */

const CACHE_NAME = 'overtime-calculator-v2.8.3';
const urlsToCache = [
  './',
  './index.html',
  './work.css',
  './work.js',
  './manifest.json',
  './work_512.png',
  './work_192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
  // Google API scripts are usually loaded dynamically or have short cache headers, so we don't explicitly cache them here to avoid auth issues.
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  // console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// 啟動 Service Worker
self.addEventListener('activate', event => {
  // console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            // console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截網路請求
self.addEventListener('fetch', event => {
  // 對於 Google API 請求，直接使用網路，不使用快取
  if (event.request.url.includes('googleapis.com') || event.request.url.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取中有，則返回快取的版本
        if (response) {
          return response;
        }

        // 否則從網路獲取
        return fetch(event.request).then(response => {
          // 檢查是否是有效的響應
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 複製響應，因為響應只能使用一次
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // 網路請求失敗，如果是導航請求，返回離線頁面
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// 處理消息事件
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        return self.clients.claim();
      })
    );
  }
});

