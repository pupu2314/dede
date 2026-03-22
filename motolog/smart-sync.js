// smart-sync.js
// 功能：智慧同步、離線排隊、PWA 更新偵測 (穩定版)

const SYNC_KEYS = ['chargeLog', 'maintenanceLog', 'expenseLog', 'statusLog'];
let syncTimeout = null;
let isSyncing = false; // 鎖定狀態，避免重複同步
let retryCount = 0;
const MAX_RETRIES = 2;

// ==========================================
// 1. 攔截 localStorage 自動觸發同步
// ==========================================
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    // 檢查是否為需要同步的資料 Key
    if (SYNC_KEYS.includes(key)) {
        originalSetItem.call(this, 'hasUnsyncedChanges', 'true');
        updateSyncStatusUI('🟡 待同步');
        // 增加延遲時間到 8 秒，給予使用者完成輸入的空間
        scheduleAutoSync(8000); 
    }
};

// ==========================================
// 2. 自動同步核心邏輯
// ==========================================
function scheduleAutoSync(delay = 5000) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        executeAutoSync();
    }, delay);
}

async function executeAutoSync(isManual = false) {
    // 1. 基本檢查
    if (!navigator.onLine) {
        updateSyncStatusUI('🔴 離線 (待恢復)');
        if (isManual) alert('目前無網路連線，資料已儲存。');
        return;
    }

    if (isSyncing) return; // 如果正在同步中，直接跳過

    // 2. 確定是否有資料需要同步
    const hasChanges = localStorage.getItem('hasUnsyncedChanges') === 'true';
    if (!isManual && !hasChanges) {
        updateSyncStatusUI('🟢 已同步');
        return;
    }

    // 3. 取得設定
    let settings = { gasUrl: '' };
    try {
        settings = JSON.parse(localStorage.getItem('motorcycleSettings') || '{}');
    } catch(e) {}

    if (!settings.gasUrl) {
        if (isManual) alert('請先設定 Google Sheets 網址');
        return;
    }

    // 4. 開始同步流程
    isSyncing = true;
    updateSyncStatusUI(isManual ? '🔄 強制同步中...' : '🔄 自動同步中...');

    const payload = {
        action: 'backup',
        ChargeLog: JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        MaintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        ExpenseLog: JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        StatusLog: JSON.parse(localStorage.getItem('statusLog') || '[]')
    };

    try {
        // 自動同步不使用 AbortController 強制切斷，改用原生 fetch
        const res = await fetch(settings.gasUrl, {
            method: 'POST',
            mode: 'cors',
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (data.status === 'success') {
            localStorage.removeItem('hasUnsyncedChanges');
            const now = new Date().toISOString().slice(0,10);
            originalSetItem.call(localStorage, 'lastBackupDate', now);
            updateSyncStatusUI('🟢 已同步');
            retryCount = 0;
            if (isManual) alert('✅ 備份成功！');
        } else {
            throw new Error(data.message || 'Server Error');
        }
    } catch (err) {
        console.warn('Sync failed:', err);
        
        if (isManual) {
            updateSyncStatusUI('🔴 同步失敗');
            alert('❌ 同步失敗，請確認 GAS 網址是否正確或網路是否穩定。');
        } else {
            // 自動同步失敗時的處理
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                updateSyncStatusUI(`🟡 等待重試 (${retryCount})`);
                scheduleAutoSync(30000); // 30秒後重試，避開 GAS 繁忙期
            } else {
                updateSyncStatusUI('🔴 同步暫緩 (下次操作再試)');
                retryCount = 0;
            }
        }
    } finally {
        isSyncing = false;
    }
}

// ==========================================
// 3. 狀態監聽與 UI
// ==========================================
window.addEventListener('online', () => {
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        scheduleAutoSync(3000);
    } else {
        updateSyncStatusUI('🟢 已同步');
    }
});

window.addEventListener('offline', () => updateSyncStatusUI('🔴 離線'));

function initSyncUI() {
    if (document.getElementById('smart-sync-status')) return;
    const bar = document.createElement('div');
    bar.id = 'smart-sync-status';
    bar.style.cssText = `
        position: fixed; top: env(safe-area-inset-top, 15px); right: 15px; 
        background: rgba(15, 23, 42, 0.9); color: white; padding: 5px 12px; 
        border-radius: 20px; font-size: 11px; z-index: 10001; 
        backdrop-filter: blur(5px); box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        pointer-events: none; transition: opacity 0.5s;
    `;
    document.body.appendChild(bar);
    
    // 初始化判斷
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        updateSyncStatusUI('🟡 待同步');
        scheduleAutoSync(5000);
    } else {
        updateSyncStatusUI('🟢 已同步');
    }
}

function updateSyncStatusUI(text) {
    const bar = document.getElementById('smart-sync-status');
    if (!bar) return;
    bar.style.display = 'block';
    bar.style.opacity = '1';
    bar.innerText = text;
    // 已同步狀態下，3秒後變透明
    if (text.includes('🟢')) {
        setTimeout(() => { if(bar.innerText.includes('🟢')) bar.style.opacity = '0.3'; }, 3000);
    }
}

// ==========================================
// 4. PWA 更新偵測
// ==========================================
function initPWAUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.update();
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner();
                    }
                });
            });
        });
    }
}

function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;
    const div = document.createElement('div');
    div.id = 'pwa-update-banner';
    div.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: #2563eb; color: white; padding: 12px 20px; border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.3); z-index: 10000; display: flex;
        align-items: center; gap: 15px; width: 90%; max-width: 400px; justify-content: space-between;
    `;
    div.innerHTML = `<span>🚀 發現新版本！</span><button onclick="window.location.reload()" style="background: white; color: #2563eb; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">更新</button>`;
    document.body.appendChild(div);
}

window.addEventListener('DOMContentLoaded', () => {
    initSyncUI();
    initPWAUpdate();
});
