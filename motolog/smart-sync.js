// smart-sync.js
// 功能：攔截 localStorage 變更自動同步、離線排隊、PWA 更新偵測、優化超時與重試

const SYNC_KEYS = ['chargeLog', 'maintenanceLog', 'expenseLog', 'statusLog'];
let syncTimeout = null;
let retryCount = 0;
const MAX_RETRIES = 3;

// ==========================================
// 1. 攔截 localStorage 自動觸發同步
// ==========================================
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    if (SYNC_KEYS.includes(key)) {
        originalSetItem.call(this, 'hasUnsyncedChanges', 'true');
        updateSyncStatusUI('🟡 待同步');
        retryCount = 0; 
        scheduleAutoSync(5000); // 5秒後自動啟動
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
    if (!navigator.onLine) {
        updateSyncStatusUI('🔴 離線 (恢復連線後同步)');
        if (isManual) alert('目前無網路連線，資料已儲存。');
        return;
    }

    if (!isManual && localStorage.getItem('hasUnsyncedChanges') !== 'true') {
        updateSyncStatusUI('🟢 已同步');
        return;
    }

    let settings = { gasUrl: '' };
    try {
        settings = JSON.parse(localStorage.getItem('motorcycleSettings') || '{}');
    } catch(e) {}

    if (!settings.gasUrl) return;

    updateSyncStatusUI(isManual ? '🔄 強制同步中...' : '🔄 背景同步中...');

    // 優化：針對 GAS 冷啟動，將超時設為 30 秒
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const payload = {
        action: 'backup',
        ChargeLog: JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        MaintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        ExpenseLog: JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        StatusLog: JSON.parse(localStorage.getItem('statusLog') || '[]')
    };

    try {
        const res = await fetch(settings.gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();
        
        if (data.status === 'success') {
            localStorage.removeItem('hasUnsyncedChanges');
            const now = new Date().toISOString().slice(0,10);
            originalSetItem.call(localStorage, 'lastBackupDate', now);
            updateSyncStatusUI('🟢 已同步');
            retryCount = 0;
            if (isManual) alert('✅ 備份成功！');
        } else {
            throw new Error(data.message || '伺服器錯誤');
        }
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('Sync attempt failed:', err.name === 'AbortError' ? 'Timeout' : err.message);
        
        if (isManual) {
            updateSyncStatusUI('🔴 同步失敗');
            alert('❌ 同步失敗：' + (err.name === 'AbortError' ? '連線超時 (GAS 啟動過慢)' : err.message));
        } else {
            // 自動重試邏輯：採用指數退避 (10s -> 30s -> 60s)
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                const nextDelay = retryCount * 20000; 
                updateSyncStatusUI(`🟡 同步重試中 (${retryCount}/${MAX_RETRIES})`);
                scheduleAutoSync(nextDelay);
            } else {
                updateSyncStatusUI('🔴 連線超時 (待下次操作)');
            }
        }
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

window.addEventListener('offline', () => {
    updateSyncStatusUI('🔴 離線');
});

function initSyncUI() {
    if (document.getElementById('smart-sync-status')) return;
    const syncBar = document.createElement('div');
    syncBar.id = 'smart-sync-status';
    syncBar.style.cssText = `
        position: fixed; top: 15px; right: 15px; background: rgba(30, 41, 59, 0.9);
        color: white; padding: 6px 14px; border-radius: 20px; font-size: 11px;
        z-index: 9999; backdrop-filter: blur(8px); transition: all 0.3s ease;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2); pointer-events: none;
    `;
    document.body.appendChild(syncBar);
    
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        updateSyncStatusUI('🟡 待同步');
        scheduleAutoSync(3000);
    } else {
        updateSyncStatusUI('🟢 已同步');
    }
}

function updateSyncStatusUI(text) {
    const bar = document.getElementById('smart-sync-status');
    if (!bar) return;
    bar.style.display = 'block';
    bar.innerText = text;
    bar.style.opacity = text.includes('🟢') ? '0.4' : '1';
}

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
        box-shadow: 0 8px 20px rgba(0,0,0,0.3); z-index: 9999; display: flex;
        align-items: center; gap: 15px; width: 90%; max-width: 400px; justify-content: space-between;
    `;
    div.innerHTML = `<span>🚀 發現新版本！</span><button id="pwa-reload-btn" style="background: white; color: #2563eb; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">更新</button>`;
    document.body.appendChild(div);
    document.getElementById('pwa-reload-btn').onclick = () => window.location.reload();
}

window.addEventListener('DOMContentLoaded', () => {
    initSyncUI();
    initPWAUpdate();
});
