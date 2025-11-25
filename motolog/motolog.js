/* motolog.js
   Based on v15 (Unified Prefill) + Modifications:
   1. 顯示程式版本 (v15.2.0)。
   2. 離線偵測 (禁止同步)。
   3. 顯示最後更新時間 (例如：2小時前)。
   4. [修復] 解決無數據時 toLocaleString 錯誤 (v15.2.1)。
*/

console.log('motolog.js (v15.2.2): loaded');

const APP_VERSION = 'v15.2.2';
const SETTINGS_KEY = 'motorcycleSettings';
const BACKUP_KEY = 'lastBackupDate';

const MAINT_TEMPLATES = [
    { name: '基本費', cost: 0 },
    { name: '齒輪油', cost: 0 },
    { name: '煞車油', cost: 0 },
    { name: '煞車來令片', cost: 0 },
    { name: '輪胎(前)', cost: 0 },
    { name: '輪胎(後)', cost: 0 },
    { name: '傳動系統濾棉', cost: 0 },
    { name: '傳動皮帶', cost: 0 },
    { name: '燈泡', cost: 0 },
    { name: '保險絲', cost: 0 },
    { name: '鉛酸電池 (12V)', cost: 0 }
];

const REGULAR_SERVICE_KM = 3000;
const REGULAR_SERVICE_DAYS = 180;

var chargeTimer = null;
var selectedStation = '';

function safe(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
}

function showToast(message, type = 'info') {
    var toast = safe('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show toast-${type}`;

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ====================================================================
// 資料存取與處理
// ====================================================================

function loadLog(key) {
    var log = localStorage.getItem(key);
    try {
        return log ? JSON.parse(log) : [];
    } catch (e) {
        console.error(`Error parsing localStorage key: ${key}`, e);
        return [];
    }
}

function saveLog(key, log) {
    localStorage.setItem(key, JSON.stringify(log));
    updateDashboard(); // 每次儲存都更新儀表板
}

function loadSettings() {
    var settings = localStorage.getItem(SETTINGS_KEY);
    try {
        return settings ? JSON.parse(settings) : { gasUrl: '', bikeModel: '未設定' };
    } catch (e) {
        console.error(`Error parsing localStorage key: ${SETTINGS_KEY}`, e);
        return { gasUrl: '', bikeModel: '未設定' };
    }
}

function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Helper: 將日期字串轉換為 Date 物件
function parseDate(dateStr) {
    if (!dateStr) return null;
    // 假設日期格式為 YYYY-MM-DD
    var parts = dateStr.split('-');
    // 注意：月份在 JavaScript Date 物件中是 0-based
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

// 獲取最新的里程數 (從任何一個有里程紀錄的 Log)
function getCurrentMileage() {
    var chargeLog = loadLog('chargeLog');
    var maintLog = loadLog('maintenanceLog');
    var statusLog = loadLog('statusLog');

    var allLogs = [...chargeLog, ...maintLog, ...statusLog];
    
    // 過濾掉沒有 mileage 屬性的項目
    var logsWithMileage = allLogs.filter(log => log.mileage && !isNaN(parseInt(log.mileage)));
    
    if (logsWithMileage.length === 0) {
        return 0;
    }
    
    // 依日期和時間降冪排序
    logsWithMileage.sort((a, b) => {
        var dateA = parseDate(a.date || '1970-01-01');
        var dateB = parseDate(b.date || '1970-01-01');

        if (dateA.getTime() !== dateB.getTime()) {
            return dateB.getTime() - dateA.getTime();
        }
        
        // 如果日期相同，則比較時間，假設時間在 time 屬性中 (HH:MM)
        var timeA = a.time || '00:00';
        var timeB = b.time || '00:00';
        return timeB.localeCompare(timeA);
    });

    // 返回最新的里程數
    return parseInt(logsWithMileage[0].mileage) || 0;
}


// ====================================================================
// 儀表板更新
// ====================================================================

function updateDashboard() {
    var chargeLog = loadLog('chargeLog');
    var maintLog = loadLog('maintenanceLog');
    var expenseLog = loadLog('expenseLog');
    var settings = loadSettings();

    // ----------------------------------------------------
    // 1. 總覽統計計算 (總里程、總花費、平均花費)
    // ----------------------------------------------------
    var totalMileage = getCurrentMileage();
    
    var allCosts = [
        ...chargeLog.map(l => parseFloat(l.cost) || 0),
        ...maintLog.map(l => parseFloat(l.totalCost) || 0),
        ...expenseLog.map(l => parseFloat(l.cost) || 0)
    ];
    
    var totalCost = allCosts.reduce((sum, cost) => sum + cost, 0);
    
    var avgCostPerKm = null;
    if (totalCost > 0 && totalMileage > 0) {
        avgCostPerKm = totalCost / totalMileage;
    }

    // ----------------------------------------------------
    // 2. 上次充電 / 最後更新時間計算
    // ----------------------------------------------------
    var lastChargeDate = null;
    var lastChargeEntry = chargeLog.length > 0 ? chargeLog.sort((a, b) => {
        return parseDate(b.date).getTime() - parseDate(a.date).getTime();
    })[0] : null;

    if (lastChargeEntry) {
        lastChargeDate = parseDate(lastChargeEntry.date);
    }
    
    var lastChargeDays = null;
    if (lastChargeDate) {
        var today = new Date();
        var diffTime = Math.abs(today - lastChargeDate);
        lastChargeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // ----------------------------------------------------
    // 3. 下次保養計算
    // ----------------------------------------------------
    var lastServiceEntry = maintLog.length > 0 ? maintLog.sort((a, b) => {
        return parseDate(b.date).getTime() - parseDate(a.date).getTime();
    })[0] : null;

    var lastServiceMileage = lastServiceEntry ? parseInt(lastServiceEntry.mileage) : 0;
    var lastServiceDate = lastServiceEntry ? parseDate(lastServiceEntry.date) : null;
    
    // 里程提醒
    var nextServiceMileage = lastServiceMileage + REGULAR_SERVICE_KM;
    var kmRemaining = nextServiceMileage - totalMileage;
    
    // 日期提醒
    var nextServiceDueDate = lastServiceDate ? new Date(lastServiceDate.getTime() + REGULAR_SERVICE_DAYS * 24 * 60 * 60 * 1000) : null;
    var daysRemaining = nextServiceDueDate ? Math.ceil((nextServiceDueDate - new Date()) / (1000 * 60 * 60 * 24)) : null;

    var nextServiceStatus = '待記錄';
    var nextServiceDetails = '無記錄';

    if (lastServiceEntry) {
        // 優先判斷是否超期/超里程
        if (kmRemaining <= 0 || (daysRemaining !== null && daysRemaining <= 0)) {
            nextServiceStatus = '⚠️ 超期!';
            safe('nextServiceStatus').classList.add('status-warning');
            nextServiceDetails = `已超期${Math.abs(kmRemaining)}公里或${Math.abs(daysRemaining)}天`;
        } else if (kmRemaining <= 500 || (daysRemaining !== null && daysRemaining <= 30)) {
            // 接近預警
            nextServiceStatus = '🔔 預警';
            safe('nextServiceStatus').classList.remove('status-warning');
            safe('nextServiceStatus').classList.add('status-info');
            nextServiceDetails = `約 ${kmRemaining} 公里 / ${daysRemaining} 天`;
        } else {
            // 正常
            nextServiceStatus = '正常';
            safe('nextServiceStatus').classList.remove('status-warning', 'status-info');
            nextServiceDetails = `約 ${kmRemaining} 公里 / ${daysRemaining} 天`;
        }
    } else {
        safe('nextServiceStatus').classList.remove('status-warning', 'status-info');
    }

    // ----------------------------------------------------
    // 4. 儀表板元素更新
    // ----------------------------------------------------
    
    // [修復點 1 - toLocaleString 錯誤]
    safe('totalMileage').textContent = (totalMileage ?? 0).toLocaleString('zh-TW'); 

    // [修復點 2 - toLocaleString 錯誤]
    safe('totalCost').textContent = 'NT$ ' + (totalCost ?? 0).toLocaleString('zh-TW', { maximumFractionDigits: 0 });

    // [修復點 3 - toLocaleString 錯誤]
    safe('avgCostPerKm').textContent = avgCostPerKm !== null 
        ? 'NT$ ' + avgCostPerKm.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
        : '-';

    // 上次充電
    safe('lastChargeDays').textContent = lastChargeDays !== null ? `${lastChargeDays}` : '-';
    safe('lastChargeDate').textContent = lastChargeDate !== null 
        ? lastChargeDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) 
        : '無記錄';
        
    // 下次保養
    safe('nextServiceStatus').textContent = nextServiceStatus;
    safe('nextServiceDate').textContent = nextServiceDetails;
    
    // 顯示版本
    safe('appVersion').textContent = APP_VERSION;
    
    // 最後同步時間
    var lastBackupDate = localStorage.getItem(BACKUP_KEY);
    var backupStatusText = '從未同步';
    var topAlertClass = 'top-alert-danger'; // 預設為紅色

    if (lastBackupDate) {
        var lastDate = new Date(lastBackupDate);
        var now = new Date();
        var diffHours = Math.floor((now - lastDate) / (1000 * 60 * 60));
        var diffMinutes = Math.floor((now - lastDate) / (1000 * 60));

        if (diffHours < 24) {
            backupStatusText = `約 ${diffHours} 小時前`;
            topAlertClass = 'top-alert-success';
        } else if (diffHours < 72) {
             backupStatusText = `約 ${Math.floor(diffHours / 24)} 天前`;
             topAlertClass = 'top-alert-warning';
        } else {
            backupStatusText = `已超過 ${Math.floor(diffHours / 24)} 天`;
            topAlertClass = 'top-alert-danger';
        }
    }

    safe('lastSyncTime').textContent = backupStatusText;
    safe('topAlert').className = `top-alert ${topAlertClass}`;
    safe('topAlert').textContent = `最後同步：${backupStatusText}`;
}

// ====================================================================
// Log 紀錄處理 (通用)
// ====================================================================

function addLogEntry(key, logEntry) {
    if (!logEntry.date || !logEntry.mileage) {
        showToast('❌ 請填寫日期和里程！', 'error');
        return false;
    }
    
    var mileage = parseInt(logEntry.mileage);
    if (isNaN(mileage) || mileage < 0) {
        showToast('❌ 里程數無效！', 'error');
        return false;
    }

    var log = loadLog(key);
    log.push(logEntry);
    saveLog(key, log);
    return true;
}

function deleteLogEntry(key, index) {
    var log = loadLog(key);
    log.splice(index, 1);
    saveLog(key, log);
}

function clearLog(key, name) {
    if (confirm(`確定要清空所有 ${name} 紀錄嗎？這無法復原！`)) {
        localStorage.removeItem(key);
        updateDashboard();
        renderLogs();
        showToast(`🗑️ 所有 ${name} 紀錄已清除。`, 'success');
    }
}

// ====================================================================
// 頁面切換與初始化
// ====================================================================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
    });

    safe(pageId).style.display = 'block';
    safe(`tab-${pageId}`).classList.add('active');

    // 切換頁面後，根據需要渲染 Log 列表
    if (pageId.endsWith('Log')) {
        renderLogs(pageId);
    } else if (pageId === 'settings') {
        renderSettings();
    }
    
    // 預先填寫當前日期和里程
    if (pageId === 'chargeLog' || pageId === 'maintenanceLog' || pageId === 'expenseLog') {
        prefillForm(pageId);
    }
}

function prefillForm(pageId) {
    var today = new Date().toISOString().substring(0, 10);
    var now = new Date();
    var time = now.toTimeString().substring(0, 5); // HH:MM

    var mileage = getCurrentMileage();
    
    // 預填日期、時間、里程
    safe(`${pageId}-date`).value = today;
    safe(`${pageId}-time`).value = time;
    safe(`${pageId}-mileage`).value = mileage > 0 ? mileage : '';
}

// ====================================================================
// 紀錄渲染 (Log Page)
// ====================================================================

function getLogDisplayInfo(logEntry, key) {
    var title = '';
    var details = '';
    var cost = 0;
    
    switch (key) {
        case 'chargeLog':
            title = logEntry.station ? `${logEntry.station}` : `充電紀錄`;
            details = `NT$ ${logEntry.cost} (${logEntry.kWh} kWh)`;
            cost = parseFloat(logEntry.cost) || 0;
            break;
        case 'maintenanceLog':
            title = `保養 (${logEntry.items.length} 項目)`;
            details = `NT$ ${logEntry.totalCost} / 師傅: ${logEntry.mechanic}`;
            cost = parseFloat(logEntry.totalCost) || 0;
            break;
        case 'expenseLog':
            title = `${logEntry.item} (${logEntry.category})`;
            details = `NT$ ${logEntry.cost}`;
            cost = parseFloat(logEntry.cost) || 0;
            break;
    }

    return { title, details, cost };
}

function renderLogs(pageId) {
    var logKey = pageId.replace('Page', ''); // 例如：'chargeLog'
    var log = loadLog(logKey);
    var listElement = safe(`${logKey}List`);
    var summaryElement = safe(`${logKey}Summary`);
    
    if (!listElement || !summaryElement) return;

    listElement.innerHTML = '';

    if (log.length === 0) {
        listElement.innerHTML = '<li class="log-empty">目前沒有任何紀錄。</li>';
        summaryElement.innerHTML = `共 0 筆紀錄`;
        return;
    }
    
    // 依日期時間降冪排序
    log.sort((a, b) => {
        var dateA = parseDate(a.date || '1970-01-01');
        var dateB = parseDate(b.date || '1970-01-01');
        
        var timeA = a.time || '00:00';
        var timeB = b.time || '00:00';
        
        // 優先比較日期
        if (dateA.getTime() !== dateB.getTime()) {
            return dateB.getTime() - dateA.getTime();
        }
        
        // 日期相同則比較時間
        return timeB.localeCompare(timeA);
    });

    var totalCost = 0;
    
    log.forEach((entry, index) => {
        var { title, details, cost } = getLogDisplayInfo(entry, logKey);
        totalCost += cost;

        var listItem = document.createElement('li');
        listItem.className = 'log-item';
        
        var dateStr = entry.date ? parseDate(entry.date).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }) : '無日期';
        var timeStr = entry.time ? ` ${entry.time}` : '';
        
        // 紀錄內容區
        listItem.innerHTML = `
            <div class="log-content">
                <div class="log-date-mileage">
                    <span class="log-date">${dateStr}${timeStr}</span> 
                    <span class="log-mileage">${(parseInt(entry.mileage) || 0).toLocaleString('zh-TW')} km</span>
                </div>
                <div class="log-title">${title}</div>
                <div class="log-details">${details}</div>
            </div>
            <button class="log-delete-btn" data-index="${index}" data-key="${logKey}">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M15 6V4c0-1-1-2-2-2h-2c-1 0-2 1-2 2v2"/></svg>
            </button>
        `;
        
        listElement.appendChild(listItem);
    });

    summaryElement.innerHTML = `共 ${log.length} 筆紀錄，總花費 NT$ ${totalCost.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;
    
    // 為刪除按鈕添加事件監聽器
    listElement.querySelectorAll('.log-delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            if (confirm('確定要刪除這筆紀錄嗎？')) {
                var index = parseInt(e.currentTarget.dataset.index);
                var key = e.currentTarget.dataset.key;
                deleteLogEntry(key, index);
                renderLogs(pageId); // 重新渲染當前 Log 頁面
                updateDashboard(); // 更新儀表板數據
                showToast('🗑️ 紀錄已刪除！', 'success');
            }
        });
    });
}


// ====================================================================
// 充電紀錄 (Charge Log) 邏輯
// ====================================================================

function addChargeLog() {
    var date = safe('chargeLog-date').value;
    var time = safe('chargeLog-time').value;
    var mileage = safe('chargeLog-mileage').value;
    var cost = safe('chargeLog-cost').value;
    var kWh = safe('chargeLog-kwh').value;
    var station = safe('chargeLog-station').value;
    var note = safe('chargeLog-note').value;

    if (!cost || !kWh) {
        showToast('❌ 請填寫花費金額和充電度數！', 'error');
        return;
    }
    
    var logEntry = {
        date: date,
        time: time,
        mileage: mileage,
        cost: parseFloat(cost).toFixed(2),
        kWh: parseFloat(kWh).toFixed(2),
        station: station,
        note: note
    };

    if (addLogEntry('chargeLog', logEntry)) {
        showToast('✅ 充電紀錄新增成功！', 'success');
        document.querySelector('#chargeLogForm').reset();
        prefillForm('chargeLog'); // 重新預填
        renderLogs('chargeLogPage');
    }
}

// ====================================================================
// 保養紀錄 (Maintenance Log) 邏輯
// ====================================================================

function renderMaintenanceTemplates() {
    var container = safe('maintenanceItemsContainer');
    if (!container) return;
    
    container.innerHTML = '';

    MAINT_TEMPLATES.forEach((template, index) => {
        var itemDiv = document.createElement('div');
        itemDiv.className = 'maintenance-item';
        itemDiv.innerHTML = `
            <input type="checkbox" id="maint-item-${index}" name="maint-item" value="${template.name}" data-cost="${template.cost}">
            <label for="maint-item-${index}">${template.name}</label>
        `;
        container.appendChild(itemDiv);
    });
    
    // 監聽所有複選框和成本輸入的變化，以更新總金額
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateMaintenanceTotal);
    });
    safe('maintenanceLog-otherCost').addEventListener('input', updateMaintenanceTotal);
}

function updateMaintenanceTotal() {
    var selectedItems = document.querySelectorAll('#maintenanceItemsContainer input[type="checkbox"]:checked');
    var totalCost = parseFloat(safe('maintenanceLog-baseCost').value || 0);
    var otherCost = parseFloat(safe('maintenanceLog-otherCost').value || 0);
    
    selectedItems.forEach(item => {
        // 目前設計是模板沒有 cost 欄位，所以只算基本費 + 額外費用
        // 如果未來模板有預設費用，可以在這裡加上：
        // totalCost += parseFloat(item.dataset.cost) || 0; 
    });
    
    totalCost += otherCost;

    safe('maintenanceLog-totalCost').textContent = '總計：NT$ ' + totalCost.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
    safe('maintenanceLog-totalCost-hidden').value = totalCost;
}


function addMaintenanceLog() {
    var date = safe('maintenanceLog-date').value;
    var time = safe('maintenanceLog-time').value;
    var mileage = safe('maintenanceLog-mileage').value;
    var totalCost = safe('maintenanceLog-totalCost-hidden').value; // 來自隱藏欄位
    var mechanic = safe('maintenanceLog-mechanic').value;
    var note = safe('maintenanceLog-note').value;
    
    if (!totalCost || parseFloat(totalCost) <= 0) {
        showToast('❌ 總花費金額無效或為零！', 'error');
        return;
    }

    var selectedItems = Array.from(document.querySelectorAll('#maintenanceItemsContainer input[type="checkbox"]:checked'))
                               .map(cb => ({ name: cb.value }));

    var logEntry = {
        date: date,
        time: time,
        mileage: mileage,
        totalCost: parseFloat(totalCost).toFixed(2),
        mechanic: mechanic,
        items: selectedItems,
        note: note
    };

    if (addLogEntry('maintenanceLog', logEntry)) {
        showToast('✅ 保養紀錄新增成功！', 'success');
        document.querySelector('#maintenanceLogForm').reset();
        renderMaintenanceTemplates(); // 重設複選框
        updateMaintenanceTotal(); // 重設總金額顯示
        prefillForm('maintenanceLog'); // 重新預填
        renderLogs('maintenanceLogPage');
    }
}


// ====================================================================
// 其他花費紀錄 (Expense Log) 邏輯
// ====================================================================

function addExpenseLog() {
    var date = safe('expenseLog-date').value;
    var time = safe('expenseLog-time').value;
    var mileage = safe('expenseLog-mileage').value;
    var item = safe('expenseLog-item').value;
    var category = safe('expenseLog-category').value;
    var cost = safe('expenseLog-cost').value;
    var note = safe('expenseLog-note').value;

    if (!item || !cost) {
        showToast('❌ 請填寫項目名稱和花費金額！', 'error');
        return;
    }
    
    var logEntry = {
        date: date,
        time: time,
        mileage: mileage,
        item: item,
        category: category,
        cost: parseFloat(cost).toFixed(2),
        note: note
    };

    if (addLogEntry('expenseLog', logEntry)) {
        showToast('✅ 其他花費紀錄新增成功！', 'success');
        document.querySelector('#expenseLogForm').reset();
        prefillForm('expenseLog'); // 重新預填
        renderLogs('expenseLogPage');
    }
}

// ====================================================================
// 設定頁面 (Settings) 邏輯
// ====================================================================

function renderSettings() {
    var settings = loadSettings();
    safe('settings-bikeModel').value = settings.bikeModel || '';
    safe('settings-gasUrl').value = settings.gasUrl || '';
    safe('settings-theme').value = settings.theme || 'light';
    safe('settings-station').value = settings.defaultStation || '';
    
    // 更新主題切換按鈕文字
    updateThemeButtonText(settings.theme || 'light');
    
    // 更新目前的主題狀態
    document.documentElement.setAttribute('data-theme', settings.theme || 'light');
}

function saveSettingsHandler() {
    var newSettings = {
        bikeModel: safe('settings-bikeModel').value,
        gasUrl: safe('settings-gasUrl').value,
        theme: safe('settings-theme').value,
        defaultStation: safe('settings-station').value
    };
    
    saveSettings(newSettings);
    
    // 即時更新主題
    document.documentElement.setAttribute('data-theme', newSettings.theme);
    updateThemeButtonText(newSettings.theme);
    
    showToast('💾 設定已儲存！', 'success');
    updateDashboard(); // 更新儀表板上的車型等資訊
}

function updateThemeButtonText(currentTheme) {
    var themeBtn = safe('themeToggleButton');
    if (themeBtn) {
        themeBtn.textContent = currentTheme === 'dark' ? '切換至 🌞 亮色模式' : '切換至 🌙 深色模式';
    }
}

function toggleTheme() {
    var settings = loadSettings();
    var newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    settings.theme = newTheme;
    saveSettings(settings);
    
    document.documentElement.setAttribute('data-theme', newTheme);
    updateThemeButtonText(newTheme);
    updateDashboard(); // 觸發儀表板更新
}

// 備份邏輯
function backupToGoogleSheets() {
    if (!navigator.onLine) {
        showToast('❌ 離線狀態無法同步', 'error');
        return;
    }

    var settings = loadSettings();
    if (!settings.gasUrl) {
        showToast('請先在設定頁面輸入 GAS API 網址', 'error');
        return;
    }

    showToast('☁️ 正在同步備份...', 'success');

    var payload = {
        action: 'backup',
        ChargeLog: loadLog('chargeLog'),
        MaintenanceLog: loadLog('maintenanceLog'),
        ExpenseLog: loadLog('expenseLog'),
        StatusLog: loadLog('statusLog')
    };
    
    // 檢查資料是否過大，但通常這不是問題
    // if (JSON.stringify(payload).length > 50 * 1024) { 
    //     showToast('⚠️ 資料量過大，可能同步失敗', 'warning');
    // }

    fetch(settings.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 為了避免 CORS 預檢，使用 text/plain
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            var now = new Date().toISOString();
            localStorage.setItem(BACKUP_KEY, now);
            updateDashboard(); // 更新同步時間
            showToast('✅ 備份成功！', 'success');
        } else {
            showToast('❌ 同步失敗: ' + data.message, 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('❌ 網路錯誤', 'error');
    });
}

// 從雲端還原邏輯
function restoreFromGoogleSheets() {
    if (!navigator.onLine) {
        showToast('❌ 離線狀態無法還原', 'error');
        return;
    }

    var settings = loadSettings();
    if (!settings.gasUrl) {
        showToast('請先在設定頁面輸入 GAS API 網址', 'error');
        return;
    }
    
    if (!confirm('⚠️ 警告：這將使用雲端資料「覆蓋」您目前手機上的所有資料！確定要執行嗎？')) return;

    showToast('☁️ 下載還原中...', 'success');
    
    fetch(settings.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'restore' })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success' && data.data) {
            var d = data.data;
            // 只覆蓋 Log 紀錄
            if(d.ChargeLog) localStorage.setItem('chargeLog', JSON.stringify(d.ChargeLog));
            if(d.MaintenanceLog) localStorage.setItem('maintenanceLog', JSON.stringify(d.MaintenanceLog));
            if(d.ExpenseLog) localStorage.setItem('expenseLog', JSON.stringify(d.ExpenseLog));
            if(d.StatusLog) localStorage.setItem('statusLog', JSON.stringify(d.StatusLog)); // 狀態 Log
            
            updateDashboard();
            showPage('dashboard');
            showToast('✅ 資料還原成功！', 'success');
        } else {
            showToast('❌ 還原失敗: ' + data.message, 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('❌ 網路錯誤', 'error');
    });
}


// ====================================================================
// 程式啟動
// ====================================================================

window.onload = function () {
    // 1. 初始化資料
    var settings = loadSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'light');
    
    // 2. 渲染保養模板
    renderMaintenanceTemplates();
    
    // 3. 初始顯示儀表板並更新數據
    showPage('dashboard');
    updateDashboard();

    // 4. 綁定事件監聽器
    // 頁面切換在 index.html 已經綁定
    
    // 綁定表單提交
    safe('chargeLogForm').addEventListener('submit', (e) => { e.preventDefault(); addChargeLog(); });
    safe('maintenanceLogForm').addEventListener('submit', (e) => { e.preventDefault(); addMaintenanceLog(); });
    safe('expenseLogForm').addEventListener('submit', (e) => { e.preventDefault(); addExpenseLog(); });
    
    // 綁定保養總額計算
    safe('maintenanceLog-baseCost').addEventListener('input', updateMaintenanceTotal);
    safe('maintenanceLog-otherCost').addEventListener('input', updateMaintenanceTotal);

    // 綁定設定儲存
    safe('saveSettingsButton').addEventListener('click', saveSettingsHandler);
    
    // 綁定備份/還原
    safe('backupButton').addEventListener('click', backupToGoogleSheets);
    safe('restoreButton').addEventListener('click', restoreFromGoogleSheets);
    
    // 綁定主題切換
    safe('themeToggleButton').addEventListener('click', toggleTheme);

    // 5. 設定定時更新儀表板 (例如每 30 秒，更新同步時間)
    setInterval(updateDashboard, 30000); 
    
    // 6. PWA 註冊
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker 註冊成功:', reg.scope))
            .catch(err => console.log('Service Worker 註冊失敗:', err));
    }
};
