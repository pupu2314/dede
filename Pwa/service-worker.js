/**
 * 穩定版 Service Worker (含訊息回饋)
 * 策略：網路優先 (Network First) + 超時控制
 */

const CACHE_NAME = 'price-calculator-v26.2';
const OFFLINE_URL = 'index.html';

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

// 1. 安裝
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                urlsToCache.map(url => {
                    return fetch(new Request(url, { cache: 'reload' }))
                        .then(res => cache.put(url, res))
                        .catch(err => console.warn(`預載入失敗: ${url}`, err));
                })
            );
        })
    );
});

// 2. 啟用
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(keys => Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            ))
        ])
    );
});

// 3. 攔截請求
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // 只有導航請求（開啟頁面）時才顯示「更新中」提示，避免 API 請求干擾
    if (event.request.mode === 'navigate') {
        sendMessageToClients('正在嘗試自網路更新內容...');
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
                // 判斷錯誤類型發送訊息
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
