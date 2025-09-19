const CACHE_NAME = 'price-calculator-v5.1'; // 建議更新快取版本名稱
// 需要被快取的檔案清單
const urlsToCache = [
    '/index.html',
    '/check.html',
    '/dede.css',
    '/app.js',
    '/services.json',
    '/logo_64.png',
    '/logo_128.png',
    '/logo_192.png',
    '/logo_256.png',
    '/logo_512.png'
];

// 1. 安裝 Service Worker
self.addEventListener('install', event => {
    self.skipWaiting(); // 強制新的 Service Worker 立即啟用
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

// 新的 Service Worker fetch 邏輯 (快取優先)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // 如果快取中有找到資源，直接回傳
            if (response) {
                return response;
            }
            // 如果快取中沒有，就從網路下載並存入快取
            return fetch(event.request).then(networkResponse => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            });
        })
    );
});

// 3. 啟用 Service Worker 與管理舊快取
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // 如果快取名稱不在白名單中，就刪除它
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

