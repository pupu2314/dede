/**
 * smart-sync.js (Refactored v2.0) 
 * 功能：智慧背景同步、離線排隊、PWA 更新監控
 * 採用非侵入式攔截與狀態機設計
 */

const SmartSync = {
    // --- 配置設定 ---
    config: {
        syncKeys: ['chargeLog', 'maintenanceLog', 'expenseLog', 'statusLog'],
        settingsKey: 'motorcycleSettings',
        dirtyKey: 'hasUnsyncedChanges',
        backupDateKey: 'lastBackupDate',
        autoSyncDelay: 8000,
        retryDelay: 30000,
        maxRetries: 2
    },

    // --- 內部狀態 ---
    state: {
        isSyncing: false,
        retryCount: 0,
        syncTimeout: null,
        status: 'IDLE' // IDLE, PENDING, SYNCING, ERROR, OFFLINE
    },

    /**
     * 初始化核心功能
     */
    init() {
        this.initInterceptor();
        this.initNetworkListeners();
        this.initPWAUpdate();
        
        // 初次載入檢查是否有未完成任務
        window.addEventListener('DOMContentLoaded', () => {
            this.createUI();
            if (localStorage.getItem(this.config.dirtyKey) === 'true') {
                this.setPending();
            } else {
                this.updateUI('🟢 已同步');
            }
        });
    },

    /**
     * 1. 攔截器：監控資料變動
     */
    initInterceptor() {
        const self = this;
        const originalSetItem = localStorage.setItem;

        localStorage.setItem = function(key, value) {
            originalSetItem.apply(this, arguments);
            
            if (self.config.syncKeys.includes(key)) {
                originalSetItem.call(this, self.config.dirtyKey, 'true');
                self.setPending();
            }
        };
    },

    /**
     * 2. 網路監控
     */
    initNetworkListeners() {
        window.addEventListener('online', () => {
            if (localStorage.getItem(this.config.dirtyKey) === 'true') {
                this.scheduleSync(3000);
            } else {
                this.updateUI('🟢 已同步');
            }
        });

        window.addEventListener('offline', () => {
            this.state.status = 'OFFLINE';
            this.updateUI('🔴 離線 (待恢復)');
        });
    },

    /**
     * 3. 同步排程管理
     */
    setPending() {
        this.state.status = 'PENDING';
        this.updateUI('🟡 待同步');
        this.scheduleSync(this.config.autoSyncDelay);
    },

    scheduleSync(delay) {
        if (this.state.syncTimeout) clearTimeout(this.state.syncTimeout);
        this.state.syncTimeout = setTimeout(() => {
            this.execute();
        }, delay);
    },

    /**
     * 4. 執行同步核心
     * @param {boolean} isManual 是否為手動觸發
     */
    async execute(isManual = false) {
        if (!navigator.onLine) {
            if (isManual) alert('目前無網路連線，資料已安全儲存。');
            return;
        }

        if (this.state.isSyncing) return;

        const hasChanges = localStorage.getItem(this.config.dirtyKey) === 'true';
        if (!isManual && !hasChanges) {
            this.updateUI('🟢 已同步');
            return;
        }

        const gasUrl = this.getGasUrl();
        if (!gasUrl) {
            if (isManual) alert('請先進入設定配置 Google Sheets 網址');
            return;
        }

        this.state.isSyncing = true;
        this.state.status = 'SYNCING';
        this.updateUI(isManual ? '🔄 強制同步中...' : '🔄 自動同步中...');

        const payload = {
            action: 'backup',
            ChargeLog: this.getLocalJSON('chargeLog'),
            MaintenanceLog: this.getLocalJSON('maintenanceLog'),
            ExpenseLog: this.getLocalJSON('expenseLog'),
            StatusLog: this.getLocalJSON('statusLog')
        };

        try {
            const response = await fetch(gasUrl, {
                method: 'POST',
                mode: 'cors',
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.handleSuccess(isManual);
            } else {
                throw new Error(result.message || '伺服器端錯誤');
            }
        } catch (error) {
            this.handleError(error, isManual);
        } finally {
            this.state.isSyncing = false;
        }
    },

    handleSuccess(isManual) {
        localStorage.removeItem(this.config.dirtyKey);
        const now = new Date().toISOString().slice(0, 10);
        localStorage.setItem(this.config.backupDateKey, now);
        
        this.state.status = 'IDLE';
        this.state.retryCount = 0;
        this.updateUI('🟢 已同步');
        
        if (isManual) alert('✅ 備份成功！');
    },

    handleError(error, isManual) {
        console.error('[SmartSync] Error:', error);
        this.state.status = 'ERROR';

        if (isManual) {
            this.updateUI('🔴 同步失敗');
            alert(`❌ 同步失敗\n原因：${error.message}\n請確認網路與 GAS 設定。`);
        } else {
            if (this.state.retryCount < this.config.maxRetries) {
                this.state.retryCount++;
                this.updateUI(`🟡 等待重試 (${this.state.retryCount})`);
                this.scheduleSync(this.config.retryDelay);
            } else {
                this.updateUI('🔴 同步暫緩');
                this.state.retryCount = 0;
            }
        }
    },

    /**
     * 工具方法
     */
    getGasUrl() {
        try {
            const settings = JSON.parse(localStorage.getItem(this.config.settingsKey) || '{}');
            return settings.gasUrl || null;
        } catch (e) {
            return null;
        }
    },

    getLocalJSON(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch (e) {
            return [];
        }
    },

    /**
     * UI 渲染邏輯
     */
    createUI() {
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
    },

    updateUI(text) {
        const bar = document.getElementById('smart-sync-status');
        if (!bar) return;
        bar.style.display = 'block';
        bar.style.opacity = '1';
        bar.innerText = text;

        if (text.includes('🟢')) {
            setTimeout(() => {
                if (bar.innerText.includes('🟢')) bar.style.opacity = '0.3';
            }, 3000);
        }
    },

    /**
     * PWA 更新偵測
     */
    initPWAUpdate() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.update();
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.showUpdateBanner();
                    }
                });
            });
        });
    },

    showUpdateBanner() {
        if (document.getElementById('pwa-update-banner')) return;
        const div = document.createElement('div');
        div.id = 'pwa-update-banner';
        div.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #2563eb; color: white; padding: 12px 20px; border-radius: 12px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.3); z-index: 10000; display: flex;
            align-items: center; gap: 15px; width: 90%; max-width: 400px; justify-content: space-between;
        `;
        div.innerHTML = `
            <span style="font-weight:bold">🚀 發現新版本！</span>
            <button onclick="window.location.reload()" style="background:white; color:#2563eb; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">更新</button>
        `;
        document.body.appendChild(div);
    }
};

// 啟動單例
SmartSync.init();

// 對外暴露手動觸發接口 (供 index.html 備份按鈕使用)
window.executeManualSync = () => SmartSync.execute(true);
