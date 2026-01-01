// 更新版本號
const CACHE_NAME = 'price-calculator-v26.1-2'; 

const urlsToCache = [
    'index.html',
    'check.html',
    'services_editor.html',
    'dede.css',
    'app.js',
    'services.json',
    'logo_64.png',
    'logo_128.png',
    'logo_192.png',
    'logo_256.png',
    'logo_512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// 1. 安裝階段：強制從網路抓取最新資源存入快取
self.addEventListener('install', event => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('正在更新快取資源...');
            // 使用 map 包裝請求，加入 cache: 'reload' 確保抓到的是伺服器上的新版
            const cachePromises = urlsToCache.map(url => {
                const request = new Request(url, { cache: 'reload' });
                return fetch(request).then(response => {
                    if (response.ok) {
                        return cache.put(url, response);
                    }
                    return Promise.reject(`無法抓取資源: ${url}`);
                }).catch(err => console.error(err));
            });
            return Promise.all(cachePromises);
        })
    );
});

// 2. 啟用階段：刪除舊快取並立即接管頁面
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // 讓新的 Service Worker 立即控制所有頁面
            self.clients.claim(),
            // 清理舊版本快取
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('刪除舊快取:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

// 3. 攔截請求：網路優先 (Network First)
self.addEventListener('fetch', event => {
    // 排除跨域或非 GET 的請求（依需求調整）
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // 成功取得網路資料，更新快取
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(() => {
                // 網路失敗（離線），回傳快取
                return caches.match(event.request);
            })
    );
});
