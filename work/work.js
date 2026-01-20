/**
 * 加班費計算機 v2.8 - JavaScript
 * - 新增三種同步模式：智慧同步(雙向)、強制上傳、強制下載
 * - 修正特休計算邏輯 (10年以上年資計算 & 畸零月數比例)
 */

(function() {
    'use strict';

    // --- 常數定義 ---\n    const LABOR_STANDARDS = {
        MONTHLY_WORK_HOURS: 240,
        WEEKDAY_RATE_1: 1.34,
        WEEKDAY_RATE_2: 1.67,
        RESTDAY_RATE_1: 1.34,
        RESTDAY_RATE_2: 1.67,
        RESTDAY_RATE_3: 2.67,
        HOLIDAY_RATE: 1.0,
        RESTDAY_TIER_1: 2,
        RESTDAY_TIER_2: 8,
    };

    const STORAGE_KEYS = {
        SETTINGS: 'overtimeSettingsV10',
        RECORDS: 'overtimeRecordsV10',
        TEMP_RECORD: 'tempOvertimeRecordV10.2',
        LAST_BACKUP: 'lastBackupDateV10',
        LAST_SYNC: 'lastSyncDateV10',
        LAST_MODIFIED: 'lastDataModifiedV1',
        WELCOME_SHOWN: 'welcomeShownV10',
        GAS_APP_URL: 'gasAppUrlV1'
    };

    const BACKUP_REMINDER_DAYS = 1;

    // --- DOM 元素快取 ---
    const salaryInput = document.getElementById('salary');
    const hourlyRateInput = document.getElementById('hourly-rate');
    const addRecordBtn = document.getElementById('add-record');
    const recordsBody = document.getElementById('records-body');
    const exportBtn = document.getElementById('export-json');
    const importBtn = document.getElementById('import-text');
    const importTextarea = document.getElementById('import-textarea');
    const deleteAllBtn = document.getElementById('delete-all');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const monthFilter = document.getElementById('month-filter');
    const totalOvertimePaySpan = document.getElementById('total-overtime-pay');
    const totalOvertimeHoursSpan = document.getElementById('total-overtime-hours');
    const importFileBtn = document.getElementById('import-file-btn');
    const importFileInput = document.getElementById('import-file-input');

    // GAS Sync DOM
    const gasAppUrlInput = document.getElementById('gas-app-url');
    const saveGasUrlBtn = document.getElementById('save-gas-url');
    const resetGasUrlBtn = document.getElementById('reset-gas-url');
    const gasSection = document.getElementById('gas-sync-section');
    
    // 新版同步按鈕 DOM
    const syncSmartBtn = document.getElementById('sync-smart-btn');
    const syncForceUploadBtn = document.getElementById('sync-force-upload-btn');
    const syncForceDownloadBtn = document.getElementById('sync-force-download-btn');

    // 特休計算 DOM
    const onboardDateInput = document.getElementById('onboard-date');
    const calcLeaveBtn = document.getElementById('calc-leave-btn');
    const leaveResultDiv = document.getElementById('leave-result');

    // 未同步提醒 DOM
    const unsyncedAlert = document.getElementById('unsynced-alert');
    const quickSyncBtn = document.getElementById('quick-sync-btn');

    // 狀態變數
    let settings = {};
    let records = [];
    let isEditing = false;
    let editId = null;

    // --- 輔助函式 ---
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.className = toast.className.replace('show', '');
        }, 3000);
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
        
        // 更新最後修改時間
        const now = Date.now();
        localStorage.setItem(STORAGE_KEYS.LAST_MODIFIED, now);
        
        updateUnsyncedUI(); // 檢查同步狀態
        render();
    }
    
    // 檢查同步狀態 (UI顯示)
    function updateUnsyncedUI() {
        const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
        const lastMod = localStorage.getItem(STORAGE_KEYS.LAST_MODIFIED);
        
        if (!gasAppUrlInput.value) {
            unsyncedAlert.style.display = 'none';
            return;
        }

        // 如果從未同步過，或者 資料修改時間 > 最後同步時間
        if (!lastSync || (lastMod && parseInt(lastMod) > new Date(lastSync).getTime())) {
            unsyncedAlert.style.display = 'flex';
        } else {
            unsyncedAlert.style.display = 'none';
        }
    }

    function checkSyncStatus() {
        updateUnsyncedUI();
    }

    function loadSettings() {
        const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (storedSettings) {
            settings = JSON.parse(storedSettings);
            salaryInput.value = settings.salary || '';
            hourlyRateInput.value = settings.hourlyRate || '';
            onboardDateInput.value = settings.onboardDate || '';
        }
    }

    function loadRecords() {
        const storedRecords = localStorage.getItem(STORAGE_KEYS.RECORDS);
        if (storedRecords) {
            records = JSON.parse(storedRecords);
        }
    }
    
    // --- 特休計算邏輯 (修正版) ---

    // 取得特休天數 (勞基法基準，修正滿10年邏輯)
    function getLeaveEntitlementByTenure(years) {
        if (years < 0.5) return 0;
        if (years < 1) return 3;
        if (years < 2) return 7;
        if (years < 3) return 10;
        if (years < 5) return 14;
        if (years < 10) return 15;
        
        // 修正：10年以上者，每一年加給一日，加至三十日為止
        // 第10年為 16日 (15+1)
        let days = 16 + Math.floor(years - 10);
        return Math.min(days, 30);
    }

    // 計算曆年制特休 (支援 月+日/30 比例算法)
    function calculateCalendarYearLeave(onboardDateStr, targetYear) {
        if (!onboardDateStr) return 0;
        const onboard = new Date(onboardDateStr);
        const yearStart = new Date(targetYear, 0, 1);
        const yearEnd = new Date(targetYear, 11, 31);
        
        if (onboard > yearEnd) return 0;

        // 週年日
        let anniversary = new Date(onboard);
        anniversary.setFullYear(targetYear);

        // --- 計算比例 (使用 月 + 日/30 邏輯) ---
        let prop1 = 0; // 前段比例
        
        if (anniversary > yearEnd) {
            prop1 = 1;
        } else if (anniversary <= yearStart) {
            prop1 = 0;
        } else {
            const month = onboard.getMonth(); // 0-based
            const day = onboard.getDate();
            // 公式：(完整月數 + 零頭天數/30) / 12
            prop1 = (month + ((day - 1) / 30)) / 12;
        }

        const prop2 = 1 - prop1; // 後段比例

        // --- 取得天數權益 ---
        const yearsServedAtAnniversary = targetYear - onboard.getFullYear();
        
        // Period 1: 滿 (Years-1) 年的權益
        const entitlement1 = getLeaveEntitlementByTenure(Math.max(0, yearsServedAtAnniversary - 1 + 0.01));
        
        // Period 2: 滿 Years 年的權益
        const entitlement2 = getLeaveEntitlementByTenure(yearsServedAtAnniversary);

        let total = (entitlement1 * prop1) + (entitlement2 * prop2);
        
        return Math.round(total * 100) / 100;
    }

    function calculateLeave() {
        const dateStr = onboardDateInput.value;
        if (!dateStr) {
            showToast('請先輸入到職日期', 'error');
            return;
        }

        // 儲存到職日到設定
        settings.onboardDate = dateStr;
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));

        const today = new Date();
        const currentYear = today.getFullYear();
        
        // 計算今年與明年
        const leaveThisYear = calculateCalendarYearLeave(dateStr, currentYear);
        const leaveNextYear = calculateCalendarYearLeave(dateStr, currentYear + 1);

        // 顯示結果
        let html = `
            <div class="leave-card">
                <h4>📅 ${currentYear} 年度</h4>
                <div class="leave-days">${leaveThisYear} <small>天</small></div>
            </div>
            <div class="leave-card">
                <h4>📅 ${currentYear + 1} 年度</h4>
                <div class="leave-days">${leaveNextYear} <small>天</small></div>
            </div>
            <div style="width:100%; margin-top:10px; font-size:0.9em; color:#666;">
                * 計算基準：曆年制 (1/1 - 12/31)<br>
                * 比例算法：((月 + 日/30) / 12)<br>
                * 僅供參考，實際天數請依公司人資系統為準
            </div>
        `;
        leaveResultDiv.innerHTML = html;
        leaveResultDiv.style.display = 'flex';
    }


    // --- 同步功能 (Google Apps Script) 重構版 ---

    const SyncManager = {
        // 取得 GAS URL
        getGasUrl() {
            return localStorage.getItem(STORAGE_KEYS.GAS_APP_URL);
        },

        // 呼叫 GAS API (GET/POST)
        async callGasApi(action, payload = null) {
            const gasUrl = this.getGasUrl();
            if (!gasUrl) throw new Error("未設定 Google Apps Script URL");

            // 構建 FormData
            const formData = new FormData();
            formData.append('action', action);
            if (payload) {
                formData.append('data', JSON.stringify(payload));
            }

            // 發送請求
            const response = await fetch(gasUrl, {
                method: 'POST',
                body: formData
            });
            
            const json = await response.json();
            if (json.status !== 'success') {
                throw new Error(json.message || "雲端操作失敗");
            }
            
            // 如果回傳 data 是字串 (有些 GAS 寫法會 stringify 兩次)，解析它
            let data = json.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch(e) {}
            }
            return data;
        },

        // 核心演算法：雙向合併
        mergeRecords(localRecords, cloudRecords) {
            const recordMap = new Map();

            // 1. 先放入本機資料 (以本機為基礎)
            localRecords.forEach(r => recordMap.set(r.id, r));

            // 2. 放入雲端資料
            // 策略：聯集 (Union)。只要 ID 不一樣就加入。
            // 若 ID 一樣：
            //   目前簡易邏輯：保留本機的 (Local wins conflicts)，
            //   因為通常使用者是在本機操作最新數據。
            //   (若未來有 updatedAt 欄位，可改為 Time-based wins)
            cloudRecords.forEach(r => {
                if (!recordMap.has(r.id)) {
                    recordMap.set(r.id, r);
                } else {
                    // ID 衝突時，檢查內容是否不同？
                    // 這裡維持使用本機版本，或是可以比較最後修改時間
                    // 暫時維持 Local wins
                }
            });

            // 轉回 Array 並排序 (依日期)
            return Array.from(recordMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
        },

        // 執行同步
        async execute(mode) {
            if (!this.getGasUrl()) {
                showToast('請先設定 Google Apps Script URL', 'error');
                switchTab('settings');
                return;
            }

            const btn = document.getElementById(
                mode === 'smart_merge' ? 'sync-smart-btn' : 
                mode === 'force_upload' ? 'sync-force-upload-btn' : 'sync-force-download-btn'
            );
            const originalText = btn ? btn.innerText : '';
            if (btn) {
                btn.disabled = true;
                btn.innerText = '⏳ 處理中...';
            }

            try {
                // 準備本機資料
                const localData = {
                    settings: settings,
                    records: records,
                    lastModified: localStorage.getItem(STORAGE_KEYS.LAST_MODIFIED) || Date.now()
                };

                if (mode === 'force_upload') {
                    // --- 強制上傳 ---
                    if (!confirm("⚠️ [強制上傳] 警告\n\n雲端資料將完全被本機資料覆蓋，且無法復原。\n確定要繼續嗎？")) {
                        throw new Error("取消操作");
                    }
                    
                    await this.callGasApi('save', localData);
                    
                    // 更新同步時間
                    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
                    updateUnsyncedUI();
                    showToast('✅ 強制上傳成功！雲端已更新。', 'success');

                } else if (mode === 'force_download') {
                    // --- 強制下載 ---
                    if (!confirm("⚠️ [強制下載] 警告\n\n本機資料將完全被雲端資料取代，且無法復原。\n確定要繼續嗎？")) {
                        throw new Error("取消操作");
                    }

                    const cloudData = await this.callGasApi('load');
                    if (!cloudData) throw new Error("雲端無資料");

                    // 覆蓋本機
                    settings = cloudData.settings || {};
                    records = cloudData.records || [];
                    saveData(); // 寫入 localStorage

                    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
                    updateUnsyncedUI();
                    showToast('✅ 強制下載成功！本機已還原。', 'success');
                    render(); // 重繪介面

                } else if (mode === 'smart_merge') {
                    // --- 智慧同步 (雙向) ---
                    showToast('⏳ 下載雲端資料中...', 'info');
                    const cloudData = await this.callGasApi('load');
                    
                    // 1. 合併紀錄
                    const cloudRecords = cloudData.records || [];
                    const mergedRecords = this.mergeRecords(records, cloudRecords);
                    
                    // 2. 合併設定 (取最後修改時間較新者，或預設保留本機)
                    // 簡易判斷：若雲端 settings 存在且非空，且本機沒設定，則用雲端
                    // 但通常 settings 跟隨裝置，這裡保守策略：保留本機 settings，除非本機是空的
                    let finalSettings = settings;
                    if (Object.keys(settings).length === 0 && cloudData.settings) {
                        finalSettings = cloudData.settings;
                    }

                    const finalData = {
                        settings: finalSettings,
                        records: mergedRecords,
                        lastModified: Date.now()
                    };

                    // 3. 寫回本機
                    settings = finalSettings;
                    records = mergedRecords;
                    saveData();

                    // 4. 寫回雲端 (讓雲端也擁有合併後的完整資料)
                    showToast('⏳ 上傳合併資料...', 'info');
                    await this.callGasApi('save', finalData);

                    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
                    updateUnsyncedUI();
                    showToast(`✅ 智慧同步完成！(總筆數: ${mergedRecords.length})`, 'success');
                    render();
                }

            } catch (error) {
                if (error.message !== "取消操作") {
                    console.error(error);
                    showToast(`❌ 同步失敗: ${error.message}`, 'error');
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            }
        }
    };


    function saveGasUrl() {
        const url = gasAppUrlInput.value.trim();
        if (url) {
            localStorage.setItem(STORAGE_KEYS.GAS_APP_URL, url);
            showToast('GAS URL 已儲存', 'success');
            checkSyncStatus();
        } else {
            showToast('請輸入有效的 URL', 'error');
        }
    }

    function resetGasUrl() {
        if(confirm('確定要清除 GAS URL 設定嗎?')) {
            localStorage.removeItem(STORAGE_KEYS.GAS_APP_URL);
            gasAppUrlInput.value = '';
            showToast('設定已清除', 'info');
            checkSyncStatus();
        }
    }
    
    function loadGasUrl() {
        const url = localStorage.getItem(STORAGE_KEYS.GAS_APP_URL);
        if (url) {
            gasAppUrlInput.value = url;
        }
    }


    // --- 核心邏輯 ---
    function getDefaultMonthValue() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    function calculateOvertime(salary, recordDate, startTime, endTime, restTime) {
        const hourlyRate = parseFloat(hourlyRateInput.value);
        if (!hourlyRate) return { pay: 0, hours: 0, details: '時薪未設定' };

        // 解析時間
        const start = new Date(`${recordDate}T${startTime}`);
        const end = new Date(`${recordDate}T${endTime}`);
        
        // 處理跨日
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }

        let diffMs = end - start;
        let workHours = diffMs / (1000 * 60 * 60);
        workHours -= restTime; // 扣除休息時間

        if (workHours <= 0) return { pay: 0, hours: 0, details: '工時不足' };

        // 判斷日期類型 (平日/休息日/國定假日)
        const dayOfWeek = new Date(recordDate).getDay(); // 0=Sun, 6=Sat
        // 簡易判斷：週六為休息日(6)，週日為例假(0)，其他平日
        // 若需更精確需加上國定假日判斷邏輯
        
        let pay = 0;
        let details = '';

        // 這裡僅示範休息日與平日邏輯 (依照之前的需求)
        // 假設使用者手動判定類型，或預設週六=休息日
        
        // 使用者目前沒有輸入日期類型，我們假設：
        // 週六 = 休息日
        // 週日 = 例假 (通常不能加班，除非天災，這裡暫時視為休息日計算以便寬容)
        // 平日 = 平日加班
        
        // *為了相容舊版邏輯，這裡簡化處理，具體依需求可擴充*
        const isRestDay = (dayOfWeek === 6 || dayOfWeek === 0);

        if (isRestDay) {
            // 休息日加班費
            // 前2小時 * 1.34 (4/3)
            // 第3-8小時 * 1.67 (5/3)
            // 第9小時起 * 2.67 (8/3)
            
            let h1 = Math.min(workHours, 2);
            let h2 = Math.min(Math.max(workHours - 2, 0), 6);
            let h3 = Math.max(workHours - 8, 0);

            let pay1 = h1 * hourlyRate * 1.34;
            let pay2 = h2 * hourlyRate * 1.67;
            let pay3 = h3 * hourlyRate * 2.67;
            
            pay = Math.round(pay1 + pay2 + pay3);
            details = `休息日: ${h1.toFixed(1)}h×1.34 + ${h2.toFixed(1)}h×1.67 + ${h3.toFixed(1)}h×2.67`;

        } else {
            // 平日加班 (通常是超過8小時後才算，但此計算機似乎是輸入"加班時段")
            // 假設輸入的時段 全都是加班
            // 前2小時 * 1.34
            // 後續 * 1.67
            
            let h1 = Math.min(workHours, 2);
            let h2 = Math.max(workHours - 2, 0);
            
            let pay1 = h1 * hourlyRate * 1.34;
            let pay2 = h2 * hourlyRate * 1.67;
            
            pay = Math.round(pay1 + pay2);
            details = `平日: ${h1.toFixed(1)}h×1.34 + ${h2.toFixed(1)}h×1.67`;
        }

        return { pay, hours: workHours, details };
    }

    function render() {
        recordsBody.innerHTML = '';
        let totalPay = 0;
        let totalHours = 0;

        const currentMonth = monthFilter.value; // YYYY-MM
        
        // 排序：日期新 -> 舊
        const sortedRecords = records.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedRecords.forEach(record => {
            // 篩選月份
            if (!record.date.startsWith(currentMonth)) return;

            const row = document.createElement('tr');
            
            // 計算加班費 (若記錄中沒有存，則即時計算)
            // 為了效能與資料一致性，建議在儲存時就算好 pay。但若費率改了，可能要重算。
            // 這裡採用「即時重算」策略，確保費率變更後即時反映
            const result = calculateOvertime(
                settings.salary, 
                record.date, 
                record.startTime, 
                record.endTime, 
                parseFloat(record.restTime || 0)
            );

            totalPay += result.pay;
            totalHours += result.hours;

            row.innerHTML = `
                <td>${record.date}</td>
                <td>${record.startTime} ~ ${record.endTime}</td>
                <td>${record.restTime || 0}</td>
                <td>${result.hours.toFixed(1)}</td>
                <td class="money">${result.pay}</td>
                <td class="actions">
                    <button class="btn-small btn-secondary" onclick="app.toggleDetails(this, '${result.details}')">詳</button>
                    <button class="btn-small btn-primary" onclick="app.editRecord('${record.id}')">修</button>
                    <button class="btn-small btn-danger" onclick="app.deleteRecord('${record.id}')">刪</button>
                </td>
            `;
            
            // 加入詳情列 (隱藏)
            const detailRow = document.createElement('tr');
            detailRow.className = 'formula-detail-row';
            detailRow.style.display = 'none';
            detailRow.innerHTML = `
                <td colspan="6" class="formula-detail">
                    計算公式：${result.details}
                </td>
            `;

            recordsBody.appendChild(row);
            recordsBody.appendChild(detailRow);
        });

        totalOvertimePaySpan.textContent = totalPay;
        totalOvertimeHoursSpan.textContent = totalHours.toFixed(1);

        // 如果該月份無資料
        if (recordsBody.children.length === 0) {
            recordsBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999;">本月尚無加班紀錄</td></tr>`;
        }
    }

    // --- 操作事件 ---
    function addOrUpdateRecord() {
        const date = document.getElementById('work-date').value;
        const startTime = document.getElementById('start-time').value;
        const endTime = document.getElementById('end-time').value;
        const restTime = document.getElementById('rest-time').value;

        if (!date || !startTime || !endTime) {
            showToast('請填寫完整日期與時間', 'error');
            return;
        }

        const record = {
            id: isEditing ? editId : generateId(),
            date,
            startTime,
            endTime,
            restTime: parseFloat(restTime || 0)
        };

        if (isEditing) {
            const index = records.findIndex(r => r.id === editId);
            if (index !== -1) records[index] = record;
            isEditing = false;
            editId = null;
            addRecordBtn.textContent = '新增紀錄';
            showToast('紀錄已更新');
        } else {
            records.push(record);
            showToast('紀錄已新增');
        }

        // 重置表單 (保留日期方便連續輸入)
        // document.getElementById('work-date').value = ''; 
        document.getElementById('start-time').value = '';
        document.getElementById('end-time').value = '';
        
        saveData();
    }

    function editRecord(id) {
        const record = records.find(r => r.id === id);
        if (!record) return;

        document.getElementById('work-date').value = record.date;
        document.getElementById('start-time').value = record.startTime;
        document.getElementById('end-time').value = record.endTime;
        document.getElementById('rest-time').value = record.restTime;

        isEditing = true;
        editId = id;
        addRecordBtn.textContent = '確認修改';
        
        // 切換到輸入頁籤
        switchTab('punch');
    }

    function deleteRecord(id) {
        if (confirm('確定要刪除此紀錄嗎？')) {
            records = records.filter(r => r.id !== id);
            saveData();
            showToast('紀錄已刪除');
        }
    }
    
    function toggleDetails(btn, detailsText) {
        const row = btn.closest('tr');
        const detailRow = row.nextElementSibling;
        if (detailRow.style.display === 'none') {
            detailRow.style.display = 'table-row';
            // btn.textContent = '收';
        } else {
            detailRow.style.display = 'none';
            // btn.textContent = '詳';
        }
    }

    function switchTab(tabId) {
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        tabContents.forEach(content => {
            if (content.id === tabId) content.classList.add('active');
            else content.classList.remove('active');
        });
    }

    // --- JSON 匯入匯出 ---
    function exportData() {
        const data = {
            settings,
            records,
            exportDate: new Date().toISOString()
        };
        const json = JSON.stringify(data, null, 2);
        
        // 複製到剪貼簿
        navigator.clipboard.writeText(json).then(() => {
            showToast('資料已複製到剪貼簿 (JSON)');
            document.getElementById('copy-success').style.display = 'block';
            setTimeout(() => document.getElementById('copy-success').style.display = 'none', 3000);
        });
    }

    function importData() {
        try {
            const json = importTextarea.value;
            if (!json) return;
            
            const data = JSON.parse(json);
            if (data.records && Array.isArray(data.records)) {
                if (confirm(`確定匯入 ${data.records.length} 筆紀錄嗎？目前的資料將被合併或覆蓋。`)) {
                    records = data.records;
                    if (data.settings) settings = data.settings;
                    saveData();
                    showToast('匯入成功');
                    importTextarea.value = '';
                }
            } else {
                showToast('JSON 格式錯誤', 'error');
            }
        } catch (e) {
            showToast('JSON 解析失敗: ' + e.message, 'error');
        }
    }

    function handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            importTextarea.value = e.target.result;
            showToast('檔案已讀取，請按「確認匯入」');
        };
        reader.readAsText(file);
    }
    
    // --- 備份提醒 ---
    function checkBackupReminder() {
        const lastBackup = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
        const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
        
        // 如果有同步過，優先看同步時間
        const lastActionTime = lastSync ? new Date(lastSync).getTime() : (lastBackup ? parseInt(lastBackup) : 0);
        
        const now = Date.now();
        const diffDays = (now - lastActionTime) / (1000 * 60 * 60 * 24);

        if (diffDays > BACKUP_REMINDER_DAYS) {
            const modal = document.getElementById('backup-modal');
            document.getElementById('backup-days-count').textContent = Math.floor(diffDays);
            modal.classList.add('show');
            
            document.getElementById('modal-backup-now').onclick = () => {
                modal.classList.remove('show');
                switchTab('settings'); // 導向設定頁進行備份
            };
            document.getElementById('modal-remind-later').onclick = () => {
                modal.classList.remove('show');
            };
        }
    }
    
    // --- Hash Routing 簡易處理 ---
    function handleUrlHash() {
        const hash = window.location.hash.substring(1); // remove #
        if (hash) {
            // 支援 #settings, #punch, #records
            if (['settings', 'punch', 'records'].includes(hash)) {
                switchTab(hash);
            }
        }
    }

    // --- 事件監聽 ---
    function setupEventListeners() {
        addRecordBtn.addEventListener('click', addOrUpdateRecord);
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
                window.location.hash = btn.dataset.tab;
            });
        });

        monthFilter.addEventListener('change', render);
        
        exportBtn.addEventListener('click', exportData);
        importBtn.addEventListener('click', importData);
        deleteAllBtn.addEventListener('click', () => {
            if (confirm('確定刪除所有資料？此動作無法復原！')) {
                records = [];
                saveData();
                showToast('所有資料已清空');
            }
        });

        // 薪資設定變更自動存
        salaryInput.addEventListener('change', () => {
            settings.salary = salaryInput.value;
            saveData();
        });
        hourlyRateInput.addEventListener('change', () => {
            settings.hourlyRate = hourlyRateInput.value;
            saveData();
        });
        
        importFileBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', handleImportFile);

        // 特休計算
        calcLeaveBtn.addEventListener('click', calculateLeave);

        // GAS Sync Event Listeners
        saveGasUrlBtn.addEventListener('click', saveGasUrl);
        resetGasUrlBtn.addEventListener('click', resetGasUrl);
        
        // 新版三按鈕
        if(syncSmartBtn) syncSmartBtn.addEventListener('click', () => SyncManager.execute('smart_merge'));
        if(syncForceUploadBtn) syncForceUploadBtn.addEventListener('click', () => SyncManager.execute('force_upload'));
        if(syncForceDownloadBtn) syncForceDownloadBtn.addEventListener('click', () => SyncManager.execute('force_download'));
        
        // 快速同步 (Alert Bar)
        if(quickSyncBtn) quickSyncBtn.addEventListener('click', () => SyncManager.execute('smart_merge'));
    }

    // --- 應用程式初始化 ---
    function init() {
        loadSettings();
        loadRecords();
        loadGasUrl();
        
        // 1. 設定預設月份
        monthFilter.value = getDefaultMonthValue();
        
        render();
        setupEventListeners();
        
        // 2. 決定初始 Tab
        if (settings && settings.salary > 0 && settings.hourlyRate > 0) {
            switchTab('punch');
        } else {
            switchTab('settings');
        }
        
        setTimeout(() => checkBackupReminder(), 2000);
        checkSyncStatus(); // 初始檢查同步狀態
        handleUrlHash();
    }

    // --- 全域 API ---
    window.app = {
        deleteRecord,
        editRecord,
        toggleDetails
    };

    // --- 啟動 ---
    init();

})();

// --- Service Worker 註冊 ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
            // console.log('ServiceWorker registration successful');
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
