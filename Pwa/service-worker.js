const CACHE_NAME = 'price-calculator-v2'; // 建議更新快取版本名稱
// 需要被快取的檔案清單 (
const urlsToCache = [
    '/dede/Pwa/index.html',
    '/dede/Pwa/check.html',
    '/dede/Pwa/cdede.css',
    '/dede/Pwa/capp.js',
    '/dede/Pwa/cservices.json',
    '/dede/Pwa/clogo_192.png',
    '/dede/Pwa/clogo_512.png'
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

// 2. 攔截網路請求 (策略改為：網路優先，失敗才讀快取)
// 這對 services.json 的更新比較友善
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).then(networkResponse => {
            // 如果成功從網路取得，就存入快取並回傳
            return caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
            });
        }).catch(() => {
            // 如果網路請求失敗 (例如離線)，就從快取中尋找
            return caches.match(event.request);
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

