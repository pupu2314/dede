// smart-sync.js
// 功能：攔截 localStorage 變更自動同步、離線排隊、PWA 更新偵測

const SYNC_KEYS = ['chargeLog', 'maintenanceLog', 'expenseLog', 'statusLog'];
let syncTimeout = null;

// ==========================================
// 1. 攔截 localStorage 自動觸發同步
// ==========================================
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    // 執行原本的儲存動作
    originalSetItem.apply(this, arguments);
    
    // 如果變更的是重要的紀錄資料
    if (SYNC_KEYS.includes(key)) {
        originalSetItem.call(this, 'hasUnsyncedChanges', 'true');
        updateSyncStatusUI('🟡 待同步');
        scheduleAutoSync();
    }
};

// ==========================================
// 2. 自動同步核心邏輯 (防抖動 Debounce)
// ==========================================
function scheduleAutoSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    // 延遲 5 秒後執行，避免使用者連續輸入時頻繁觸發 API
    syncTimeout = setTimeout(() => {
        executeAutoSync();
    }, 5000);
}

// isManual: 如果是點擊「同步到 Google Sheets」按鈕，傳入 true 強制執行
async function executeAutoSync(isManual = false) {
    // 檢查網路
    if (!navigator.onLine) {
        updateSyncStatusUI('🔴 離線 (恢復連線後同步)');
        if (isManual) alert('目前無網路連線，資料已安全儲存於手機，將於恢復連線後自動同步。');
        return;
    }

    // 檢查是否有未同步變更
    if (!isManual && localStorage.getItem('hasUnsyncedChanges') !== 'true') {
        updateSyncStatusUI('🟢 已同步');
        if (isManual) alert('目前資料已是最新，無需同步。');
        return;
    }

    // 取得 Google Sheets API 網址
    let settings = { gasUrl: '' };
    try {
        settings = JSON.parse(localStorage.getItem('motorcycleSettings') || '{}');
    } catch(e) {}

    if (!settings.gasUrl) {
        if (isManual) alert('請先在設定中輸入 Google Sheets 部署網址！');
        return;
    }

    updateSyncStatusUI('🔄 同步中...');

    // 準備上傳的資料
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
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            localStorage.removeItem('hasUnsyncedChanges');
            const now = new Date().toISOString().slice(0,10);
            originalSetItem.call(localStorage, 'lastBackupDate', now);
            updateSyncStatusUI('🟢 已同步');
            if (isManual) alert('✅ 備份成功！');
        } else {
            updateSyncStatusUI('🔴 同步失敗');
            if (isManual) alert('❌ 備份失敗: ' + (data.message || '未知錯誤'));
        }
    } catch (err) {
        console.error('Auto sync failed:', err);
        updateSyncStatusUI('🔴 連線超時 (稍後重試)');
        if (isManual) alert('❌ 網路連線異常，請稍後再試。');
    }
}

// ==========================================
// 3. 離線/連線狀態監聽
// ==========================================
window.addEventListener('online', () => {
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        updateSyncStatusUI('🟡 連線恢復，同步中...');
        scheduleAutoSync();
    } else {
        updateSyncStatusUI('🟢 已同步');
    }
});

window.addEventListener('offline', () => {
    if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        updateSyncStatusUI('🔴 離線 (變更已儲存)');
    } else {
        updateSyncStatusUI('🔴 離線');
    }
});

// ==========================================
// 4. 右上角狀態指示燈 UI
// ==========================================
function initSyncUI() {
    const syncBar = document.createElement('div');
    syncBar.id = 'smart-sync-status';
    syncBar.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        background: rgba(30, 41, 59, 0.85);
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999;
        backdrop-filter: blur(4px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        pointer-events: none;
    `;
    document.body.appendChild(syncBar);
    
    // 初始狀態判斷
    let settings = JSON.parse(localStorage.getItem('motorcycleSettings') || '{}');
    if (!settings.gasUrl) {
        syncBar.style.display = 'none'; // 未設定網址則隱藏
    } else if (!navigator.onLine) {
        updateSyncStatusUI('🔴 離線');
    } else if (localStorage.getItem('hasUnsyncedChanges') === 'true') {
        updateSyncStatusUI('🟡 待同步');
        scheduleAutoSync();
    } else {
        updateSyncStatusUI('🟢 已同步');
    }
}

function updateSyncStatusUI(text) {
    const bar = document.getElementById('smart-sync-status');
    if (bar) {
        bar.style.display = 'block';
        bar.innerText = text;
        
        // 綠燈狀態 3 秒後變透明，避免擋住畫面
        if (text.includes('🟢')) {
            setTimeout(() => { bar.style.opacity = '0.3'; }, 3000);
        } else {
            bar.style.opacity = '1';
        }
    }
}

// ==========================================
// 5. PWA 自動更新偵測 (上一階段功能)
// ==========================================
function initPWAUpdate() {
    if ('serviceWorker' in navigator) {
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
        });

        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.update(); // 每次開啟網頁都檢查是否有新版 SW
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
    const notifyDiv = document.createElement('div');
    notifyDiv.id = 'pwa-update-banner';
    notifyDiv.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: #2563eb; color: white; padding: 12px 20px; border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.3); z-index: 9999; display: flex;
        align-items: center; gap: 15px; width: 90%; max-width: 400px; justify-content: space-between;
    `;
    notifyDiv.innerHTML = `
        <span style="font-size: 14px; font-weight: bold;">🚀 發現新版本！</span>
        <button id="pwa-reload-btn" style="background: white; color: #2563eb; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">立即更新</button>
    `;
    document.body.appendChild(notifyDiv);
    document.getElementById('pwa-reload-btn').onclick = () => window.location.reload();
}

// 系統啟動
window.addEventListener('DOMContentLoaded', () => {
    initSyncUI();
    initPWAUpdate();
});
