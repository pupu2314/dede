/**
 * 穩定版 Service Worker (本機快取優先 + 背景比對更新)
 * 策略：Stale-while-revalidate
 */

const CACHE_NAME = 'price-calculator-v27.0'; // 每次重大更新可修改此版本號
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
    '[https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js](https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js)'
];

function sendMessageToClients(msg, type = 'SW_STATUS') {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: type, message: msg });
        });
    });
}

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // 背景發起網路請求以獲取最新版本
            const fetchPromise = fetch(event.request).then(networkResponse => {
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            }).catch(() => {
                console.log('處於離線狀態，已使用快取');
            });

            // 針對服務資料 (services.json) 進行新舊比對
            if (cachedResponse && event.request.url.endsWith('services.json')) {
                fetchPromise.then(async (networkResponse) => {
                    if(networkResponse) {
                        const networkText = await networkResponse.clone().text();
                        const cacheText = await cachedResponse.clone().text();
                        if (networkText !== cacheText) {
                            // 資料不同，通知前端顯示更新按鈕
                            sendMessageToClients('發現新的優惠與服務資料！', 'UPDATE_AVAILABLE');
                        }
                    }
                });
            } else if (cachedResponse && event.request.mode === 'navigate') {
                // 針對網頁本體進行比對
                fetchPromise.then(async (networkResponse) => {
                     if(networkResponse) {
                        const networkText = await networkResponse.clone().text();
                        const cacheText = await cachedResponse.clone().text();
                        if (networkText !== cacheText) {
                            sendMessageToClients('系統介面有新版本！', 'UPDATE_AVAILABLE');
                        }
                     }
                });
            }

            // 優先回傳快取 (極速載入)，若無快取則等待網路請求
            return cachedResponse || fetchPromise || caches.match(OFFLINE_URL);
        })
    );
});
