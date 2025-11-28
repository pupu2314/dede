const CACHE_NAME = 'motolog-v15.5.0'; // 版本號更新
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './motolog.css',
  './motolog.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 安裝 Service Worker 並快取靜態資源
self.addEventListener('install', (event) => {
  // 1. 強制新的 Service Worker 立刻進入 "activating" 狀態，不需等待舊的關閉
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 啟用 Service Worker 並清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      // 2. 強制 Service Worker 立刻接管目前頁面，不用等到下次重新整理
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// 攔截網路請求：有快取就用快取，沒快取才上網
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
