/**
 * 穩定版 Service Worker
 * 策略：網路優先 (Network First) 但加入超時處理
 * 確保在離線或網路極差時能快速切換回快取
 */

const CACHE_NAME = 'price-calculator-v26.1.3';
const OFFLINE_URL = 'index.html'; // 離線時的基本頁面

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

// 1. 安裝：快取必要資源
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('正在預載入離線資源...');
            // 使用 reload 確保抓到最新檔案存入快取
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

// 2. 啟用：清理舊快取並接管
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

// 3. 攔截請求：處理網路不穩定
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        // 嘗試從網路抓取，並設定超時 (例如 3 秒)
        fetchWithTimeout(event.request, 3000)
            .then(networkResponse => {
                // 如果網路成功，更新快取並回傳
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(() => {
                // 如果網路超時或完全斷線，則讀取快取
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // 如果快取也沒有 (通常不應該發生)，回傳離線首頁
                    return caches.match(OFFLINE_URL);
                });
            })
    );
});

/**
 * 輔助函式：幫 fetch 加上時間限制
 * 防止在網路極慢 (2G/不穩定) 時頁面卡死
 */
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
