/* motolog.js
   1. 顯示程式版本 (v15.2.1)。
   2. 離線偵測 (禁止同步)。
   3. 顯示最後更新時間 (例如：2小時前)。
   4. 新增重新計算電費功能 (recalculateChargeCost)。
   5. 修正編輯時日期/時間代入問題 (showEditExpenseModal, showEditServiceModal)。
*/

console.log('motolog.js (v15.2.1): loaded');

const APP_VERSION = 'v15.2.1';
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

// ====================================================================
// 工具函數
// ====================================================================

/**
 * 格式化日期時間
 * @param {string | number} timestamp 
 * @param {boolean} showTime 是否包含時間
 * @returns {string} 格式化後的字串
 */
function formatDateTime(timestamp, showTime = true) {
    if (!timestamp) return '-';
    // 檢查 timestamp 是否為毫秒
    if (String(timestamp).length === 10) {
        timestamp *= 1000;
    }
    const date = new Date(timestamp);
    const datePart = date.getFullYear() + '/' + 
                     String(date.getMonth() + 1).padStart(2, '0') + '/' + 
                     String(date.getDate()).padStart(2, '0');
    if (!showTime) return datePart;
    
    const timePart = String(date.getHours()).padStart(2, '0') + ':' + 
                     String(date.getMinutes()).padStart(2, '0');
    return datePart + ' ' + timePart;
}

/**
 * 格式化時間戳為 YYYY-MM-DD
 * @param {number} timestamp 
 * @returns {string} YYYY-MM-DD
 */
function formatDateForInput(timestamp) {
    const date = new Date(timestamp);
    return date.getFullYear() + '-' + 
           String(date.getMonth() + 1).padStart(2, '0') + '-' + 
           String(date.getDate()).padStart(2, '0');
}

/**
 * 格式化時間戳為 HH:MM
 * @param {number} timestamp 
 * @returns {string} HH:MM
 */
function formatTimeForInput(timestamp) {
    const date = new Date(timestamp);
    return String(date.getHours()).padStart(2, '0') + ':' + 
           String(date.getMinutes()).padStart(2, '0');
}

/**
 * 顯示 Toast 提示
 * @param {string} message 提示訊息
 * @param {'success' | 'error'} type 訊息類型
 */
function showToast(message, type = 'success') {
    var toast = safe('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'toast show toast-' + type;
        
        // 清除任何舊的計時器
        clearTimeout(toast.timer);
        
        // 設定新的計時器，3秒後隱藏
        toast.timer = setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }
}

// ====================================================================
// 資料存取與初始化
// ====================================================================

/**
 * 載入資料 (JSON)
 * @param {string} key 儲存鍵
 * @returns {Array<Object>} 資料陣列
 */
function loadData(key) {
    var json = localStorage.getItem(key);
    try {
        return json ? JSON.parse(json) : [];
    } catch (e) {
        console.error('解析 ' + key + ' 失敗:', e);
        return [];
    }
}

/**
 * 儲存資料 (JSON)
 * @param {string} key 儲存鍵
 * @param {Array<Object>} data 資料陣列
 */
function saveData(key, data) {
    // 確保資料是依照時間戳降冪排列 (最新在最前面)
    if (key !== SETTINGS_KEY) {
        data.sort((a, b) => b.timestamp - a.timestamp);
    }
    localStorage.setItem(key, JSON.stringify(data));
    updateDashboard(); // 每次存檔後更新儀表板
    updateLastUpdatedTime(); // 更新最後更新時間
    
    // 如果是紀錄類的資料更新，則觸發同步
    if (key !== SETTINGS_KEY) {
        triggerSyncIfOnline();
    }
}

/**
 * 載入設定
 * @returns {Object} 設定物件
 */
function loadSettings() {
    var defaults = {
        initialMileage: 0,
        serviceIntervalKm: REGULAR_SERVICE_KM,
        serviceIntervalDays: REGULAR_SERVICE_DAYS,
        serviceTemplates: JSON.stringify(MAINT_TEMPLATES, null, 2),
        gasUrl: '',
        pricePerKWh: 3.5
    };
    var settings = loadData(SETTINGS_KEY);
    return Object.assign(defaults, settings);
}

/**
 * 初始化應用程式
 */
window.onload = function() {
    initApp();
    // 註冊事件監聽
    safe('chargeForm')?.addEventListener('submit', handleChargeSubmit);
    safe('serviceForm')?.addEventListener('submit', handleServiceSubmit);
    safe('expenseForm')?.addEventListener('submit', handleExpenseSubmit);
    safe('settingsForm')?.addEventListener('submit', handleSettingsSubmit);
    
    // 編輯表單事件
    safe('editChargeForm')?.addEventListener('submit', handleEditChargeSubmit);
    safe('editServiceForm')?.addEventListener('submit', handleEditServiceSubmit);
    safe('editExpenseForm')?.addEventListener('submit', handleEditExpenseSubmit);

    // 導覽列切換
    document.querySelectorAll('.tab').forEach(button => {
        button.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    
    // Modal 關閉按鈕
    safe('closeExpenseModal')?.addEventListener('click', () => safe('editExpenseModal').style.display = 'none');
    safe('closeServiceModal')?.addEventListener('click', () => safe('editServiceModal').style.display = 'none');
    safe('closeChargeModal')?.addEventListener('click', () => safe('editChargeModal').style.display = 'none');
    safe('closeExportImportModal')?.addEventListener('click', () => safe('exportImportModal').style.display = 'none');
    safe('closeResetModal')?.addEventListener('click', () => safe('resetModal').style.display = 'none');
    safe('closeTutorialModal')?.addEventListener('click', () => safe('tutorialModal').style.display = 'none');
    
    // 檢查離線狀態
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // 初始化月份篩選器
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    safe('logMonthFilter').value = currentMonth;
    
    // 初始渲染
    renderLogs();
    updateDashboard();
    
    // 填寫預設保養項目到表單
    populateServiceTemplates();
    
    safe('appVersion').textContent = APP_VERSION;
    
    // 每分鐘更新一次儀表板（例如：上次充電天數）
    setInterval(updateDashboard, 60000); 
    // 每5分鐘更新一次備份狀態
    setInterval(updateLastUpdatedTime, 300000); 
};

function initApp() {
    // 載入設定到設定頁面
    var settings = loadSettings();
    safe('initialMileage').value = settings.initialMileage;
    safe('serviceIntervalKm').value = settings.serviceIntervalKm;
    safe('serviceIntervalDays').value = settings.serviceIntervalDays;
    safe('serviceTemplates').value = settings.serviceTemplates;
    safe('gasUrl').value = settings.gasUrl;
    safe('pricePerKWh').value = settings.pricePerKWh;
}

/**
 * 載入預設保養項目到保養頁面的 Select 中
 */
function populateServiceTemplates() {
    var settings = loadSettings();
    var templates;
    try {
        templates = JSON.parse(settings.serviceTemplates);
    } catch(e) {
        showToast('⚠️ 保養項目 JSON 格式錯誤！', 'error');
        templates = MAINT_TEMPLATES; // 使用預設值
    }
    
    var serviceSelect = safe('serviceName');
    var editServiceSelect = safe('editServiceName');
    
    // 清除舊選項，並保留第一個預設選項
    serviceSelect.innerHTML = '<option value="">請選擇項目</option>';
    editServiceSelect.innerHTML = '<option value="">請選擇項目</option>';
    
    templates.forEach(template => {
        var option = document.createElement('option');
        option.value = template.name;
        option.textContent = template.name;
        option.dataset.cost = template.cost; // 儲存預設費用
        
        var option2 = option.cloneNode(true);
        
        serviceSelect.appendChild(option);
        editServiceSelect.appendChild(option2);
    });
}

/**
 * 當選擇保養項目時，自動填入預設費用
 */
function updateServiceCost() {
    var select = safe('serviceName');
    var costInput = safe('serviceCost');
    if (select && costInput) {
        var selectedOption = select.options[select.selectedIndex];
        if (selectedOption && selectedOption.dataset.cost) {
            costInput.value = parseFloat(selectedOption.dataset.cost);
        } else {
            // 如果選了 "請選擇項目" 或其他無預設費用的，則清空
            costInput.value = ''; 
        }
    }
}


// ====================================================================
// 儀表板與計算邏輯
// ====================================================================

/**
 * 更新儀表板數據
 */
function updateDashboard() {
    const settings = loadSettings();
    const chargeLog = loadData('chargeLog');
    const serviceLog = loadData('maintenanceLog');
    const expenseLog = loadData('expenseLog');
    
    // 1. 總里程
    const allLogs = [].concat(chargeLog, serviceLog);
    const lastMileage = allLogs.length > 0 ? allLogs[0].mileage : settings.initialMileage;
    safe('totalMileage').textContent = lastMileage.toLocaleString();
    
    // 2. 上次充電
    if (chargeLog.length > 0) {
        const lastCharge = chargeLog[0];
        const days = Math.floor((Date.now() - lastCharge.timestamp) / (1000 * 60 * 60 * 24));
        safe('lastChargeDays').textContent = days + ' 天前';
        safe('lastChargeDate').textContent = formatDateTime(lastCharge.timestamp, false);
    } else {
        safe('lastChargeDays').textContent = '-';
        safe('lastChargeDate').textContent = '無記錄';
    }
    
    // 3. 總花費
    const totalExpense = chargeLog.reduce((sum, log) => sum + parseFloat(log.cost || 0), 0) +
                         serviceLog.reduce((sum, log) => sum + parseFloat(log.cost || 0), 0) +
                         expenseLog.reduce((sum, log) => sum + parseFloat(log.cost || 0), 0);
    safe('totalExpense').textContent = Math.round(totalExpense).toLocaleString();
    
    // 4. 下次保養
    const lastServiceLog = serviceLog.length > 0 ? serviceLog[0] : null;
    let nextServiceKm;
    let nextServiceDate;
    
    if (lastServiceLog) {
        const lastServiceMileage = lastServiceLog.mileage;
        const lastServiceTime = lastServiceLog.timestamp;
        
        // 里程計算
        nextServiceKm = lastServiceMileage + parseInt(settings.serviceIntervalKm);
        const kmLeft = nextServiceKm - lastMileage;
        
        // 天數計算
        const nextServiceTime = new Date(lastServiceTime);
        nextServiceTime.setDate(nextServiceTime.getDate() + parseInt(settings.serviceIntervalDays));
        
        const daysLeft = Math.ceil((nextServiceTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        // 判斷保養狀態
        if (kmLeft <= 0) {
            safe('nextServiceStatus').textContent = '⚠️ 超期';
            safe('nextServiceStatus').className = 'value status-danger';
        } else if (kmLeft <= 500) {
            safe('nextServiceStatus').textContent = '⚠️ 接近';
            safe('nextServiceStatus').className = 'value status-warning';
        } else {
            safe('nextServiceStatus').textContent = '正常';
            safe('nextServiceStatus').className = 'value status-success';
        }
        
        // 顯示最接近的保養時間/里程
        if (kmLeft <= daysLeft * (lastMileage/365/1000) * settings.serviceIntervalDays) { // 粗略判斷里程與天數哪一個先到
            safe('nextServiceDate').textContent = `里程: ${nextServiceKm.toLocaleString()} 公里`;
        } else {
            safe('nextServiceDate').textContent = `日期: ${formatDateTime(nextServiceTime.getTime(), false)}`;
        }

    } else {
        safe('nextServiceStatus').textContent = '待記錄';
        safe('nextServiceStatus').className = 'value';
        safe('nextServiceDate').textContent = `起始里程: ${settings.initialMileage.toLocaleString()} 公里`;
    }
}

// ====================================================================
// 重新計算電費功能 (需求 1)
// ====================================================================

function recalculateChargeCost() {
    const settings = loadSettings();
    const pricePerKWh = parseFloat(settings.pricePerKWh);
    if (isNaN(pricePerKWh) || pricePerKWh <= 0) {
        showToast('請先在設定頁面設定有效的「電費單價」', 'error');
        return;
    }

    const filterMonth = safe('logMonthFilter').value;
    if (!filterMonth) {
         showToast('請先選擇一個篩選月份', 'error');
        return;
    }
    
    if (!confirm(`⚠️ 警告：這將使用電費單價 ${pricePerKWh} 元/度，重新計算篩選月份 ${filterMonth} 中「家裡」和「公司」的所有充電費用。確定要執行嗎？`)) return;

    let chargeLog = loadData('chargeLog');
    let logsUpdated = 0;
    
    // 獲取該月份的起始時間戳
    const [year, month] = filterMonth.split('-');
    const startTimestamp = new Date(year, parseInt(month) - 1, 1).getTime();
    const endTimestamp = new Date(year, parseInt(month), 0, 23, 59, 59).getTime(); // 該月最後一天

    chargeLog = chargeLog.map(log => {
        // 檢查是否在篩選月份內
        if (log.timestamp >= startTimestamp && log.timestamp <= endTimestamp) {
            // 檢查地點是否為「家裡」或「公司」
            if (log.station === '家裡' || log.station === '公司') {
                const newCost = Math.round(parseFloat(log.kwh) * pricePerKWh);
                // 只有費用不同時才更新
                if (parseFloat(log.cost) !== newCost) {
                    log.cost = newCost;
                    logsUpdated++;
                }
            }
        }
        return log;
    });

    if (logsUpdated > 0) {
        saveData('chargeLog', chargeLog);
        renderLogs();
        showToast(`✅ 成功更新 ${logsUpdated} 筆充電紀錄費用！`, 'success');
    } else {
        showToast('ℹ️ 在篩選月份中，沒有需要更新費用的「家裡」或「公司」充電紀錄', 'warning');
    }
}


// ====================================================================
// Log 渲染與操作 (包含編輯修正)
// ====================================================================

/**
 * 渲染所有紀錄列表
 */
function renderLogs() {
    const filterMonth = safe('logMonthFilter').value;
    
    // 篩選月份的起始時間戳 (YYYY-MM-01)
    let startTimestamp = 0;
    let endTimestamp = Infinity;
    
    if (filterMonth) {
        const [year, month] = filterMonth.split('-');
        startTimestamp = new Date(year, parseInt(month) - 1, 1).getTime();
        endTimestamp = new Date(year, parseInt(month), 0, 23, 59, 59).getTime(); // 該月最後一天
    }
    
    const filterData = (data) => data.filter(log => log.timestamp >= startTimestamp && log.timestamp <= endTimestamp);
    
    const filteredCharge = filterData(loadData('chargeLog'));
    const filteredService = filterData(loadData('maintenanceLog'));
    const filteredExpense = filterData(loadData('expenseLog'));
    
    // 計算總計
    const totalChargeCost = filteredCharge.reduce((sum, log) => sum + parseFloat(log.cost || 0), 0);
    const totalChargeKWh = filteredCharge.reduce((sum, log) => sum + parseFloat(log.kwh || 0), 0);
    const totalServiceCost = filteredService.reduce((sum, log) => sum + parseFloat(log.cost || 0), 0);
    const totalExpenseCost = filteredExpense.reduce((sum, log) => sum + parseFloat(log.cost || 0), 0);
    
    // 渲染充電紀錄
    const chargeList = safe('chargeLogList');
    chargeList.innerHTML = `
        <div class="log-summary">
            <strong>總計:</strong> 
            <span>${Math.round(totalChargeKWh).toLocaleString()} kWh</span> | 
            <span>${Math.round(totalChargeCost).toLocaleString()} 元</span>
        </div>
    ` + filteredCharge.map(log => `
        <div class="log-item">
            <div class="log-main">
                <span class="log-title">${formatDateTime(log.timestamp)}</span>
                <span class="log-subtitle">里程: ${log.mileage.toLocaleString()} km</span>
            </div>
            <div class="log-details">
                <span class="log-value">${log.kwh} kWh | ${log.cost.toLocaleString()} 元</span>
                <span class="log-subtitle">${log.station} ${log.notes ? `(${log.notes})` : ''}</span>
            </div>
            <div class="log-actions">
                <button class="btn btn-icon btn-edit" onclick="showEditChargeModal('${log.id}')"><i class="icon-edit"></i></button>
                <button class="btn btn-icon btn-delete" onclick="deleteLog('chargeLog', '${log.id}')"><i class="icon-trash"></i></button>
            </div>
        </div>
    `).join('');
    
    // 渲染保養紀錄
    const serviceList = safe('maintenanceLogList');
    serviceList.innerHTML = `
        <div class="log-summary">
            <strong>總計:</strong> 
            <span>${Math.round(totalServiceCost).toLocaleString()} 元</span>
        </div>
    ` + filteredService.map(log => `
        <div class="log-item">
            <div class="log-main">
                <span class="log-title">${formatDateTime(log.timestamp)}</span>
                <span class="log-subtitle">里程: ${log.mileage.toLocaleString()} km</span>
            </div>
            <div class="log-details">
                <span class="log-value">${log.name} | ${log.cost.toLocaleString()} 元</span>
                <span class="log-subtitle">${log.notes ? log.notes : ''}</span>
            </div>
            <div class="log-actions">
                <button class="btn btn-icon btn-edit" onclick="showEditServiceModal('${log.id}')"><i class="icon-edit"></i></button>
                <button class="btn btn-icon btn-delete" onclick="deleteLog('maintenanceLog', '${log.id}')"><i class="icon-trash"></i></button>
            </div>
        </div>
    `).join('');
    
    // 渲染花費紀錄
    const expenseList = safe('expenseLogList');
    expenseList.innerHTML = `
        <div class="log-summary">
            <strong>總計:</strong> 
            <span>${Math.round(totalExpenseCost).toLocaleString()} 元</span>
        </div>
    ` + filteredExpense.map(log => `
        <div class="log-item">
            <div class="log-main">
                <span class="log-title">${formatDateTime(log.timestamp)}</span>
                <span class="log-subtitle">${log.name}</span>
            </div>
            <div class="log-details">
                <span class="log-value">${log.cost.toLocaleString()} 元</span>
                <span class="log-subtitle">${log.notes ? log.notes : ''}</span>
            </div>
            <div class="log-actions">
                <button class="btn btn-icon btn-edit" onclick="showEditExpenseModal('${log.id}')"><i class="icon-edit"></i></button>
                <button class="btn btn-icon btn-delete" onclick="deleteLog('expenseLog', '${log.id}')"><i class="icon-trash"></i></button>
            </div>
        </div>
    `).join('');

    // 更新保養與花費頁面中的歷史紀錄
    safe('serviceHistoryList').innerHTML = filteredService.slice(0, 5).map(log => `
        <div class="log-item log-item-small">
            <div class="log-main">
                <span class="log-title">${log.name}</span>
                <span class="log-subtitle">${formatDateTime(log.timestamp, false)} (${log.mileage.toLocaleString()} km)</span>
            </div>
            <div class="log-details">
                <span class="log-value">${log.cost.toLocaleString()} 元</span>
            </div>
        </div>
    `).join('');
    
    safe('expenseHistoryList').innerHTML = filteredExpense.slice(0, 5).map(log => `
        <div class="log-item log-item-small">
            <div class="log-main">
                <span class="log-title">${log.name}</span>
                <span class="log-subtitle">${formatDateTime(log.timestamp, false)}</span>
            </div>
            <div class="log-details">
                <span class="log-value">${log.cost.toLocaleString()} 元</span>
            </div>
        </div>
    `).join('');
}


/**
 * 刪除紀錄
 * @param {string} key 資料鍵名
 * @param {string} id 紀錄 ID
 */
function deleteLog(key, id) {
    if (confirm('確定要刪除這筆紀錄嗎？')) {
        let data = loadData(key);
        data = data.filter(log => log.id !== id);
        saveData(key, data);
        renderLogs();
        showToast('✅ 紀錄已刪除', 'success');
    }
}


/**
 * 顯示編輯花費 Modal (修正日期/時間代入)
 * @param {string} id 紀錄 ID
 */
function showEditExpenseModal(id) {
    const log = loadData('expenseLog').find(l => l.id === id);
    if (!log) return;
    
    safe('editExpenseId').value = log.id;
    safe('editExpenseName').value = log.name;
    safe('editExpenseCost').value = log.cost;
    safe('editExpenseNotes').value = log.notes || '';

    // 修正點：將時間戳轉換為 YYYY-MM-DD 和 HH:MM 格式
    safe('editExpenseDate').value = formatDateForInput(log.timestamp);
    safe('editExpenseTime').value = formatTimeForInput(log.timestamp);

    safe('editExpenseModal').style.display = 'block';
}

/**
 * 顯示編輯保養 Modal (修正日期/時間代入)
 * @param {string} id 紀錄 ID
 */
function showEditServiceModal(id) {
    const log = loadData('maintenanceLog').find(l => l.id === id);
    if (!log) return;
    
    // 預先填入保養項目選項 (如果還沒有的話，通常在 initApp 已經處理)
    populateServiceTemplates();

    safe('editServiceId').value = log.id;
    safe('editServiceMileage').value = log.mileage;
    safe('editServiceName').value = log.name;
    safe('editServiceCost').value = log.cost;
    safe('editServiceNotes').value = log.notes || '';

    // 修正點：將時間戳轉換為 YYYY-MM-DD 和 HH:MM 格式
    safe('editServiceDate').value = formatDateForInput(log.timestamp);
    safe('editServiceTime').value = formatTimeForInput(log.timestamp);

    safe('editServiceModal').style.display = 'block';
}

/**
 * 顯示編輯充電 Modal
 * @param {string} id 紀錄 ID
 */
function showEditChargeModal(id) {
    const log = loadData('chargeLog').find(l => l.id === id);
    if (!log) return;
    
    safe('editChargeId').value = log.id;
    safe('editChargeMileage').value = log.mileage;
    safe('editChargeKWh').value = log.kwh;
    safe('editChargeCost').value = log.cost;
    safe('editChargeStation').value = log.station;
    safe('editChargeNotes').value = log.notes || '';

    // 將時間戳轉換為 YYYY-MM-DD 和 HH:MM 格式
    safe('editChargeDate').value = formatDateForInput(log.timestamp);
    safe('editChargeTime').value = formatTimeForInput(log.timestamp);

    safe('editChargeModal').style.display = 'block';
}

// ====================================================================
// 表單提交處理
// ====================================================================

/**
 * 處理充電表單提交
 */
function handleChargeSubmit(e) {
    e.preventDefault();
    const mileage = parseInt(safe('chargeMileage').value);
    const kwh = parseFloat(safe('chargeKWh').value);
    const cost = parseFloat(safe('chargeCost').value);
    const station = safe('chargeStation').value;
    const notes = safe('chargeNotes').value;
    
    if (isNaN(mileage) || isNaN(kwh) || isNaN(cost) || mileage < 0 || kwh <= 0 || cost < 0) {
        showToast('請輸入有效的數字', 'error');
        return;
    }

    let data = loadData('chargeLog');
    const newLog = {
        id: Date.now().toString(), // 使用時間戳作為唯一 ID
        timestamp: Date.now(),
        mileage: mileage,
        kwh: kwh,
        cost: cost,
        station: station,
        notes: notes
    };
    data.unshift(newLog);
    saveData('chargeLog', data);
    
    e.target.reset();
    showToast('✅ 充電紀錄已儲存', 'success');
    
    // 切換到紀錄頁面並渲染
    switchTab('tab-log');
    // 自動填入上次充電里程
    safe('chargeMileage').value = mileage;
}

/**
 * 處理保養表單提交
 */
function handleServiceSubmit(e) {
    e.preventDefault();
    const mileage = parseInt(safe('serviceMileage').value);
    const name = safe('serviceName').value;
    const cost = parseFloat(safe('serviceCost').value);
    const notes = safe('serviceNotes').value;
    
    if (isNaN(mileage) || isNaN(cost) || mileage < 0 || cost < 0 || !name) {
        showToast('請輸入有效的里程、費用並選擇項目', 'error');
        return;
    }

    let data = loadData('maintenanceLog');
    const newLog = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        mileage: mileage,
        name: name,
        cost: cost,
        notes: notes
    };
    data.unshift(newLog);
    saveData('maintenanceLog', data);
    
    e.target.reset();
    safe('serviceName').value = '';
    showToast('✅ 保養紀錄已儲存', 'success');
    
    // 切換到紀錄頁面並渲染
    switchTab('tab-log');
}

/**
 * 處理花費表單提交
 */
function handleExpenseSubmit(e) {
    e.preventDefault();
    const name = safe('expenseName').value;
    const cost = parseFloat(safe('expenseCost').value);
    const dateStr = safe('expenseDate').value;
    const timeStr = safe('expenseTime').value;
    const notes = safe('expenseNotes').value;
    
    if (isNaN(cost) || cost < 0 || !name || !dateStr || !timeStr) {
        showToast('請輸入有效的費用、項目、日期和時間', 'error');
        return;
    }
    
    // 將日期和時間組合為一個時間戳
    const dateTimeStr = `${dateStr}T${timeStr}:00`; // 假設為當地時間
    const timestamp = new Date(dateTimeStr).getTime();

    let data = loadData('expenseLog');
    const newLog = {
        id: Date.now().toString(),
        timestamp: timestamp,
        name: name,
        cost: cost,
        notes: notes
    };
    data.unshift(newLog);
    saveData('expenseLog', data);
    
    e.target.reset();
    showToast('✅ 花費紀錄已儲存', 'success');
    
    // 切換到紀錄頁面並渲染
    switchTab('tab-log');
}

/**
 * 處理設定表單提交
 */
function handleSettingsSubmit(e) {
    e.preventDefault();
    
    // 驗證 JSON 格式
    try {
        JSON.parse(safe('serviceTemplates').value);
    } catch(err) {
        showToast('⚠️ 保養項目 JSON 格式無效！', 'error');
        return;
    }

    const newSettings = {
        initialMileage: parseInt(safe('initialMileage').value) || 0,
        serviceIntervalKm: parseInt(safe('serviceIntervalKm').value) || REGULAR_SERVICE_KM,
        serviceIntervalDays: parseInt(safe('serviceIntervalDays').value) || REGULAR_SERVICE_DAYS,
        serviceTemplates: safe('serviceTemplates').value,
        gasUrl: safe('gasUrl').value.trim(),
        pricePerKWh: parseFloat(safe('pricePerKWh').value) || 3.5
    };
    
    // 驗證里程與天數不能為負或零
    if (newSettings.serviceIntervalKm <= 0 || newSettings.serviceIntervalDays <= 0) {
        showToast('保養間隔里程和天數必須大於 0', 'error');
        return;
    }
    
    saveData(SETTINGS_KEY, newSettings);
    
    // 重新載入保養項目下拉選單
    populateServiceTemplates();
    
    showToast('✅ 設定已儲存', 'success');
    updateDashboard();
}


/**
 * 處理編輯充電表單提交
 */
function handleEditChargeSubmit(e) {
    e.preventDefault();
    
    const id = safe('editChargeId').value;
    const mileage = parseInt(safe('editChargeMileage').value);
    const kwh = parseFloat(safe('editChargeKWh').value);
    const cost = parseFloat(safe('editChargeCost').value);
    const station = safe('editChargeStation').value;
    const notes = safe('editChargeNotes').value;
    const dateStr = safe('editChargeDate').value;
    const timeStr = safe('editChargeTime').value;

    if (isNaN(mileage) || isNaN(kwh) || isNaN(cost)) {
        showToast('請輸入有效的數字', 'error');
        return;
    }
    
    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    const timestamp = new Date(dateTimeStr).getTime();

    let data = loadData('chargeLog');
    const index = data.findIndex(l => l.id === id);
    
    if (index !== -1) {
        data[index] = {
            id: id,
            timestamp: timestamp, // 使用編輯後的時間戳
            mileage: mileage,
            kwh: kwh,
            cost: cost,
            station: station,
            notes: notes
        };
        saveData('chargeLog', data);
        renderLogs();
        safe('editChargeModal').style.display = 'none';
        showToast('✅ 充電紀錄已更新', 'success');
    }
}

/**
 * 處理編輯保養表單提交
 */
function handleEditServiceSubmit(e) {
    e.preventDefault();
    
    const id = safe('editServiceId').value;
    const mileage = parseInt(safe('editServiceMileage').value);
    const name = safe('editServiceName').value;
    const cost = parseFloat(safe('editServiceCost').value);
    const notes = safe('editServiceNotes').value;
    const dateStr = safe('editServiceDate').value;
    const timeStr = safe('editServiceTime').value;

    if (isNaN(mileage) || isNaN(cost) || !name) {
        showToast('請輸入有效的里程、費用並選擇項目', 'error');
        return;
    }
    
    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    const timestamp = new Date(dateTimeStr).getTime();

    let data = loadData('maintenanceLog');
    const index = data.findIndex(l => l.id === id);
    
    if (index !== -1) {
        data[index] = {
            id: id,
            timestamp: timestamp, // 使用編輯後的時間戳
            mileage: mileage,
            name: name,
            cost: cost,
            notes: notes
        };
        saveData('maintenanceLog', data);
        renderLogs();
        safe('editServiceModal').style.display = 'none';
        showToast('✅ 保養紀錄已更新', 'success');
    }
}

/**
 * 處理編輯花費表單提交
 */
function handleEditExpenseSubmit(e) {
    e.preventDefault();
    
    const id = safe('editExpenseId').value;
    const name = safe('editExpenseName').value;
    const cost = parseFloat(safe('editExpenseCost').value);
    const notes = safe('editExpenseNotes').value;
    const dateStr = safe('editExpenseDate').value;
    const timeStr = safe('editExpenseTime').value;
    
    if (isNaN(cost) || !name) {
        showToast('請輸入有效的費用和項目', 'error');
        return;
    }
    
    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    const timestamp = new Date(dateTimeStr).getTime();

    let data = loadData('expenseLog');
    const index = data.findIndex(l => l.id === id);
    
    if (index !== -1) {
        data[index] = {
            id: id,
            timestamp: timestamp, // 使用編輯後的時間戳
            name: name,
            cost: cost,
            notes: notes
        };
        saveData('expenseLog', data);
        renderLogs();
        safe('editExpenseModal').style.display = 'none';
        showToast('✅ 花費紀錄已更新', 'success');
    }
}


// ====================================================================
// 頁面切換與輔助功能
// ====================================================================

/**
 * 切換頁面
 * @param {string} tabId 頁面 ID (e.g., 'tab-charge')
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(button => {
        button.classList.remove('active');
    });
    
    safe(tabId)?.classList.add('active');
    document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
    
    // 如果切換到紀錄頁面，重新渲染 log
    if (tabId === 'tab-log') {
        renderLogs();
    }
    // 如果切換到充電頁面，自動填寫上次里程
    if (tabId === 'tab-charge') {
        const chargeLog = loadData('chargeLog');
        if (chargeLog.length > 0) {
            safe('chargeMileage').value = chargeLog[0].mileage;
        } else {
            const settings = loadSettings();
            safe('chargeMileage').value = settings.initialMileage;
        }
    }
    // 如果切換到設定頁面，重新載入設定
    if (tabId === 'tab-settings') {
        initApp();
    }
}

/**
 * 顯示 GAS 教學 Modal
 */
function showTutorialModal(e) {
    e.preventDefault();
    safe('tutorialModal').style.display = 'block';
}

/**
 * 更新離線狀態提示
 */
function updateOnlineStatus() {
    const statusText = safe('onlineStatus');
    const topAlert = safe('topAlert');
    if (navigator.onLine) {
        statusText.textContent = '線上狀態';
        topAlert.style.display = 'none';
    } else {
        statusText.textContent = '⛔ 離線狀態';
        topAlert.textContent = '⛔ 離線中，雲端同步功能已禁用。';
        topAlert.className = 'top-alert top-alert-warning show';
    }
}

/**
 * 更新最後更新時間 (同步狀態)
 */
function updateLastUpdatedTime() {
    const lastBackup = localStorage.getItem(BACKUP_KEY);
    const syncStatus = safe('syncStatus');
    
    if (lastBackup) {
        const lastTime = parseInt(lastBackup);
        const diff = Date.now() - lastTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeAgo;
        if (hours > 24) {
            timeAgo = formatDateTime(lastTime);
        } else if (hours > 0) {
            timeAgo = `${hours} 小時前`;
        } else if (minutes > 0) {
            timeAgo = `${minutes} 分鐘前`;
        } else {
            timeAgo = '剛剛';
        }
        
        safe('lastUpdated').textContent = timeAgo;
        syncStatus.innerHTML = `同步狀態：<span class="text-success">已同步</span> (上次: ${formatDateTime(lastTime)})`;
    } else {
        safe('lastUpdated').textContent = '無記錄';
        syncStatus.innerHTML = `同步狀態：<span class="text-warning">未同步</span>`;
    }
}

/**
 * 匯出資料 Modal 處理
 */
function showExportDataModal() {
    const data = {
        settings: loadData(SETTINGS_KEY),
        chargeLog: loadData('chargeLog'),
        maintenanceLog: loadData('maintenanceLog'),
        expenseLog: loadData('expenseLog')
    };
    safe('exportData').value = JSON.stringify(data, null, 2);
    safe('importData').value = ''; // 清空匯入區
    safe('exportImportModal').style.display = 'block';
}

/**
 * 複製匯出資料到剪貼簿
 */
function copyExportData() {
    const data = safe('exportData').value;
    if (data) {
        // 使用 document.execCommand('copy') 確保在 iFrame 中可用
        const textarea = safe('exportData');
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('✅ 資料已複製到剪貼簿', 'success');
        } catch (err) {
            showToast('❌ 無法複製，請手動複製', 'error');
        }
    }
}

/**
 * 匯入資料 (覆蓋)
 */
function importData() {
    const jsonString = safe('importData').value.trim();
    if (!jsonString) {
        showToast('請貼上 JSON 資料', 'error');
        return;
    }
    
    if (!confirm('⚠️ 警告：匯入資料將「覆蓋」您目前手機上的所有資料！確定要執行嗎？')) return;

    try {
        const data = JSON.parse(jsonString);
        let count = 0;
        
        if (data.settings) { saveData(SETTINGS_KEY, data.settings); count++; }
        if (data.chargeLog) { saveData('chargeLog', data.chargeLog); count++; }
        if (data.maintenanceLog) { saveData('maintenanceLog', data.maintenanceLog); count++; }
        if (data.expenseLog) { saveData('expenseLog', data.expenseLog); count++; }
        
        if (count > 0) {
            safe('exportImportModal').style.display = 'none';
            initApp();
            renderLogs();
            updateDashboard();
            populateServiceTemplates();
            showToast(`✅ 成功匯入 ${count} 組資料！`, 'success');
        } else {
            showToast('⚠️ 匯入的 JSON 結構無效或缺少資料', 'warning');
        }
    } catch (e) {
        console.error(e);
        showToast('❌ JSON 格式錯誤，無法匯入', 'error');
    }
}

/**
 * 顯示清除資料 Modal
 */
function showResetModal() {
    safe('resetModal').style.display = 'block';
}

/**
 * 清除所有資料
 */
function resetAllData() {
    localStorage.clear();
    safe('resetModal').style.display = 'none';
    initApp();
    renderLogs();
    updateDashboard();
    populateServiceTemplates();
    showToast('🔥 所有資料已清除', 'success');
}


// ====================================================================
// 雲端同步邏輯 (Google Apps Script)
// ====================================================================

/**
 * 觸發同步，如果網路連線且 API 網址已設定
 */
function triggerSyncIfOnline() {
    const settings = loadSettings();
    if (navigator.onLine && settings.gasUrl) {
        // 設定一個短暫延遲，避免多次快速寫入觸發多次同步
        if (chargeTimer) clearTimeout(chargeTimer);
        chargeTimer = setTimeout(syncToGoogleSheets, 5000); // 延遲 5 秒
    }
}

/**
 * 同步資料到 Google Sheets
 */
function syncToGoogleSheets() {
    if (!navigator.onLine) {
        showToast('❌ 離線狀態無法同步', 'error');
        return;
    }

    var settings = loadSettings();
    if (!settings.gasUrl) {
        safe('syncStatus').innerHTML = `<span class="text-danger">同步失敗：請在設定頁面輸入 GAS API 網址</span>`;
        showToast('請先在設定頁面輸入 GAS API 網址', 'error');
        return;
    }

    showToast('☁️ 資料同步中...', 'success');
    
    const payload = {
        action: 'sync',
        ChargeLog: loadData('chargeLog'),
        MaintenanceLog: loadData('maintenanceLog'),
        ExpenseLog: loadData('expenseLog')
        // StatusLog (目前沒有 StatusLog 資料，可選)
    };
    
    fetch(settings.gasUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            localStorage.setItem(BACKUP_KEY, Date.now().toString());
            updateLastUpdatedTime();
            showToast('✅ 雲端同步成功！', 'success');
        } else {
            safe('syncStatus').innerHTML = `<span class="text-danger">同步失敗：${data.message}</span>`;
            showToast('❌ 雲端同步失敗: ' + data.message, 'error');
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
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'restore' })
    })
    .then(res => {
         if (!res.ok) {
            throw new Error(`HTTP 錯誤: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        if(data.status === 'success' && data.data) {
            var d = data.data;
            let count = 0;
            if(d.ChargeLog) { localStorage.setItem('chargeLog', JSON.stringify(d.ChargeLog)); count++; }
            if(d.MaintenanceLog) { localStorage.setItem('maintenanceLog', JSON.stringify(d.MaintenanceLog)); count++; }
            if(d.ExpenseLog) { localStorage.setItem('expenseLog', JSON.stringify(d.ExpenseLog)); count++; }
            // StatusLog 不在還原範圍，因為狀態通常是計算出來的
            
            // 由於設定檔不在還原範圍內，這裡不需要處理 settings
            
            initApp();
            renderLogs();
            updateDashboard();
            showToast(`✅ 雲端還原成功！已還原 ${count} 組紀錄`, 'success');

        } else if (data.status === 'error') {
            showToast('❌ 雲端還原失敗: ' + data.message, 'error');
        } else {
            showToast('❌ 雲端還原失敗: 回應格式錯誤', 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('❌ 網路或伺服器錯誤: ' + err.message, 'error');
    });
}
