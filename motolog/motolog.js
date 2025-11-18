/* motolog/motolog.js
   完整可替換檔案（包含：分頁邏輯、資料儲存、篩選、表格渲染、圖表、預設帶入等）
   適用於 motolog/index.html（已改為分頁名稱: 更新、充電、保養、其他、分析、設定）
*/

const SETTINGS_KEY = 'motorcycleSettings';
const BACKUP_KEY = 'lastBackupDate';
const MAINT_TEMPLATES = [
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
    populateMaintTemplates();
    populateMonthFilters(); // 先建立月份選單並設定預設為當月
    loadAllData();
    prefillChargeDefaults();
});

function initEventListeners() {
    // tabs
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const tabName = e.target.dataset.tab;
            const tabId = tabName + 'Tab';
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            const target = document.getElementById(tabId);
            if (target) target.classList.add('active');

            if (tabId === 'settingsTab') loadSettings();
        });
    });

    // station quick buttons
    document.querySelectorAll('.station-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedStation = e.target.dataset.station;
            const input = document.getElementById('cStation');
            if (input) {
                input.style.display = selectedStation === '其他' ? 'block' : 'none';
                if (selectedStation !== '其他') input.value = '';
            }
            // if selected company/home, set cCost readOnly behavior will be handled when starting charge
        });
    });

    // forms
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

    // settings & auto-calc
    const kwhInput = document.getElementById('cKwh');
    if (kwhInput) kwhInput.addEventListener('input', autoCalculateCost);
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    // maintenance helpers
    const addPartBtn = document.getElementById('addPartBtn');
    if (addPartBtn) addPartBtn.addEventListener('click', () => addPartItem());
    const cancelMaintBtn = document.getElementById('cancelMaintEdit');
    if (cancelMaintBtn) cancelMaintBtn.addEventListener('click', cancelMaintEdit);
    const cancelExpenseBtn = document.getElementById('cancelExpenseEdit');
    if (cancelExpenseBtn) cancelExpenseBtn.addEventListener('click', cancelExpenseEdit);
    const closeEditModalBtn = document.getElementById('closeEditModal');
    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);

    // Now buttons
    const maintNowBtn = document.getElementById('maintNowBtn');
    if (maintNowBtn) maintNowBtn.addEventListener('click', () => populateDateTime('mDate', 'mTime'));
    const expenseNowBtn = document.getElementById('expenseNowBtn');
    if (expenseNowBtn) expenseNowBtn.addEventListener('click', () => populateDateTime('eDate', 'eTime'));

    // maintenance location select
    const mLocationSelect = document.getElementById('mLocationSelect');
    if (mLocationSelect) {
        mLocationSelect.addEventListener('change', (e) => {
            const input = document.getElementById('mLocationInput');
            if (input) {
                if (e.target.value === '其他') { input.style.display = 'block'; }
                else { input.style.display = 'none'; input.value = ''; }
            }
        });
    }

    // data import/export/clear
    const importBtn = document.getElementById('importBtn');
    if (importBtn) importBtn.addEventListener('click', () => document.getElementById('jsonImport').click());
    const jsonImport = document.getElementById('jsonImport');
    if (jsonImport) jsonImport.addEventListener('change', importData);
    const exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllData);
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllData);

    // search & month filters
    const chargeSearch = document.getElementById('chargeSearch');
    if (chargeSearch) chargeSearch.addEventListener('input', filterChargeTable);
    const chargeMonthFilter = document.getElementById('chargeMonthFilter');
    if (chargeMonthFilter) chargeMonthFilter.addEventListener('change', () => { loadChargeHistory(); filterChargeTable(); });

    const maintSearch = document.getElementById('maintSearch');
    if (maintSearch) maintSearch.addEventListener('input', filterMaintTable);
    const maintMonthFilter = document.getElementById('maintMonthFilter');
    if (maintMonthFilter) maintMonthFilter.addEventListener('change', () => { loadMaintenanceHistory(); filterMaintTable(); });
    const maintTypeFilter = document.getElementById('maintTypeFilter');
    if (maintTypeFilter) maintTypeFilter.addEventListener('change', filterMaintTable);

    const expenseCategoryFilter = document.getElementById('expenseCategoryFilter');
    if (expenseCategoryFilter) expenseCategoryFilter.addEventListener('change', filterExpenseTable);
    const expenseMonthFilter = document.getElementById('expenseMonthFilter');
    if (expenseMonthFilter) expenseMonthFilter.addEventListener('change', () => { loadExpenseHistory(); filterExpenseTable(); });

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

// === Charging session ===
function startCharging(e) {
    e.preventDefault();
    const input = document.getElementById('cStation');
    const station = selectedStation === '其他' ? (input ? input.value : '') : selectedStation;
    if (!station) { showToast('請選擇充電站', 'error'); return; }

    const odoEl = document.getElementById('cOdo');
    const odoVal = odoEl ? parseFloat(odoEl.value) || 0 : 0;

    const session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        odo: odoVal,
        batteryStart: parseInt(document.querySelector('input[name="cBatteryStart"]:checked')?.value || '1'),
        station: station,
        stationType: selectedStation || '其他',
        notes: document.getElementById('cNotes')?.value || ''
    };

    localStorage.setItem('currentChargingSession', JSON.stringify(session));
    if (document.getElementById('startChargeForm')) document.getElementById('startChargeForm').reset();
    // reset selectedStation UI
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
        batteryEnd: parseInt(document.querySelector('input[name="cBatteryEnd"]:checked')?.value || '5'),
        kwh: parseFloat(document.getElementById('cKwh')?.value) || 0,
        cost: parseFloat(document.getElementById('cCost')?.value) || 0,
        range: parseFloat(document.getElementById('cRange')?.value) || 0
    };

    saveData('chargeLog', record);
    localStorage.removeItem('currentChargingSession');
    if (document.getElementById('endChargeForm')) document.getElementById('endChargeForm').reset();
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
        if (startSection) startSection.style.display = 'none';
        if (endSection) endSection.style.display = 'block';

        const currentInfo = document.getElementById('currentChargeInfo');
        if (currentInfo) currentInfo.innerHTML = `
            <p><strong>開始時間:</strong> ${formatDateTime(session.startTime)}</p>
            <p><strong>開始里程:</strong> ${session.odo} km</p>
            <p><strong>開始電量:</strong> ${session.batteryStart} 格</p>
            <p><strong>充電站:</strong> ${session.station}</p>
        `;

        const kwhInput = document.getElementById('cKwh');
        const costInput = document.getElementById('cCost');
        if (kwhInput) { kwhInput.value = ''; kwhInput.readOnly = false; kwhInput.required = false; }
        if (costInput) { costInput.value = ''; costInput.readOnly = false; costInput.required = false; }

        // 如果 stationType 為 家裡/公司，並且設定了電費，將 cost 設為 readonly (auto-calc)
        if (session.stationType === '公司' || session.stationType === '家裡') {
            const settings = loadSettings();
            if (settings && settings.electricRate && settings.electricRate > 0) {
                if (costInput) costInput.readOnly = true;
            }
        }

        // 啟動計時器
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
        if (startSection) startSection.style.display = 'block';
        if (endSection) endSection.style.display = 'none';
        prefillChargeDefaults();
    }
}

// === Storage helpers ===
function saveData(key, record, isEdit = false) {
    let data = JSON.parse(localStorage.getItem(key) || '[]');
    if (isEdit) {
        const idx = data.findIndex(i => i.id === record.id);
        if (idx !== -1) data[idx] = record;
        else data.push(record);
    } else {
        data.push(record);
    }
    // 排序：最新在前（若有 startTime 則用 startTime，否則用 date+time）
    data.sort((a, b) => {
        const as = a.startTime ? a.startTime : (a.date ? a.date + 'T' + (a.time || '00:00') : '');
        const bs = b.startTime ? b.startTime : (b.date ? b.date + 'T' + (b.time || '00:00') : '');
        return new Date(bs) - new Date(as);
    });
    localStorage.setItem(key, JSON.stringify(data));
}

function loadAllData() {
    updateChargeUI();
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

// === Dashboard & analytics ===
function updateDashboard() {
    const maintData = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    const chargeData = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    const expenseData = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    const statusData = JSON.parse(localStorage.getItem('statusLog') || '[]');

    const odos = [...chargeData, ...maintData, ...expenseData, ...statusData].filter(d => d.odo && d.odo > 0).map(d => d.odo);
    const totalMileage = odos.length ? Math.max(...odos) : 0;
    document.getElementById('totalMileage').textContent = totalMileage.toFixed(1);

    let totalExpense = 0;
    maintData.forEach(m => totalExpense += m.totalCost || 0);
    chargeData.forEach(c => totalExpense += c.cost || 0);
    expenseData.forEach(e => totalExpense += e.amount || 0);
    document.getElementById('totalExpense').textContent = totalExpense.toFixed(0);

    if (chargeData.length > 0) {
        const last = chargeData[0];
        const daysAgo = daysBetween(last.date, new Date().toISOString().slice(0,10));
        document.getElementById('lastChargeDays').textContent = daysAgo === 0 ? '今天' : `${daysAgo}天前`;
        const kmSince = totalMileage - last.odo;
        document.getElementById('lastChargeDate').textContent = (kmSince > 0 && last.odo > 0) ? `${last.date} (已騎乘 ${kmSince.toFixed(1)} km)` : last.date;
    }

    // 下次保養（定期保養為基準）
    const regularMaint = maintData.filter(m => m.type === '定期保養');
    if (regularMaint.length === 0) {
        const kmLeft = FIRST_SERVICE_KM - totalMileage;
        if (kmLeft > 0) {
            document.getElementById('nextServiceKm').textContent = `${kmLeft.toFixed(0)} km`;
            document.getElementById('nextServiceDate').textContent = '首次保養';
        } else {
            document.getElementById('nextServiceKm').textContent = '已超過';
            document.getElementById('nextServiceDate').textContent = '請盡快保養';
        }
    } else {
        const last = regularMaint[0];
        const kmSince = totalMileage - last.odo;
        const kmLeft = REGULAR_SERVICE_KM - kmSince;
        const daysAgo = daysBetween(last.date, new Date().toISOString().slice(0,10));
        const daysLeft = REGULAR_SERVICE_DAYS - daysAgo;
        if (kmLeft > 0 && daysLeft > 0) {
            document.getElementById('nextServiceKm').textContent = `${kmLeft.toFixed(0)} km`;
            document.getElementById('nextServiceDate').textContent = `或 ${daysLeft} 天後`;
        } else {
            document.getElementById('nextServiceKm').textContent = '已超過';
            document.getElementById('nextServiceDate').textContent = '請盡快保養';
        }
    }

    document.getElementById('statTotalMileage').textContent = `${totalMileage.toFixed(1)} km`;
    document.getElementById('statTotalCost').textContent = `${totalExpense.toFixed(0)} NT$`;
    document.getElementById('statMaintCount').textContent = maintData.length;
    document.getElementById('statChargeCount').textContent = chargeData.length;

    if (totalMileage > 0) {
        document.getElementById('statCostPerKm').textContent = `${(totalExpense/totalMileage).toFixed(2)} NT$`;
    }

    const allRecords = [...chargeData, ...maintData, ...expenseData, ...statusData].filter(r => r.date).sort((a,b)=> new Date(a.date)-new Date(b.date));
    if (allRecords.length > 1) {
        const days = daysBetween(allRecords[0].date, new Date().toISOString().slice(0,10)) || 1;
        const avgDaily = totalMileage / days;
        document.getElementById('statAvgDaily').textContent = `${avgDaily.toFixed(1)} km`;
    }
}

function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round(Math.abs((d2 - d1) / 86400000));
}

// === Charge history render (Requirement 2: 簡化欄位 + details 折疊) ===
function loadChargeHistory() {
    const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    const tbody = document.getElementById('chargeTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const effMap = calculateEfficiencies(data);

    // apply month filter if selected
    const monthFilter = document.getElementById('chargeMonthFilter')?.value || '';
    const filtered = monthFilter ? data.filter(r => r.date && r.date.slice(0,7) === monthFilter) : data;

    filtered.forEach(record => {
        const row = tbody.insertRow();
        const eff = effMap[record.id] || '-';
        const dateLabel = record.date ? record.date.slice(5) : (record.startTime ? record.startTime.slice(5,10) : '-');

        const detailsHTML = `
            <details>
                <summary style="cursor:pointer">${dateLabel}</summary>
                <div style="margin-top:8px; font-size:0.95rem; color:var(--secondary);">
                    <div><strong>期間:</strong> ${formatDateTime(record.startTime)} ～ ${formatDateTime(record.endTime)}</div>
                    <div><strong>費用:</strong> ${record.cost || '-' } NT$</div>
                    <div><strong>效率:</strong> ${eff}</div>
                    <div><strong>電量:</strong> ${record.batteryStart} → ${record.batteryEnd} 格</div>
                    <div><strong>度數:</strong> ${record.kwh || '-'} kWh</div>
                    <div><strong>估計里程:</strong> ${record.range || '-'} km</div>
                    <div><strong>備註:</strong> ${record.notes || '-'}</div>
                </div>
            </details>
        `;

        row.innerHTML = `
            <td>${detailsHTML}</td>
            <td>${record.station || '-'}</td>
            <td>${record.duration || '-'}</td>
            <td class="action-btns">
                <button class="btn btn-warning" onclick="editCharge(${record.id})">編輯</button>
                <button class="btn btn-danger" onclick="deleteRecord('chargeLog', ${record.id})">刪除</button>
            </td>
        `;
    });
}

function calculateEfficiencies(data) {
    const sorted = [...data].sort((a,b) => new Date(a.startTime) - new Date(b.startTime));
    const effMap = {};
    for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        const prev = sorted[i-1];
        const mileage = curr.odo - prev.odo;
        const kwh = curr.kwh;
        if (mileage > 0 && kwh > 0) effMap[curr.id] = (mileage / kwh).toFixed(2);
    }
    return effMap;
}

// === Maintenance / Expense / Status history render ===
function loadMaintenanceHistory() {
    const data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    const tbody = document.getElementById('maintTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const monthFilter = document.getElementById('maintMonthFilter')?.value || '';
    const filtered = monthFilter ? data.filter(r => r.date && r.date.slice(0,7) === monthFilter) : data;

    filtered.forEach(record => {
        const row = tbody.insertRow();
        let items = record.parts && record.parts.length ? record.parts.map(p => p.name).join(', ') : record.notes || '-';
        if (items.length > 30) items = items.substring(0,30) + '...';
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
    const data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    const tbody = document.getElementById('expenseTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const monthFilter = document.getElementById('expenseMonthFilter')?.value || '';
    const filtered = monthFilter ? data.filter(r => r.date && r.date.slice(0,7) === monthFilter) : data;

    filtered.forEach(record => {
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
    const data = JSON.parse(localStorage.getItem('statusLog') || '[]');
    const tbody = document.getElementById('statusTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach(record => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${record.date.slice(5)}</td>
            <td>${record.time}</td>
            <td>${record.odo}</td>
            <td>${record.battery}</td>
            <td>${record.notes || '-'}</td>
        `;
    });
}

// === Edit / Save functions ===
window.editCharge = function(id) {
    const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    const rec = data.find(r => r.id === id);
    if (!rec) return;
    document.getElementById('editingChargeId').value = rec.id;
    document.getElementById('edit_cStartTime').value = toLocalISO(rec.startTime);
    document.getElementById('edit_cEndTime').value = toLocalISO(rec.endTime);
    document.getElementById('edit_cOdo').value = rec.odo;
    document.getElementById('edit_cStation').value = rec.station || '';
    document.getElementById('edit_cBatteryStart').value = rec.batteryStart || '';
    document.getElementById('edit_cBatteryEnd').value = rec.batteryEnd || '';
    document.getElementById('edit_cKwh').value = rec.kwh || '';
    document.getElementById('edit_cCost').value = rec.cost || '';
    document.getElementById('edit_cNotes').value = rec.notes || '';
    document.getElementById('editChargeModal').classList.add('active');
};

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
        date: startTime.toISOString().slice(0,10),
        duration: `${hours}小時 ${minutes}分`,
        odo: parseFloat(document.getElementById('edit_cOdo').value),
        station: document.getElementById('edit_cStation').value,
        batteryStart: parseInt(document.getElementById('edit_cBatteryStart').value || '0'),
        batteryEnd: parseInt(document.getElementById('edit_cBatteryEnd').value || '0'),
        kwh: parseFloat(document.getElementById('edit_cKwh').value) || 0,
        cost: parseFloat(document.getElementById('edit_cCost').value) || 0,
        notes: document.getElementById('edit_cNotes').value || '',
        range: 0
    };

    saveData('chargeLog', record, true);
    closeEditModal();
    loadAllData();
    showToast('✅ 充電記錄已更新');
}

function closeEditModal() {
    document.getElementById('editChargeModal')?.classList.remove('active');
}

window.editMaintenance = function(id) {
    const data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    const rec = data.find(r => r.id === id);
    if (!rec) return;
    document.getElementById('editingMaintId').value = rec.id;
    document.getElementById('mDate').value = rec.date;
    document.getElementById('mTime').value = rec.time;
    document.getElementById('mOdo').value = rec.odo;
    const locSelect = document.getElementById('mLocationSelect');
    const locInput = document.getElementById('mLocationInput');
    if (rec.location === '基隆成功專賣店') {
        locSelect.value = '基隆成功專賣店';
        if (locInput) { locInput.style.display = 'none'; locInput.value = ''; }
    } else {
        locSelect.value = '其他';
        if (locInput) { locInput.style.display = 'block'; locInput.value = rec.location || ''; }
    }
    document.getElementById('mType').value = rec.type;
    document.getElementById('mNotes').value = rec.notes || '';
    document.getElementById('partsList').innerHTML = '';
    if (rec.parts) rec.parts.forEach(p => addPartItem(p.name, p.cost));
    updateTotalCost();
    document.getElementById('maintTitle').textContent = '編輯保養記錄';
    document.getElementById('cancelMaintEdit').style.display = 'block';
    document.querySelector('[data-tab="maintenance"]')?.click();
    window.scrollTo(0,0);
};

window.editExpense = function(id) {
    const data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    const rec = data.find(r => r.id === id);
    if (!rec) return;
    document.getElementById('editingExpenseId').value = rec.id;
    document.getElementById('eDate').value = rec.date;
    document.getElementById('eTime').value = rec.time;
    document.getElementById('eOdo').value = rec.odo || '';
    document.getElementById('eCategory').value = rec.category || '';
    document.getElementById('eAmount').value = rec.amount || '';
    document.getElementById('eDescription').value = rec.description || '';
    document.getElementById('expenseTitle').textContent = '編輯費用記錄';
    document.getElementById('cancelExpenseEdit').style.display = 'block';
    document.querySelector('[data-tab="expense"]')?.click();
    window.scrollTo(0,0);
};

window.deleteRecord = function(key, id) {
    if (!confirm('確定要刪除這筆記錄嗎？此操作無法復原。')) return;
    let data = JSON.parse(localStorage.getItem(key) || '[]');
    data = data.filter(d => d.id !== id);
    localStorage.setItem(key, JSON.stringify(data));
    loadAllData();
    showToast('🗑️ 記錄已刪除');
};

// === Filters ===
function filterChargeTable() {
    const search = document.getElementById('chargeSearch')?.value.toLowerCase() || '';
    const month = document.getElementById('chargeMonthFilter')?.value || '';
    const rows = document.getElementById('chargeTable')?.rows || [];
    for (let row of rows) {
        const text = row.textContent.toLowerCase();
        const matchSearch = text.includes(search);
        const matchMonth = !month || text.includes(month);
        row.style.display = matchSearch && matchMonth ? '' : 'none';
    }
}
function filterMaintTable() {
    const search = document.getElementById('maintSearch')?.value.toLowerCase() || '';
    const month = document.getElementById('maintMonthFilter')?.value || '';
    const type = document.getElementById('maintTypeFilter')?.value || '';
    const rows = document.getElementById('maintTable')?.rows || [];
    for (let row of rows) {
        const text = row.textContent.toLowerCase();
        const matchSearch = text.includes(search);
        const matchMonth = !month || text.includes(month);
        const matchType = !type || row.cells[2].textContent === type;
        row.style.display = matchSearch && matchMonth && matchType ? '' : 'none';
    }
}
function filterExpenseTable() {
    const category = document.getElementById('expenseCategoryFilter')?.value || '';
    const month = document.getElementById('expenseMonthFilter')?.value || '';
    const rows = document.getElementById('expenseTable')?.rows || [];
    for (let row of rows) {
        const matchCategory = !category || row.cells[1].textContent === category;
        const matchMonth = !month || row.textContent.includes(month);
        row.style.display = matchCategory && matchMonth ? '' : 'none';
    }
}
function filterStatusTable() {
    const month = document.getElementById('statusMonthFilter')?.value || '';
    const rows = document.getElementById('statusTable')?.rows || [];
    for (let row of rows) {
        const matchMonth = !month || row.textContent.includes(month);
        row.style.display = matchMonth ? '' : 'none';
    }
}

// === Analytics / Charts ===
function updateAnalytics() {
    const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    document.getElementById('totalCharges').textContent = data.length;
    const effMap = calculateEfficiencies(data);
    const effs = Object.values(effMap).map(v => parseFloat(v));
    if (effs.length > 0) {
        const avg = effs.reduce((a,b)=>a+b,0) / effs.length;
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
    const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    if (data.length < 2) return;
    const effMap = calculateEfficiencies(data);
    const sorted = [...data].sort((a,b)=> new Date(a.startTime) - new Date(b.startTime));
    const chartData = sorted.map(r => ({ label: r.date ? r.date.slice(5) : r.startTime.slice(5,10), value: effMap[r.id] })).filter(d => d.value);
    if (charts.charge) charts.charge.destroy();
    const ctx = document.getElementById('chargeChart')?.getContext('2d');
    if (!ctx) return;
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
        options: { responsive: true, plugins: { legend: { display: true } } }
    });
}

function renderMaintChart() {
    const data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    if (!data.length) return;
    if (charts.maint) charts.maint.destroy();
    const ctx = document.getElementById('maintChart')?.getContext('2d');
    if (!ctx) return;
    charts.maint = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...data].reverse().map(d => d.date.slice(5)),
            datasets: [{ label: '保養費用 (NT$)', data: [...data].reverse().map(d=>d.totalCost), borderColor:'rgb(239,68,68)', backgroundColor:'rgba(239,68,68,0.1)', tension:0.4 }]
        },
        options: { responsive: true }
    });
}

function renderExpenseChart() {
    const data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    if (!data.length) return;
    if (charts.expense) charts.expense.destroy();
    const ctx = document.getElementById('expenseChart')?.getContext('2d');
    if (!ctx) return;
    charts.expense = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [...data].reverse().map(d => d.date.slice(5)),
            datasets: [{ label: '費用 (NT$)', data: [...data].reverse().map(d=>d.amount), backgroundColor:'rgba(16,185,129,0.5)', borderColor:'rgba(16,185,129,1)', borderWidth:2 }]
        },
        options: { responsive: true }
    });
}

function renderMonthlyChart() {
    const maint = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    const charge = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    const expense = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    const monthly = {};
    maint.forEach(m => { const mo = m.date.slice(0,7); monthly[mo] = (monthly[mo]||0) + (m.totalCost||0); });
    charge.forEach(c => { const mo = c.date.slice(0,7); monthly[mo] = (monthly[mo]||0) + (c.cost||0); });
    expense.forEach(e => { const mo = e.date.slice(0,7); monthly[mo] = (monthly[mo]||0) + (e.amount||0); });
    const months = Object.keys(monthly).sort();
    if (!months.length) return;
    if (charts.monthly) charts.monthly.destroy();
    const ctx = document.getElementById('monthlyChart')?.getContext('2d');
    if (!ctx) return;
    charts.monthly = new Chart(ctx, {
        type: 'line',
        data: { labels: months, datasets: [{ label: '月度總花費 (NT$)', data: months.map(m=>monthly[m]), borderColor:'rgb(139,92,246)', backgroundColor:'rgba(139,92,246,0.1)', tension:0.4, fill:true }]},
        options: { responsive: true }
    });
}

function renderCategoryChart() {
    const maint = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    const charge = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    const expense = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    const cat = { '保養':0, '充電':0 };
    maint.forEach(m => cat['保養'] += m.totalCost || 0);
    charge.forEach(c => cat['充電'] += c.cost || 0);
    expense.forEach(e => cat[e.category] = (cat[e.category]||0) + (e.amount||0));
    const categories = Object.keys(cat).filter(k => cat[k] > 0);
    if (!categories.length) return;
    if (charts.category) charts.category.destroy();
    const ctx = document.getElementById('categoryChart')?.getContext('2d');
    if (!ctx) return;
    charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: categories, datasets: [{ data: categories.map(k=>cat[k]), backgroundColor: [
            'rgba(239,68,68,0.8)','rgba(37,99,235,0.8)','rgba(245,158,11,0.8)','rgba(16,185,129,0.8)','rgba(139,92,246,0.8)','rgba(236,72,153,0.8)','rgba(100,116,139,0.8)'
        ]}]},
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// === Month filter population (Requirement 1: 預設僅顯示當月資料) ===
function populateMonthFilters() {
    // collect months from data
    const allData = [
        ...JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        ...JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        ...JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        ...JSON.parse(localStorage.getItem('statusLog') || '[]')
    ];
    const months = new Set();
    allData.forEach(r => { if (r.date) months.add(r.date.slice(0,7)); });
    const sorted = Array.from(months).sort().reverse();

    // default to current month (YYYY-MM)
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    ['chargeMonthFilter','maintMonthFilter','expenseMonthFilter','statusMonthFilter'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '<option value="">所有月份</option>';
        sorted.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            select.appendChild(opt);
        });
        // Requirement: charge/maint/expense default to current month
        if (['chargeMonthFilter','maintMonthFilter','expenseMonthFilter'].includes(id)) {
            // if current month exists in options, set it; otherwise leave empty
            const hasCur = Array.from(select.options).some(o => o.value === curMonth);
            if (hasCur) select.value = curMonth;
            else select.value = '';
        } else {
            select.value = '';
        }
    });
}

// === Import/Export/Clear ===
function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const imported = JSON.parse(evt.target.result);
            const sortFn = (a,b) => {
                const as = a.startTime ? a.startTime : (a.date ? a.date + 'T' + (a.time||'00:00') : '');
                const bs = b.startTime ? b.startTime : (b.date ? b.date + 'T' + (b.time||'00:00') : '');
                return new Date(bs) - new Date(as);
            };
            if (imported.type === 'all') {
                if (!confirm('確定要匯入完整資料嗎？這將會覆蓋現有的所有記錄。')) return;
                if (imported.chargeLog) { imported.chargeLog.sort(sortFn); localStorage.setItem('chargeLog', JSON.stringify(imported.chargeLog)); }
                if (imported.maintenanceLog) { imported.maintenanceLog.sort(sortFn); localStorage.setItem('maintenanceLog', JSON.stringify(imported.maintenanceLog)); }
                if (imported.expenseLog) { imported.expenseLog.sort(sortFn); localStorage.setItem('expenseLog', JSON.stringify(imported.expenseLog)); }
                if (imported.statusLog) { imported.statusLog.sort(sortFn); localStorage.setItem('statusLog', JSON.stringify(imported.statusLog)); }
                showToast('✅ 完整資料匯入成功');
            } else if (imported.type && Array.isArray(imported.data)) {
                if (!confirm('確定要匯入資料嗎？這將會覆蓋現有的同類型記錄。')) return;
                imported.data.sort(sortFn);
                localStorage.setItem(imported.type, JSON.stringify(imported.data));
                showToast('✅ 資料匯入成功');
            } else {
                showToast('❌ JSON 檔案格式不符', 'error');
                return;
            }
            populateMonthFilters();
            loadAllData();
        } catch (err) {
            showToast('❌ 讀取檔案失敗', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function exportAllData() {
    const allData = {
        type: 'all',
        version: '1.0',
        exportDate: new Date().toISOString(),
        chargeLog: JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        expenseLog: JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        statusLog: JSON.parse(localStorage.getItem('statusLog') || '[]')
    };
    downloadJSON(allData, `motorcycle_all_data_${new Date().toISOString().slice(0,10)}.json`);
    showToast('✅ 全部資料已匯出');
    localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0,10));
    checkBackupStatus();
}

function clearAllData() {
    if (!confirm('確定要清除所有資料嗎？此操作無法復原！')) return;
    if (!confirm('請再次確認：這將永久刪除所有記錄！')) return;
    localStorage.clear();
    populateMonthFilters();
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

// === Settings / autos ===
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (document.getElementById('electricRate')) document.getElementById('electricRate').value = settings.electricRate || '';
    return settings;
}

function saveSettings() {
    const rate = parseFloat(document.getElementById('electricRate')?.value) || 0;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ electricRate: rate }));
    showToast('✅ 設定已儲存');
}

function autoCalculateCost() {
    const settings = loadSettings();
    const rate = parseFloat(settings.electricRate) || 0;
    const costInput = document.getElementById('cCost');
    // 如果 costInput 為 readonly（表明在 家裡/公司）則自動計算
    if (costInput && costInput.readOnly) {
        const kwh = parseFloat(document.getElementById('cKwh')?.value) || 0;
        if (rate > 0 && kwh > 0) costInput.value = Math.round(kwh * rate);
        else costInput.value = '0';
    }
}

function checkBackupStatus() {
    const last = localStorage.getItem(BACKUP_KEY);
    const el = document.getElementById('backupWarning');
    if (!el) return;
    if (!last) { el.textContent = '您尚未備份過資料，建議立即匯出。'; el.style.display = 'block'; return; }
    const days = daysBetween(last, new Date().toISOString().slice(0,10));
    if (days > 30) { el.textContent = `您已 ${days} 天未備份，建議立即匯出。`; el.style.display = 'block'; }
    else el.style.display = 'none';
}

// === Maintenance helpers ===
function populateMaintTemplates() {
    const wrap = document.getElementById('maintTemplates');
    if (!wrap) return;
    wrap.innerHTML = '';
    MAINT_TEMPLATES.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary';
        btn.style.marginRight = '6px';
        btn.textContent = `${t.name} NT$${t.cost}`;
        btn.addEventListener('click', () => addPartItem(t.name, t.cost));
        wrap.appendChild(btn);
    });
}

function addPartItem(name = '', cost = 0) {
    const list = document.getElementById('partsList');
    if (!list) return;
    const id = Date.now() + Math.floor(Math.random()*1000);
    const div = document.createElement('div');
    div.className = 'part-item';
    div.dataset.id = id;
    div.innerHTML = `
        <input class="part-name" placeholder="項目/零件" value="${escapeHtml(name)}">
        <input class="part-cost" type="number" value="${cost}">
        <button type="button" class="btn btn-danger remove-part">刪除</button>
    `;
    list.appendChild(div);
    div.querySelector('.remove-part').addEventListener('click', () => { div.remove(); updateTotalCost(); });
    div.querySelector('.part-cost').addEventListener('input', updateTotalCost);
    updateTotalCost();
}

function updateTotalCost() {
    const costs = Array.from(document.querySelectorAll('.part-cost')).map(i => parseFloat(i.value) || 0);
    const total = costs.reduce((a,b)=>a+b,0);
    const el = document.getElementById('totalCost');
    if (el) el.textContent = total;
}

function saveMaintenance(e) {
    e.preventDefault();
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        parts.push({ name: item.querySelector('.part-name').value, cost: parseFloat(item.querySelector('.part-cost').value) || 0 });
    });
    const locSelect = document.getElementById('mLocationSelect')?.value || '';
    const locInput = document.getElementById('mLocationInput')?.value || '';
    const location = locSelect === '其他' ? locInput : locSelect;

    const editingId = document.getElementById('editingMaintId')?.value;
    const record = {
        id: editingId ? parseInt(editingId) : Date.now(),
        date: document.getElementById('mDate')?.value,
        time: document.getElementById('mTime')?.value,
        odo: parseFloat(document.getElementById('mOdo')?.value) || 0,
        location: location,
        type: document.getElementById('mType')?.value,
        notes: document.getElementById('mNotes')?.value,
        parts: parts,
        totalCost: parseFloat(document.getElementById('totalCost')?.textContent) || 0
    };
    saveData('maintenanceLog', record, !!editingId);
    cancelMaintEdit();
    populateMonthFilters();
    loadAllData();
    showToast('✅ 保養記錄已儲存');
}

function cancelMaintEdit() {
    document.getElementById('maintenanceForm')?.reset();
    document.getElementById('editingMaintId').value = '';
    document.getElementById('partsList').innerHTML = '';
    document.getElementById('maintTitle').textContent = '記錄保養';
    document.getElementById('cancelMaintEdit').style.display = 'none';
    document.getElementById('mLocationSelect').value = '基隆成功專賣店';
    const input = document.getElementById('mLocationInput');
    if (input) { input.value = ''; input.style.display = 'none'; }
    updateTotalCost();
    populateDateTime('mDate','mTime');
}

function saveExpense(e) {
    e.preventDefault();
    const editingId = document.getElementById('editingExpenseId')?.value;
    const record = {
        id: editingId ? parseInt(editingId) : Date.now(),
        date: document.getElementById('eDate')?.value,
        time: document.getElementById('eTime')?.value,
        odo: parseFloat(document.getElementById('eOdo')?.value) || 0,
        category: document.getElementById('eCategory')?.value,
        amount: parseFloat(document.getElementById('eAmount')?.value) || 0,
        description: document.getElementById('eDescription')?.value
    };
    saveData('expenseLog', record, !!editingId);
    cancelExpenseEdit();
    populateMonthFilters();
    loadAllData();
    showToast('✅ 費用記錄已儲存');
}

function cancelExpenseEdit() {
    document.getElementById('expenseForm')?.reset();
    document.getElementById('editingExpenseId').value = '';
    document.getElementById('expenseTitle').textContent = '記錄其他花費';
    document.getElementById('cancelExpenseEdit').style.display = 'none';
    populateDateTime('eDate','eTime');
}

// 用於「現在」按鈕填入日期+時間
function populateDateTime(dateFieldId, timeFieldId) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const dateEl = document.getElementById(dateFieldId);
    if (dateEl) dateEl.value = `${y}-${m}-${d}`;
    const timeEl = document.getElementById(timeFieldId);
    if (timeEl) timeEl.value = `${hh}:${mm}`;
}

function saveStatus(e) {
    e.preventDefault();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const record = {
        id: Date.now(),
        date: `${y}-${m}-${d}`,
        time: `${hh}:${mm}`,
        odo: parseFloat(document.getElementById('sOdo')?.value) || 0,
        battery: parseInt(document.querySelector('input[name="sBattery"]:checked')?.value || '1'),
        notes: document.getElementById('sNotes')?.value || ''
    };
    // statusLog 只保留最新一筆（快速更新目的）
    localStorage.setItem('statusLog', JSON.stringify([record]));
    if (document.getElementById('statusForm')) document.getElementById('statusForm').reset();
    document.querySelector('input[name="sBattery"][value="1"]')?.checked = true;
    populateMonthFilters();
    loadAllData();
    showToast('✅ 狀態已更新');
}

// === Prefill previous values (Requirement 5) ===
function prefillChargeDefaults() {
    // 使用最後一筆充電記錄以及最新的 status 來帶入預設
    const chargeData = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    const statusData = JSON.parse(localStorage.getItem('statusLog') || '[]');

    if (chargeData.length === 0 && statusData.length === 0) return;

    // 充電站：若最後一筆有 stationType，選取對應快速按鈕；若為其他則填文字欄位
    if (chargeData.length > 0) {
        const last = chargeData[0];
        if (last.stationType) {
            selectedStation = last.stationType;
            document.querySelectorAll('.station-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.station === selectedStation);
            });
            const input = document.getElementById('cStation');
            if (input) {
                if (selectedStation === '其他') { input.style.display = 'block'; input.value = last.station || ''; }
                else { input.style.display = 'none'; input.value = ''; }
            }
        } else {
            const input = document.getElementById('cStation');
            if (input) { input.style.display = 'block'; input.value = last.station || ''; }
        }

        // cOdo 預設帶入上次 odo（方便快速增加）
        const cOdo = document.getElementById('cOdo');
        if (cOdo && last.odo) cOdo.value = last.odo;

        // cBatteryStart 預設帶入上次 batteryEnd（若有）
        const startVal = last.batteryEnd != null ? last.batteryEnd : (last.batteryStart != null ? last.batteryStart : 1);
        const bsRadio = document.querySelector(`input[name="cBatteryStart"][value="${startVal}"]`);
        if (bsRadio) bsRadio.checked = true;

        // cBatteryEnd 預設帶入上次 batteryEnd 或 5
        const endVal = last.batteryEnd != null ? last.batteryEnd : 5;
        const beRadio = document.querySelector(`input[name="cBatteryEnd"][value="${endVal}"]`);
        if (beRadio) beRadio.checked = true;
    } else if (statusData.length > 0) {
        // 若沒有充電紀錄，使用 status 的電量作為快速更新和充電表單預設
        const s = statusData[0];
        const sb = document.querySelector(`input[name="sBattery"][value="${s.battery}"]`);
        if (sb) sb.checked = true;
        const cs = document.querySelector(`input[name="cBatteryStart"][value="${s.battery}"]`);
        if (cs) cs.checked = true;
    }

    // 快速更新的目前電量帶入 status 或 last charge 的 batteryEnd
    let statusBattery = null;
    if (statusData.length > 0) statusBattery = statusData[0].battery;
    else if (chargeData.length > 0) statusBattery = chargeData[0].batteryEnd;
    if (statusBattery != null) {
        const sb = document.querySelector(`input[name="sBattery"][value="${statusBattery}"]`);
        if (sb) sb.checked = true;
    }
}

// === Utilities ===
function formatDateTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString('zh-TW', { month: '2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function toLocalISO(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
