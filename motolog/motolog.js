/* 將原始 motorcycle_log.html 內 <script> 的內容整段搬到這個檔案
   建議放到 repo 的 js/motorcycle_log.js，並在 HTML 以 <script src="js/motorcycle_log.js" defer></script> 引入 */

 // === MODIFICATION 2, 3, 4: Add constants ===
const SETTINGS_KEY = 'motorcycleSettings';
const BACKUP_KEY = 'lastBackupDate';
const maintTemplates = [
    { name: '齒輪油', cost: 150 },
    { name: '前輪胎', cost: 1200 },
    { name: '後輪胎', cost: 1300 },
    { name: '空氣濾芯', cost: 350 },
    { name: '煞車油', cost: 400 }
];

// 保養週期設定
const FIRST_SERVICE_KM = 300;
const FIRST_SERVICE_DAYS = 30;
const REGULAR_SERVICE_KM = 3000;
const REGULAR_SERVICE_DAYS = 180;

let chargeTimer = null;
let charts = {};
let selectedStation = '';

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadAllData();
    populateMonthFilters();
    // === MODIFICATION 4: Populate templates on load ===
    populateMaintTemplates();
});

function initEventListeners() {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const tabName = e.target.dataset.tab; // 取得 tab 名稱
            const tabId = tabName + 'Tab';
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            const target = document.getElementById(tabId);
            if (target) target.classList.add('active');
            
            // === MODIFICATION 2: Load settings when tab is clicked ===
            if (tabId === 'settingsTab') {
                if (typeof loadSettings === 'function') {
                    try { loadSettings(); } catch (err) { console.warn(err); }
                }
            }
        });
    });
    
    document.querySelectorAll('.station-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedStation = e.target.dataset.station;
            const input = document.getElementById('cStation');
            input.style.display = selectedStation === '其他' ? 'block' : 'none';
            if (selectedStation !== '其他') input.value = '';
        });
    });
    
    const sc = document.getElementById('startChargeForm');
    if (sc) sc.addEventListener('submit', startCharging);
    const ec = document.getElementById('endChargeForm');
    if (ec) ec.addEventListener('submit', endCharging);
    const mf = document.getElementById('maintenanceForm');
    if (mf) mf.addEventListener('submit', saveMaintenance);
    const ef = document.getElementById('expenseForm');
    if (ef) ef.addEventListener('submit', saveExpense);
    const sf = document.getElementById('statusForm');
    if (sf) sf.addEventListener('submit', saveStatus);
    const editf = document.getElementById('editChargeForm');
    if (editf) editf.addEventListener('submit', saveEditCharge);
    
    // === MODIFICATION 2: Add listeners for cost calculation and settings ===
    const kwhInput = document.getElementById('cKwh');
    if (kwhInput) kwhInput.addEventListener('input', autoCalculateCost);
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    
    const addPartBtn = document.getElementById('addPartBtn');
    if (addPartBtn) addPartBtn.addEventListener('click', () => addPartItem());
    const cancelMaintBtn = document.getElementById('cancelMaintEdit');
    if (cancelMaintBtn) cancelMaintBtn.addEventListener('click', cancelMaintEdit);
    const cancelExpenseBtn = document.getElementById('cancelExpenseEdit');
    if (cancelExpenseBtn) cancelExpenseBtn.addEventListener('click', cancelExpenseEdit);
    // close edit modal
    const closeEditModalBtn = document.getElementById('closeEditModal');
    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
    
    // 新增 "現在" 按鈕的監聽
    const maintNowBtn = document.getElementById('maintNowBtn');
    if (maintNowBtn) maintNowBtn.addEventListener('click', () => populateDateTime('mDate', 'mTime'));
    const expenseNowBtn = document.getElementById('expenseNowBtn');
    if (expenseNowBtn) expenseNowBtn.addEventListener('click', () => populateDateTime('eDate', 'eTime'));

    // 保養地點 "其他" 選項的監聽
    const mLocationSelect = document.getElementById('mLocationSelect');
    if (mLocationSelect) {
        mLocationSelect.addEventListener('change', (e) => {
            const input = document.getElementById('mLocationInput');
            if (e.target.value === '其他') {
                input.style.display = 'block';
            } else {
                input.style.display = 'none';
                input.value = '';
            }
        });
    }

    const importBtn = document.getElementById('importBtn');
    if (importBtn) importBtn.addEventListener('click', () => document.getElementById('jsonImport').click());
    const jsonImport = document.getElementById('jsonImport');
    if (jsonImport) jsonImport.addEventListener('change', importData);

    const exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllData);
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllData);

    const chargeSearch = document.getElementById('chargeSearch');
    if (chargeSearch) chargeSearch.addEventListener('input', filterChargeTable);
    const chargeMonthFilter = document.getElementById('chargeMonthFilter');
    if (chargeMonthFilter) chargeMonthFilter.addEventListener('change', filterChargeTable);

    const maintSearch = document.getElementById('maintSearch');
    if (maintSearch) maintSearch.addEventListener('input', filterMaintTable);
    const maintMonthFilter = document.getElementById('maintMonthFilter');
    if (maintMonthFilter) maintMonthFilter.addEventListener('change', filterMaintTable);
    const maintTypeFilter = document.getElementById('maintTypeFilter');
    if (maintTypeFilter) maintTypeFilter.addEventListener('change', filterMaintTable);

    const expenseCategoryFilter = document.getElementById('expenseCategoryFilter');
    if (expenseCategoryFilter) expenseCategoryFilter.addEventListener('change', filterExpenseTable);
    const expenseMonthFilter = document.getElementById('expenseMonthFilter');
    if (expenseMonthFilter) expenseMonthFilter.addEventListener('change', filterExpenseTable);

    const statusMonthFilter = document.getElementById('statusMonthFilter');
    if (statusMonthFilter) statusMonthFilter.addEventListener('change', filterStatusTable);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = type === 'success' ? 'var(--success)' : 'var(--danger)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function startCharging(e) {
    e.preventDefault();
    const input = document.getElementById('cStation');
    const station = selectedStation === '其他' ? input.value : selectedStation;
    if (!station) { showToast('請選擇充電站', 'error'); return; }
    
    const session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        odo: parseFloat(document.getElementById('cOdo').value),
        batteryStart: parseInt(document.querySelector('input[name="cBatteryStart"]:checked').value),
        station: station,
        stationType: selectedStation,
        notes: document.getElementById('cNotes').value
    };
    
    localStorage.setItem('currentChargingSession', JSON.stringify(session));
    const form = document.getElementById('startChargeForm');
    if (form) form.reset();
    document.getElementById('cCost') && (document.getElementById('cCost').readOnly = false);
    selectedStation = '';
    document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
    updateChargeUI();
    showToast('⚡ 充電已開始');
}

function endCharging(e) {
    e.preventDefault();
    if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
    
    const session = JSON.parse(localStorage.getItem('currentChargingSession') || 'null');
    if (!session) return;
    
    const endTime = new Date();
    const startTime = new Date(session.startTime);
    const diff = endTime - startTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    const record = {
        ...session,
        endTime: endTime.toISOString(),
        date: session.startTime.slice(0, 10),
        duration: `${hours}小時 ${minutes}分`,
        batteryEnd: parseInt(document.querySelector('input[name="cBatteryEnd"]:checked').value),
        kwh: parseFloat(document.getElementById('cKwh').value) || 0,
        cost: parseFloat(document.getElementById('cCost').value) || 0,
        range: parseFloat(document.getElementById('cRange').value) || 0
    };
    
    saveData('chargeLog', record);
    localStorage.removeItem('currentChargingSession');
    const ef = document.getElementById('endChargeForm');
    if (ef) ef.reset();
    document.getElementById('cKwh') && (document.getElementById('cKwh').readOnly = false);
    document.getElementById('cCost') && (document.getElementById('cCost').readOnly = false);
    updateChargeUI();
    loadAllData();
    showToast('✅ 充電記錄已儲存');
}

function updateChargeUI() {
    const session = JSON.parse(localStorage.getItem('currentChargingSession') || 'null');
    const startSection = document.getElementById('startChargeSection');
    const endSection = document.getElementById('endChargeSection');
    
    if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
    
    if (session) {
        startSection && (startSection.style.display = 'none');
        endSection && (endSection.style.display = 'block');
        
        const currentInfo = document.getElementById('currentChargeInfo');
        if (currentInfo) currentInfo.innerHTML = `
            <p><strong>開始時間:</strong> ${formatDateTime(session.startTime)}</p>
            <p><strong>開始里程:</strong> ${session.odo} km</p>
            <p><strong>開始電量:</strong> ${session.batteryStart} 格</p>
            <p><strong>充電站:</strong> ${session.station}</p>
        `;
        
        const kwhGroup = document.getElementById('kwhGroup');
        const costGroup = document.getElementById('costGroup');
        const kwhInput = document.getElementById('cKwh');
        const costInput = document.getElementById('cCost');
        
        if (kwhInput) kwhInput.value = '';
        if (costInput) costInput.value = '';
        if (kwhInput) kwhInput.required = false;
        if (costInput) costInput.required = false;
        if (kwhInput) kwhInput.readOnly = false;
        if (costInput) costInput.readOnly = false;
        if (kwhGroup) kwhGroup.style.display = 'block';
        if (costGroup) costGroup.style.display = 'block';
        
        // 根據儲存的 stationType 控制自動計算行為（若有設定電費）
        switch (session.stationType) {
            case '公司':
            case '家裡':
                // 如果有設定電費，就在輸入 kWh 後自動計算費用（由 autoCalculateCost 處理）
                break;
            default:
                // 公共充電站或其他：顯示手動輸入
                break;
        }

        // 啟動計時器（顯示充電時間）
        const timerEl = document.getElementById('chargingTimer');
        if (timerEl) {
            const start = new Date(session.startTime);
            function updateTimer() {
                const now = new Date();
                const diff = now - start;
                const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
                const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
                const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
                timerEl.textContent = `${h}:${m}:${s}`;
            }
            updateTimer();
            chargeTimer = setInterval(updateTimer, 1000);
        }
    } else {
        startSection && (startSection.style.display = 'block');
        endSection && (endSection.style.display = 'none');
    }
}

/* 以下為儲存與載入資料、篩選、表格與圖表更新等一系列函式。
   為了簡潔此處會保留函式名稱與關鍵邏輯，請將原檔中其餘的 helper functions（saveData/loadAllData/loadSettings/populateMonthFilters/populateMaintTemplates/addPartItem/cancelMaintEdit/cancelExpenseEdit/closeEditModal/importData/exportAllData/clearAllData/filterChargeTable/filterMaintTable/filterExpenseTable/filterStatusTable/autoCalculateCost/saveSettings/saveMaintenance/saveExpense/saveStatus/saveEditCharge/formatDateTime 等）
   一併搬進此 motorcycle_log.js 中（原始檔已有完整實作，請完整複製到此檔以保留行為）。
*/

/* 範例 stub（請用原始檔的完整實作取代） */
function saveData(key, value) {
    try {
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push(value);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (err) {
        console.error(err);
    }
}

function loadAllData() {
    // 載入並渲染所有表格 / 統計 / 圖表（將原檔中的實做搬過來）
    // ...
}

function populateMonthFilters() {
    // 將月份選單填充（原檔已實作）
}

function populateMaintTemplates() {
    const wrap = document.getElementById('maintTemplates');
    if (!wrap) return;
    wrap.innerHTML = '';
    maintTemplates.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary';
        btn.style.marginRight = '6px';
        btn.textContent = `${t.name} NT$${t.cost}`;
        btn.addEventListener('click', () => {
            // 新增一個零件項目且帶入費用
            addPartItem(t.name, t.cost);
        });
        wrap.appendChild(btn);
    });
}

function addPartItem(name = '', cost = 0) {
    const list = document.getElementById('partsList');
    if (!list) return;
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'part-item';
    div.dataset.id = id;
    div.innerHTML = `
        <input class="part-name" placeholder="項目/零件" value="${name}">
        <input class="part-cost" type="number" value="${cost}">
        <button type="button" class="btn btn-danger remove-part">刪除</button>
    `;
    list.appendChild(div);
    div.querySelector('.remove-part').addEventListener('click', () => {
        div.remove();
        updateTotalCost();
    });
    div.querySelector('.part-cost').addEventListener('input', updateTotalCost);
    updateTotalCost();
}

function updateTotalCost() {
    const costs = Array.from(document.querySelectorAll('.part-cost')).map(i => parseFloat(i.value) || 0);
    const total = costs.reduce((a, b) => a + b, 0);
    const el = document.getElementById('totalCost');
    if (el) el.textContent = total;
}

function saveMaintenance(e) {
    e.preventDefault();
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        parts.push({
            name: item.querySelector('.part-name').value,
            cost: parseFloat(item.querySelector('.part-cost').value) || 0
        });
    });
    
    // === START MODIFICATION 1 ===
    // 讀取保養地點
    const locSelect = document.getElementById('mLocationSelect').value;
    const locInput = document.getElementById('mLocationInput').value;
    const location = locSelect === '其他' ? locInput : locSelect;
    // === END MODIFICATION 1 ===
    
    const editingId = document.getElementById('editingMaintId').value;
    const record = {
        id: editingId ? parseInt(editingId) : Date.now(),
        date: document.getElementById('mDate').value,
        time: document.getElementById('mTime').value,
        odo: parseFloat(document.getElementById('mOdo').value),
        location: location, // 使用組合後的地點
        type: document.getElementById('mType').value,
        notes: document.getElementById('mNotes').value,
        parts: parts,
        totalCost: parseFloat(document.getElementById('totalCost').textContent)
    };
    
    saveData('maintenanceLog', record, !!editingId);
    cancelMaintEdit();
    loadAllData();
    showToast('✅ 保養記錄已儲存');
}

function cancelMaintEdit() {
    document.getElementById('maintenanceForm').reset();
    document.getElementById('editingMaintId').value = '';
    document.getElementById('partsList').innerHTML = '';
    document.getElementById('maintTitle').textContent = '記錄保養';
    document.getElementById('cancelMaintEdit').style.display = 'none';
    
    // === START MODIFICATION 1 ===
    // 重置保養地點
    document.getElementById('mLocationSelect').value = '基隆成功專賣店';
    document.getElementById('mLocationInput').value = '';
    document.getElementById('mLocationInput').style.display = 'none';
    // === END MODIFICATION 1 ===

    updateTotalCost();
    populateDateTime('mDate', 'mTime'); // 重置時填入現在時間
}

function saveExpense(e) {
    e.preventDefault();
    const editingId = document.getElementById('editingExpenseId').value;
    const record = {
        id: editingId ? parseInt(editingId) : Date.now(),
        date: document.getElementById('eDate').value,
        time: document.getElementById('eTime').value,
        odo: parseFloat(document.getElementById('eOdo').value) || 0,
        category: document.getElementById('eCategory').value,
        amount: parseFloat(document.getElementById('eAmount').value),
        description: document.getElementById('eDescription').value
    };
    
    saveData('expenseLog', record, !!editingId);
    cancelExpenseEdit();
    loadAllData();
    showToast('✅ 費用記錄已儲存');
}

function cancelExpenseEdit() {
    document.getElementById('expenseForm').reset();
    document.getElementById('editingExpenseId').value = '';
    document.getElementById('expenseTitle').textContent = '記錄其他花費';
    document.getElementById('cancelExpenseEdit').style.display = 'none';
    populateDateTime('eDate', 'eTime'); // 重置時填入現在時間
}

// 替換 populateStatusDateTime
function populateDateTime(dateFieldId, timeFieldId) {
    const now = new Date();
    
    // 轉換為 YYYY-MM-DD
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    
    // 檢查元素是否存在
    const dateEl = document.getElementById(dateFieldId);
    if (dateEl) dateEl.value = `${year}-${month}-${day}`;
    
    // 轉換為 HH:MM
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    const timeEl = document.getElementById(timeFieldId);
    if (timeEl) timeEl.value = `${hours}:${minutes}`;
}

function saveStatus(e) {
    e.preventDefault();
    
    const now = new Date(); // 儲存時抓取當前時間
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');

    const record = {
        id: Date.now(), // 總是用新的ID
        date: `${year}-${month}-${day}`, // 使用當前日期
        time: `${hours}:${minutes}`, // 使用當前時間
        odo: parseFloat(document.getElementById('sOdo').value),
        battery: parseInt(document.querySelector('input[name="sBattery"]:checked').value),
        notes: document.getElementById('sNotes').value
    };
    
    // 永遠只儲存一筆資料，直接覆蓋 localStorage
    localStorage.setItem('statusLog', JSON.stringify([record]));
    document.getElementById('statusForm').reset(); // 重置表單
    
    // 確保電量重置回 1 (reset() 可能會失效)
    document.querySelector('input[name="sBattery"][value="1"]').checked = true;

    loadAllData();
    showToast('✅ 狀態已更新');
}

// *** 錯誤修復：還原 saveData 和 loadAllData 函式 ***
function saveData(key, record, isEdit = false) {
    let data = JSON.parse(localStorage.getItem(key)) || [];
    if (isEdit) {
        const index = data.findIndex(item => item.id === record.id);
        if (index > -1) data[index] = record;
    } else {
        data.push(record);
    }
    data.sort((a, b) => {
        // 修正排序邏輯：優先使用 startTime (ISO 格式)，否則組合 date 和 time
        const dateStrA = a.startTime ? a.startTime : (a.date + 'T' + (a.time || '00:00'));
        const dateStrB = b.startTime ? b.startTime : (b.date + 'T' + (b.time || '00:00'));
        
        const dateA = new Date(dateStrA);
        const dateB = new Date(dateStrB);
        
        return dateB - dateA;
    });
    localStorage.setItem(key, JSON.stringify(data));
}

function loadAllData() {
    updateChargeUI();
    // === MODIFICATION 2 & 3: Load settings and check backup on load ===
    loadSettings();
    checkBackupStatus();
    loadChargeHistory();
    loadMaintenanceHistory();
    loadExpenseHistory();
    loadStatusHistory();
    updateDashboard();
    updateAnalytics();
    renderCharts();
}
// *** 錯誤修復完畢 ***

function updateDashboard() {
    const maintData = JSON.parse(localStorage.getItem('maintenanceLog')) || [];
    const chargeData = JSON.parse(localStorage.getItem('chargeLog')) || [];
    const expenseData = JSON.parse(localStorage.getItem('expenseLog')) || [];
    const statusData = JSON.parse(localStorage.getItem('statusLog')) || [];
    
    const allOdo = [...chargeData, ...maintData, ...expenseData, ...statusData].filter(d => d.odo > 0).map(d => d.odo);
    const totalMileage = allOdo.length > 0 ? Math.max(...allOdo) : 0;
    document.getElementById('totalMileage').textContent = totalMileage.toFixed(1);
    
    let totalExpense = 0;
    maintData.forEach(m => totalExpense += m.totalCost || 0);
    chargeData.forEach(c => totalExpense += c.cost || 0);
    expenseData.forEach(e => totalExpense += e.amount || 0);
    document.getElementById('totalExpense').textContent = totalExpense.toFixed(0);
    
    if (chargeData.length > 0) {
        const last = chargeData[0];
        const daysAgo = daysBetween(last.date, new Date().toISOString().slice(0, 10));
        document.getElementById('lastChargeDays').textContent = daysAgo === 0 ? '今天' : `${daysAgo}天前`;
        
        // C-1: 計算充電後騎乘距離
        const kmSinceCharge = totalMileage - last.odo;
        
        // C-2: 更新顯示
        if (kmSinceCharge > 0 && last.odo > 0) {
            document.getElementById('lastChargeDate').textContent = `${last.date} (已騎乘 ${kmSinceCharge.toFixed(1)} km)`;
        } else {
            document.getElementById('lastChargeDate').textContent = last.date;
        }
    }
    
    // === START MODIFICATION 2 ===
    // 尋找最後一次 "定期保養" 的紀錄
    const regularMaintData = maintData.filter(m => m.type === '定期保養');
    
    if (regularMaintData.length === 0) { // 如果從未有過定期保養
        const kmLeft = FIRST_SERVICE_KM - totalMileage;
        if (kmLeft > 0) {
            document.getElementById('nextServiceKm').textContent = `${kmLeft.toFixed(0)} km`;
            document.getElementById('nextServiceDate').textContent = '首次保養';
        } else {
            document.getElementById('nextServiceKm').textContent = '已超過';
            document.getElementById('nextServiceDate').textContent = '請盡快保養';
        }
    } else {
        const last = regularMaintData[0]; // 以最後一次 "定期保養" 為基準
        const kmSince = totalMileage - last.odo;
        const kmLeft = REGULAR_SERVICE_KM - kmSince;
        const daysAgo = daysBetween(last.date, new Date().toISOString().slice(0, 10));
        const daysLeft = REGULAR_SERVICE_DAYS - daysAgo;
        
        if (kmLeft > 0 && daysLeft > 0) {
            document.getElementById('nextServiceKm').textContent = `${kmLeft.toFixed(0)} km`;
            document.getElementById('nextServiceDate').textContent = `或 ${daysLeft} 天後`;
        } else {
            document.getElementById('nextServiceKm').textContent = '已超過';
            document.getElementById('nextServiceDate').textContent = '請盡快保養';
        }
    }
    // === END MODIFICATION 2 ===
    
    document.getElementById('statTotalMileage').textContent = `${totalMileage.toFixed(1)} km`;
    document.getElementById('statTotalCost').textContent = `${totalExpense.toFixed(0)} NT$`;
    document.getElementById('statMaintCount').textContent = maintData.length;
    document.getElementById('statChargeCount').textContent = chargeData.length;
    
    if (totalMileage > 0) {
        document.getElementById('statCostPerKm').textContent = `${(totalExpense / totalMileage).toFixed(2)} NT$`;
    }
    
    const allRecords = [...chargeData, ...maintData, ...expenseData, ...statusData].filter(d => d.date).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (allRecords.length > 1) {
        const days = daysBetween(allRecords[0].date, new Date().toISOString().slice(0, 10)) || 1;
        const avgDaily = totalMileage / days;
        document.getElementById('statAvgDaily').textContent = `${avgDaily.toFixed(1)} km`;
    }
}

function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round(Math.abs((d2 - d1) / 86400000));
}

function loadChargeHistory() {
    const data = JSON.parse(localStorage.getItem('chargeLog')) || [];
    const tbody = document.getElementById('chargeTable');
    tbody.innerHTML = '';
    
    const effMap = calculateEfficiencies(data);
    
    data.forEach(record => {
        const row = tbody.insertRow();
        const eff = effMap[record.id] || '-';
        const period = `${formatDateTime(record.startTime)}<br>~ ${formatDateTime(record.endTime)}`;
        
        // === MODIFICATION 1: Remove TRIP cell ===
        row.innerHTML = `
            <td>${period}</td>
            <td>${record.station}</td>
            <td>${record.cost || '-'}</td>
            <td>${eff}</td>
            <td>${record.batteryStart}→${record.batteryEnd}格</td>
            <td>${record.duration || '-'}</td>
            <td class="action-btns">
                <button class="btn btn-warning" onclick="editCharge(${record.id})">編輯</button>
                <button class="btn btn-danger" onclick="deleteRecord('chargeLog', ${record.id})">刪除</button>
            </td>
        `;
    });
}

function calculateEfficiencies(data) {
    const sorted = [...data].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const effMap = {};
    for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        const prev = sorted[i - 1];
        const mileage = curr.odo - prev.odo;
        const kwh = curr.kwh;
        if (mileage > 0 && kwh > 0) {
            effMap[curr.id] = (mileage / kwh).toFixed(2);
        }
    }
    return effMap;
}

function loadMaintenanceHistory() {
    const data = JSON.parse(localStorage.getItem('maintenanceLog')) || [];
    const tbody = document.getElementById('maintTable');
    tbody.innerHTML = '';
    
    data.forEach(record => {
        const row = tbody.insertRow();
        let items = record.parts && record.parts.length > 0 ? record.parts.map(p => p.name).join(', ') : record.notes || '-';
        if (items.length > 30) items = items.substring(0, 30) + '...';
        
        row.innerHTML = `
            <td>${record.date.slice(5)}</td>
            <td>${record.odo}</td>
            <td>${record.type}</td>
            <td>${items}</td>
            <td>${record.totalCost}</td>
            <td class="action-btns">
                <button class="btn btn-warning" onclick="editMaintenance(${record.id})">編輯</button>
                <button class="btn btn-danger" onclick="deleteRecord('maintenanceLog', ${record.id})">刪除</button>
            </td>
        `;
    });
}

function loadExpenseHistory() {
    const data = JSON.parse(localStorage.getItem('expenseLog')) || [];
    const tbody = document.getElementById('expenseTable');
    tbody.innerHTML = '';
    
    data.forEach(record => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${record.date.slice(5)}</td>
            <td>${record.category}</td>
            <td>${record.amount}</td>
            <td>${record.description || '-'}</td>
            <td class="action-btns">
                <button class="btn btn-warning" onclick="editExpense(${record.id})">編輯</button>
                <button class="btn btn-danger" onclick="deleteRecord('expenseLog', ${record.id})">刪除</button>
            </td>
        `;
    });
}

function loadStatusHistory() {
    const data = JSON.parse(localStorage.getItem('statusLog')) || [];
    const tbody = document.getElementById('statusTable');
    tbody.innerHTML = '';
    
    data.forEach(record => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${record.date.slice(5)}</td>
            <td>${record.time}</td>
            <td>${record.odo}</td>
            <td>${record.battery}</td>
            <td>${record.notes || '-'}</td>
            <!-- 移除操作按鈕 -->
        `;
    });
}

window.editCharge = function(id) {
    const data = JSON.parse(localStorage.getItem('chargeLog')) || [];
    const record = data.find(r => r.id === id);
    if (!record) return;
    
    document.getElementById('editingChargeId').value = record.id;
    document.getElementById('edit_cStartTime').value = toLocalISO(record.startTime);
    document.getElementById('edit_cEndTime').value = toLocalISO(record.endTime);
    document.getElementById('edit_cOdo').value = record.odo;
    // === MODIFICATION 1: Remove TRIP ===
    document.getElementById('edit_cStation').value = record.station;
    document.getElementById('edit_cBatteryStart').value = record.batteryStart;
    document.getElementById('edit_cBatteryEnd').value = record.batteryEnd;
    document.getElementById('edit_cKwh').value = record.kwh;
    document.getElementById('edit_cCost').value = record.cost;
    document.getElementById('edit_cNotes').value = record.notes || '';
    
    document.getElementById('editChargeModal').classList.add('active');
    // Note: Edit modal doesn't trigger auto-calc for simplicity. User can manually edit cost.
}

function saveEditCharge(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('editingChargeId').value);
    const startTime = new Date(document.getElementById('edit_cStartTime').value);
    const endTime = new Date(document.getElementById('edit_cEndTime').value);
    const diff = endTime - startTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    const record = {
        id: id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        date: startTime.toISOString().slice(0, 10),
        duration: `${hours}小時 ${minutes}分`,
        odo: parseFloat(document.getElementById('edit_cOdo').value),
        // === MODIFICATION 1: Remove TRIP ===
        station: document.getElementById('edit_cStation').value,
        batteryStart: parseInt(document.getElementById('edit_cBatteryStart').value),
        batteryEnd: parseInt(document.getElementById('edit_cBatteryEnd').value),
        kwh: parseFloat(document.getElementById('edit_cKwh').value),
        cost: parseFloat(document.getElementById('edit_cCost').value),
        notes: document.getElementById('edit_cNotes').value,
        range: 0
    };
    
    saveData('chargeLog', record, true);
    closeEditModal();
    loadAllData();
    showToast('✅ 充電記錄已更新');
}

function closeEditModal() {
    document.getElementById('editChargeModal').classList.remove('active');
}

window.editMaintenance = function(id) {
    const data = JSON.parse(localStorage.getItem('maintenanceLog')) || [];
    const record = data.find(r => r.id === id);
    if (!record) return;
    
    document.getElementById('editingMaintId').value = record.id;
    document.getElementById('mDate').value = record.date;
    document.getElementById('mTime').value = record.time;
    document.getElementById('mOdo').value = record.odo;
    
    // === START MODIFICATION 1 ===
    // 填入保養地點
    const locSelect = document.getElementById('mLocationSelect');
    const locInput = document.getElementById('mLocationInput');
    if (record.location === '基隆成功專賣店') {
        locSelect.value = '基隆成功專賣店';
        locInput.value = '';
        locInput.style.display = 'none';
    } else {
        locSelect.value = '其他';
        locInput.value = record.location || '';
        locInput.style.display = 'block';
    }
    // === END MODIFICATION 1 ===
    
    document.getElementById('mType').value = record.type;
    document.getElementById('mNotes').value = record.notes || '';
    document.getElementById('partsList').innerHTML = '';
    if (record.parts) record.parts.forEach(p => addPartItem(p.name, p.cost));
    updateTotalCost();
    document.getElementById('maintTitle').textContent = '編輯保養記錄';
    document.getElementById('cancelMaintEdit').style.display = 'block';
    document.querySelector('[data-tab="maintenance"]').click();
    window.scrollTo(0, 0);
}

window.editExpense = function(id) {
    const data = JSON.parse(localStorage.getItem('expenseLog')) || [];
    const record = data.find(r => r.id === id);
    if (!record) return;
    
    document.getElementById('editingExpenseId').value = record.id;
    document.getElementById('eDate').value = record.date;
    document.getElementById('eTime').value = record.time;
    document.getElementById('eOdo').value = record.odo || '';
    document.getElementById('eCategory').value = record.category;
    document.getElementById('eAmount').value = record.amount;
    document.getElementById('eDescription').value = record.description || '';
    document.getElementById('expenseTitle').textContent = '編輯費用記錄';
    document.getElementById('cancelExpenseEdit').style.display = 'block';
    document.querySelector('[data-tab="expense"]').click();
    window.scrollTo(0, 0);
}

// 移除 editStatus 函式

window.deleteRecord = function(key, id) {
    if (!confirm('確定要刪除這筆記錄嗎？此操作無法復原。')) return;
    let data = JSON.parse(localStorage.getItem(key)) || [];
    data = data.filter(item => item.id !== id);
    localStorage.setItem(key, JSON.stringify(data));
    loadAllData();
    showToast('🗑️ 記錄已刪除');
}

function filterChargeTable() {
    const search = document.getElementById('chargeSearch').value.toLowerCase();
    const month = document.getElementById('chargeMonthFilter').value;
    const rows = document.getElementById('chargeTable').rows;
    for (let row of rows) {
        const text = row.textContent.toLowerCase();
        const matchSearch = text.includes(search);
        const matchMonth = !month || text.includes(month);
        row.style.display = matchSearch && matchMonth ? '' : 'none';
    }
}

function filterMaintTable() {
    const search = document.getElementById('maintSearch').value.toLowerCase();
    const month = document.getElementById('maintMonthFilter').value;
    const type = document.getElementById('maintTypeFilter').value;
    const rows = document.getElementById('maintTable').rows;
    for (let row of rows) {
        const text = row.textContent.toLowerCase();
        const matchSearch = text.includes(search);
        const matchMonth = !month || text.includes(month);
        const matchType = !type || row.cells[2].textContent === type;
        row.style.display = matchSearch && matchMonth && matchType ? '' : 'none';
    }
}

function filterExpenseTable() {
    const category = document.getElementById('expenseCategoryFilter').value;
    const month = document.getElementById('expenseMonthFilter').value;
    const rows = document.getElementById('expenseTable').rows;
    for (let row of rows) {
        const text = row.textContent;
        const matchCategory = !category || row.cells[1].textContent === category;
        const matchMonth = !month || text.includes(month);
        row.style.display = matchCategory && matchMonth ? '' : 'none';
    }
}

function filterStatusTable() {
    const month = document.getElementById('statusMonthFilter').value;
    const rows = document.getElementById('statusTable').rows;
    for (let row of rows) {
        const matchMonth = !month || row.textContent.includes(month);
        row.style.display = matchMonth ? '' : 'none';
    }
}

function updateAnalytics() {
    const data = JSON.parse(localStorage.getItem('chargeLog')) || [];
    document.getElementById('totalCharges').textContent = data.length;
    
    const effMap = calculateEfficiencies(data);
    const effs = Object.values(effMap).map(v => parseFloat(v));
    
    if (effs.length > 0) {
        const avg = effs.reduce((a, b) => a + b, 0) / effs.length;
        document.getElementById('avgEfficiency').textContent = `${avg.toFixed(2)} km/kWh`;
        document.getElementById('bestEfficiency').textContent = `${Math.max(...effs).toFixed(2)} km/kWh`;
        document.getElementById('worstEfficiency').textContent = `${Math.min(...effs).toFixed(2)} km/kWh`;
    } else {
        document.getElementById('avgEfficiency').textContent = '-';
        document.getElementById('bestEfficiency').textContent = '-';
        document.getElementById('worstEfficiency').textContent = '-';
    }
}

function renderCharts() {
    renderChargeChart();
    renderMaintChart();
    renderExpenseChart();
    renderMonthlyChart();
    renderCategoryChart();
}

function renderChargeChart() {
    const data = JSON.parse(localStorage.getItem('chargeLog')) || [];
    if (data.length < 2) return;
    
    const effMap = calculateEfficiencies(data);
    const sorted = [...data].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const chartData = sorted.map(r => ({ label: r.date.slice(5), value: effMap[r.id] })).filter(d => d.value);
    
    if (charts.charge) charts.charge.destroy();
    const ctx = document.getElementById('chargeChart').getContext('2d');
    charts.charge = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: '效率 (km/kWh)',
                data: chartData.map(d => d.value),
                backgroundColor: 'rgba(37, 99, 235, 0.5)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 2
            }]
        },
        options: { responsive: true, plugins: { legend: { display: true }}}
    });
}

function renderMaintChart() {
    const data = JSON.parse(localStorage.getItem('maintenanceLog')) || [];
    if (data.length === 0) return;
    
    if (charts.maint) charts.maint.destroy();
    const ctx = document.getElementById('maintChart').getContext('2d');
    charts.maint = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...data].reverse().map(d => d.date.slice(5)),
            datasets: [{
                label: '保養費用 (NT$)',
                data: [...data].reverse().map(d => d.totalCost),
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4
            }]
        },
        options: { responsive: true, plugins: { legend: { display: true }}}
    });
}

function renderExpenseChart() {
    const data = JSON.parse(localStorage.getItem('expenseLog')) || [];
    if (data.length === 0) return;
    
    if (charts.expense) charts.expense.destroy();
    const ctx = document.getElementById('expenseChart').getContext('2d');
    charts.expense = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [...data].reverse().map(d => d.date.slice(5)),
            datasets: [{
                label: '費用 (NT$)',
                data: [...data].reverse().map(d => d.amount),
                backgroundColor: 'rgba(16, 185, 129, 0.5)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 2
            }]
        },
        options: { responsive: true, plugins: { legend: { display: true }}}
    });
}

function renderMonthlyChart() {
    const maintData = JSON.parse(localStorage.getItem('maintenanceLog')) || [];
    const chargeData = JSON.parse(localStorage.getItem('chargeLog')) || [];
    const expenseData = JSON.parse(localStorage.getItem('expenseLog')) || [];
    
    const monthlyData = {};
    maintData.forEach(m => {
        const month = m.date.slice(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + (m.totalCost || 0);
    });
    chargeData.forEach(c => {
        const month = c.date.slice(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + (c.cost || 0);
    });
    expenseData.forEach(e => {
        const month = e.date.slice(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + (e.amount || 0);
    });
    
    const months = Object.keys(monthlyData).sort();
    if (months.length === 0) return;
    
    if (charts.monthly) charts.monthly.destroy();
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    charts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: '月度總花費 (NT$)',
                data: months.map(m => monthlyData[m]),
                borderColor: 'rgb(139, 92, 246)',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { display: true }}}
    });
}

function renderCategoryChart() {
    const maintData = JSON.parse(localStorage.getItem('maintenanceLog')) || [];
    const chargeData = JSON.parse(localStorage.getItem('chargeLog')) || [];
    const expenseData = JSON.parse(localStorage.getItem('expenseLog')) || [];
    
    const categoryData = { '保養': 0, '充電': 0 };
    maintData.forEach(m => categoryData['保養'] += m.totalCost || 0);
    chargeData.forEach(c => categoryData['充電'] += c.cost || 0);
    expenseData.forEach(e => {
        categoryData[e.category] = (categoryData[e.category] || 0) + e.amount;
    });
    
    const categories = Object.keys(categoryData).filter(k => categoryData[k] > 0);
    if (categories.length === 0) return;
    
    if (charts.category) charts.category.destroy();
    const ctx = document.getElementById('categoryChart').getContext('2d');
    charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: categories.map(k => categoryData[k]),
                backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(37, 99, 235, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(236, 72, 153, 0.8)',
                    'rgba(100, 116, 139, 0.8)'
                ]
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' }}}
    });
}

function populateMonthFilters() {
    const allData = [
        ...JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        ...JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        ...JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        ...JSON.parse(localStorage.getItem('statusLog') || '[]')
    ];
    
    const months = new Set();
    allData.forEach(r => { if (r.date) months.add(r.date.slice(0, 7)); });
    const sorted = Array.from(months).sort().reverse();
    
    ['chargeMonthFilter', 'maintMonthFilter', 'expenseMonthFilter', 'statusMonthFilter'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = '<option value="">所有月份</option>';
        sorted.forEach(month => {
            select.innerHTML += `<option value="${month}">${month}</option>`;
        });
    });
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            // 排序函式
            const sortFn = (a, b) => {
                // 修正排序邏輯：優先使用 startTime (ISO 格式)，否則組合 date 和 time
                const dateStrA = a.startTime ? a.startTime : (a.date + 'T' + (a.time || '00:00'));
                const dateStrB = b.startTime ? b.startTime : (b.date + 'T' + (b.time || '00:00'));
                
                const dateA = new Date(dateStrA);
                const dateB = new Date(dateStrB);
                
                return dateB - dateA; // 降冪排序 (最新在前)
            };

            if (imported.type === 'all') {
                if (!confirm('確定要匯入完整資料嗎？這將會覆蓋現有的所有記錄。')) return;
                
                // 匯入前排序
                if (imported.chargeLog) {
                    imported.chargeLog.sort(sortFn);
                    localStorage.setItem('chargeLog', JSON.stringify(imported.chargeLog));
                }
                if (imported.maintenanceLog) {
                    imported.maintenanceLog.sort(sortFn);
                    localStorage.setItem('maintenanceLog', JSON.stringify(imported.maintenanceLog));
                }
                if (imported.expenseLog) {
                    imported.expenseLog.sort(sortFn);
                    localStorage.setItem('expenseLog', JSON.stringify(imported.expenseLog));
                }
                if (imported.statusLog) {
                    imported.statusLog.sort(sortFn);
                    localStorage.setItem('statusLog', JSON.stringify(imported.statusLog));
                }
                showToast('✅ 完整資料匯入成功');
            } else if (imported.type && Array.isArray(imported.data)) {
                if (!confirm('確定要匯入資料嗎？這將會覆蓋現有的同類型記錄。')) return;
                
                // 匯入前排序
                imported.data.sort(sortFn);
                localStorage.setItem(imported.type, JSON.stringify(imported.data));
                showToast('✅ 資料匯入成功');
            } else {
                showToast('❌ JSON 檔案格式不符', 'error');
                return;
            }
            
            loadAllData();
            populateMonthFilters();
        } catch (error) {
            showToast('❌ 讀取檔案失敗', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

<!-- 修改 (3): 移除不再需要的 exportData 函式 -->

function exportAllData() {
    const allData = {
        type: 'all',
        version: '3.0',
        exportDate: new Date().toISOString(),
        chargeLog: JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        expenseLog: JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        statusLog: JSON.parse(localStorage.getItem('statusLog') || '[]')
    };
    
    downloadJSON(allData, `motorcycle_all_data_${new Date().toISOString().slice(0, 10)}.json`);
    showToast('✅ 全部資料已匯出');
    
    // === MODIFICATION 3: Set backup date and update status ===
    localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0, 10));
    checkBackupStatus();
}

function clearAllData() {
    if (!confirm('確定要清除所有資料嗎？此操作無法復原！')) return;
    if (!confirm('請再次確認：這將永久刪除所有記錄！')) return;
    localStorage.clear();
    loadAllData();
    showToast('🗑️ 所有資料已清除');
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// === START: NEW FUNCTIONS (MODIFICATION 2, 3, 4) ===

/**
 * 載入設定
 */
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (document.getElementById('electricRate')) {
        document.getElementById('electricRate').value = settings.electricRate || '';
    }
    return settings;
}

/**
 * 儲存設定
 */
function saveSettings() {
    const rate = parseFloat(document.getElementById('electricRate').value) || 0;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ electricRate: rate }));
    showToast('✅ 設定已儲存');
    loadSettings(); // 重新載入以確認
}

/**
 * 自動計算充電費用
 */
function autoCalculateCost() {
    const settings = loadSettings();
    const rate = parseFloat(settings.electricRate);
    const costInput = document.getElementById('cCost');
    
    // 只有在 costInput 是 readOnly (即 "公司" 或 "家裡") 時才自動計算
    if (costInput.readOnly) {
        if (rate && rate > 0) {
            const kwh = parseFloat(document.getElementById('cKwh').value) || 0;
            costInput.value = (kwh * rate).toFixed(0);
        } else {
            costInput.value = '0';
        }
    }
}

/**
 * 檢查備份狀態並顯示警告
 */
function checkBackupStatus() {
    const lastBackup = localStorage.getItem(BACKUP_KEY);
    const warningEl = document.getElementById('backupWarning');
    if (!warningEl) return;

    if (!lastBackup) {
        warningEl.textContent = '您尚未備份過資料，建議立即匯出。';
        warningEl.style.display = 'block';
        return;
    }
    
    const daysAgo = daysBetween(lastBackup, new Date().toISOString().slice(0, 10));
    
    if (daysAgo > 30) {
        warningEl.textContent = `您已 ${daysAgo} 天未備份，建議立即匯出。`;
        warningEl.style.display = 'block';
    } else {
        warningEl.style.display = 'none';
    }
}

/**
 * 產生保養快速模板按鈕
 */
function populateMaintTemplates() {
    const container = document.getElementById('maintTemplates');
    if (!container) return;
    container.innerHTML = '';
    
    maintTemplates.forEach(template => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary';
        btn.textContent = `+ ${template.name} (${template.cost})`;
        btn.style.padding = '8px 12px';
        btn.onclick = () => { 
            addPartItem(template.name, template.cost); 
        };
        container.appendChild(btn);
    });
}

// === END: NEW FUNCTIONS ===


function formatDateTime(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('zh-TW', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function toLocalISO(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}
