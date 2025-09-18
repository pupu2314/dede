const CACHE_NAME = 'price-calculator-v1';
// 需要被快取的檔案清單
const urlsToCache = [
    '/',
    '/index.html',
    '/dede.css',
    '/app.js',
    '/services.json'
];

// 1. 安裝 Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // 將所有重要的檔案加入快取
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. 攔截網路請求
self.addEventListener('fetch', event => {
    event.respondWith(
        // 策略：快取優先 (Cache First)
        // 先嘗試從快取中尋找回應
        caches.match(event.request)
            .then(response => {
                // 如果快取中有對應的回應，就直接回傳
                if (response) {
                    return response;
                }
                // 如果快取中沒有，就發出網路請求
                return fetch(event.request).then(
                    // 取得網路回應後，也將其存入快取供下次使用
                    networkResponse => {
                        // 檢查回應是否有效
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                );
            })
    );
});

// 3. 啟用 Service Worker 與管理舊快取 (可選，但建議)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        // 刪除舊版本的快取
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
}); 
