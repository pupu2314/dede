const CACHE_NAME = 'motolog-v16.0'; // 每次更新都要改這個版號
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
  // 強制讓新安裝的 Service Worker 進入 active 狀態，不要停在 waiting
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      // 激活後立即接管所有頁面，並發送更新通知
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
