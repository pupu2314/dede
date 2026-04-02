/**
 * Service Worker
 * 策略：App Shell (UI) 網路優先 + 超時控制，動態資料 (services.json) 直接放行
 */

// 升級版號，強制所有用戶端清除舊快取並套用新規則
const CACHE_NAME = 'price-calculator-v26.4k3'; 
const OFFLINE_URL = 'index.html';

const urlsToCache = [
    'index.html',
    'check.html',
    'services_editor.html',
    'dede.css',
    'app.js',
    'logo_64.png',
    'logo_128.png',
    'logo_192.png',
    'logo_256.png',
    'logo_512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

/**
 * 輔助函式：向所有頁面發送通知訊息
 */
function sendMessageToClients(msg) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'SW_STATUS',
                message: msg
            });
        });
    });
}

// 1. 安裝：快取靜態資源 (App Shell)
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                urlsToCache.map(url => {
                    return fetch(new Request(url, { cache: 'reload' }))
                        .then(res => cache.put(url, res))
                        .catch(err => console.log('部分快取預載入失敗，但不影響主程式:', url));
                })
            );
        })
    );
});

// 2. 啟動：清除舊版快取
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('清除舊快取:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. 攔截請求
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // ==========================================
    // 【重要修改】遇到 services.json 直接放行，不進 SW 快取
    // 因為 app.js 已經使用了 localStorage 進行本機優先與背景更新
    // ==========================================
    if (event.request.url.includes('services.json')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 只有導航請求（開啟 HTML 頁面）時才顯示「更新中」提示
    if (event.request.mode === 'navigate') {
        sendMessageToClients('正在檢查網頁更新...');
    }

    event.respondWith(
        fetchWithTimeout(event.request, 3000)
            .then(networkResponse => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(error => {
                // 如果無網路或超時，降級使用快取
                if (error.message === '網路請求超時') {
                    sendMessageToClients('連線過久，已切換至快取模式');
                } else if (!navigator.onLine) {
                    sendMessageToClients('目前無網路連線，已使用快取');
                }
                
                return caches.match(event.request).then(cachedResponse => {
                    return cachedResponse || caches.match(OFFLINE_URL);
                });
            })
    );
});

function fetchWithTimeout(request, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('網路請求超時')), timeout);
        fetch(request).then(
            response => {
                clearTimeout(timer);
                resolve(response);
            },
            err => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}
