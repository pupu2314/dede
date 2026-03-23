/**
 * 穩定版 Service Worker (含訊息回饋與快取清理)
 * 策略：網路優先 (Network First) + 超時控制 (Timeout)
 */

// 每次更新 HTML/CSS/JS/JSON 後，請更改這個版本號來強制更新快取
const CACHE_NAME = 'price-calculator-v27.0';
const OFFLINE_URL = 'index.html';

// 預先快取的資源清單
const urlsToCache = [
    './',
    'index.html',
    'check.html',
    'services_editor.html',
    'dede.css',
    'app.js',
    'services.json',
    'manifest.json',
    'logo_64.png',
    'logo_128.png',
    'logo_192.png',
    'logo_256.png',
    'logo_512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

/**
 * 輔助函式：向所有已開啟的頁面發送通知訊息
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

// 1. 安裝階段 (Install)
self.addEventListener('install', event => {
    // 強制立即接管控制權，不需要等待舊的 SW 關閉
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] 正在預先快取資源');
            return Promise.all(
                urlsToCache.map(url => {
                    // 使用 cache: 'reload' 確保抓到最新的檔案，而不是從 HTTP 快取拿
                    return fetch(new Request(url, { cache: 'reload' }))
                        .then(res => {
                            if (res.ok) {
                                return cache.put(url, res);
                            }
                            console.warn('[Service Worker] 無法快取資源:', url);
                        })
                        .catch(err => {
                            console.error('[Service Worker] 快取資源發生錯誤:', url, err);
                        });
                })
            );
        })
    );
});

// 2. 啟動階段 (Activate) - 清理舊版本快取
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // 如果快取名稱不等於目前的版本，則刪除該舊快取
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] 刪除舊快取:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // 立即控制所有客戶端頁面
            return self.clients.claim();
        })
    );
});

// 3. 攔截請求階段 (Fetch)
self.addEventListener('fetch', event => {
    // 只處理 GET 請求
    if (event.request.method !== 'GET') return;

    // 只有導航請求（開啟頁面）時才顯示「更新中」提示，避免背景 API 請求一直彈出通知
    if (event.request.mode === 'navigate') {
        sendMessageToClients('正在檢查最新內容...');
    }

    event.respondWith(
        fetchWithTimeout(event.request, 3000)
            .then(networkResponse => {
                // 如果網路請求成功，將新資料存入快取並回傳
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(error => {
                // 判斷錯誤類型並發送對應的 UI 訊息
                if (error.message === '網路請求超時') {
                    sendMessageToClients('連線過久，已切換至離線快取模式');
                } else if (!navigator.onLine) {
                    sendMessageToClients('目前無網路連線，已使用離線快取');
                } else {
                    console.warn('[Service Worker] 網路請求失敗，嘗試使用快取:', error);
                }
                
                // 網路失敗時，嘗試從快取中尋找資源
                return caches.match(event.request).then(cachedResponse => {
                    // 如果快取有資料就回傳快取，否則嘗試回傳首頁（避免斷網時出現恐龍畫面）
                    return cachedResponse || caches.match(OFFLINE_URL);
                });
            })
    );
});

/**
 * 輔助函式：帶有超時機制的 fetch
 * @param {Request} request 請求物件
 * @param {number} timeout 超時時間（毫秒）
 */
function fetchWithTimeout(request, timeout = 3000) {
    return new Promise((resolve, reject) => {
        // 設定超時定時器
        const timer = setTimeout(() => reject(new Error('網路請求超時')), timeout);
        
        // 執行網路請求
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
