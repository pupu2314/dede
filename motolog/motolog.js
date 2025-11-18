/* motolog/motolog.js
   修正版（去除 optional chaining 與可疑語法）
   - 加入早期 console 訊息，並用 try/catch 包裹初始化
   - 不使用 "?.", 對 DOM 操作以 if(...) 保護
   - 保留功能：分頁、開始/結束充電、保養、費用、快速更新、匯入/匯出、圖表、預設帶入
*/

console.log('motolog.js (fixed): loaded');

const SETTINGS_KEY = 'motorcycleSettings';
const BACKUP_KEY = 'lastBackupDate';
const MAINT_TEMPLATES = [
    { name: '齒輪油', cost: 150 },
    { name: '前輪胎', cost: 1200 },
    { name: '後輪胎', cost: 1300 },
    { name: '空氣濾芯', cost: 350 },
    { name: '煞車油', cost: 400 }
];

const FIRST_SERVICE_KM = 300;
const FIRST_SERVICE_DAYS = 30;
const REGULAR_SERVICE_KM = 3000;
const REGULAR_SERVICE_DAYS = 180;

var chargeTimer = null;
var charts = {};
var selectedStation = '';

// 小型 helper：安全取得 element
function safe(id) {
    try {
        return document.getElementById(id);
    } catch (e) {
        return null;
    }
}

// 全域錯誤顯示（避免 script 安靜失敗）
window.onerror = function(message, source, lineno, colno, err) {
    console.error('Global error caught:', { message: message, source: source, lineno: lineno, colno: colno, err: err });
    try {
        var toast = safe('toast');
        if (toast) {
            toast.textContent = '錯誤: ' + message;
            toast.style.background = 'var(--danger)';
            toast.classList.add('show');
            setTimeout(function(){ toast.classList.remove('show'); }, 5000);
        }
    } catch (ex) {}
    return false;
};

document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('motolog.js (fixed): DOM ready');
        initEventListeners();
        populateMaintTemplates();
        populateMonthFilters();
        loadAllData();
        prefillChargeDefaults();
    } catch (err) {
        console.error('Initialization error:', err);
        showToast('初始化錯誤，請查看 Console', 'error');
    }
});

function initEventListeners() {
    // tabs
    var tabButtons = document.querySelectorAll('.tab-button');
    if (tabButtons) {
        tabButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                var allBtns = document.querySelectorAll('.tab-button');
                allBtns.forEach(function(b){ b.classList.remove('active'); });
                e.target.classList.add('active');
                var tabName = e.target.dataset.tab;
                var tabId = tabName + 'Tab';
                var allTabs = document.querySelectorAll('.tab-content');
                allTabs.forEach(function(tc){ tc.classList.remove('active'); });
                var target = document.getElementById(tabId);
                if (target) target.classList.add('active');
                if (tabId === 'settingsTab') loadSettings();
            });
        });
    }

    // station quick buttons
    var stationBtns = document.querySelectorAll('.station-btn');
    if (stationBtns) {
        stationBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var all = document.querySelectorAll('.station-btn');
                all.forEach(function(b){ b.classList.remove('active'); });
                btn.classList.add('active');
                selectedStation = btn.dataset.station || '';
                var input = safe('cStation');
                if (input) {
                    if (selectedStation === '其他') { input.style.display = 'block'; }
                    else { input.style.display = 'none'; input.value = ''; }
                }
            });
        });
    }

    // forms
    var sc = safe('startChargeForm'); if (sc) sc.addEventListener('submit', startCharging);
    var ec = safe('endChargeForm'); if (ec) ec.addEventListener('submit', endCharging);
    var mf = safe('maintenanceForm'); if (mf) mf.addEventListener('submit', saveMaintenance);
    var ef = safe('expenseForm'); if (ef) ef.addEventListener('submit', saveExpense);
    var sf = safe('statusForm'); if (sf) sf.addEventListener('submit', saveStatus);
    var editf = safe('editChargeForm'); if (editf) editf.addEventListener('submit', saveEditCharge);

    // settings & auto-calc
    var kwhInput = safe('cKwh'); if (kwhInput) kwhInput.addEventListener('input', autoCalculateCost);
    var saveSettingsBtn = safe('saveSettingsBtn'); if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    // maintenance helpers
    var addPartBtn = safe('addPartBtn'); if (addPartBtn) addPartBtn.addEventListener('click', function(){ addPartItem(); });
    var cancelMaintBtn = safe('cancelMaintEdit'); if (cancelMaintBtn) cancelMaintBtn.addEventListener('click', cancelMaintEdit);
    var cancelExpenseBtn = safe('cancelExpenseEdit'); if (cancelExpenseBtn) cancelExpenseBtn.addEventListener('click', cancelExpenseEdit);
    var closeEditModalBtn = safe('closeEditModal'); if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);

    // Now buttons
    var maintNowBtn = safe('maintNowBtn'); if (maintNowBtn) maintNowBtn.addEventListener('click', function(){ populateDateTime('mDate','mTime'); });
    var expenseNowBtn = safe('expenseNowBtn'); if (expenseNowBtn) expenseNowBtn.addEventListener('click', function(){ populateDateTime('eDate','eTime'); });

    // maintenance location select
    var mLocationSelect = safe('mLocationSelect');
    if (mLocationSelect) {
        mLocationSelect.addEventListener('change', function(e){
            var input = safe('mLocationInput');
            if (!input) return;
            if (e.target.value === '其他') { input.style.display = 'block'; }
            else { input.style.display = 'none'; input.value = ''; }
        });
    }

    // import/export/clear
    var importBtn = safe('importBtn'); if (importBtn) importBtn.addEventListener('click', function(){ var jf = safe('jsonImport'); if (jf) jf.click(); });
    var jsonImport = safe('jsonImport'); if (jsonImport) jsonImport.addEventListener('change', importData);
    var exportAllBtn = safe('exportAllBtn'); if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllData);
    var clearAllBtn = safe('clearAllBtn'); if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllData);

    // search & month filters
    var chargeSearch = safe('chargeSearch'); if (chargeSearch) chargeSearch.addEventListener('input', filterChargeTable);
    var chargeMonthFilter = safe('chargeMonthFilter'); if (chargeMonthFilter) chargeMonthFilter.addEventListener('change', function(){ loadChargeHistory(); filterChargeTable(); });

    var maintSearch = safe('maintSearch'); if (maintSearch) maintSearch.addEventListener('input', filterMaintTable);
    var maintMonthFilter = safe('maintMonthFilter'); if (maintMonthFilter) maintMonthFilter.addEventListener('change', function(){ loadMaintenanceHistory(); filterMaintTable(); });
    var maintTypeFilter = safe('maintTypeFilter'); if (maintTypeFilter) maintTypeFilter.addEventListener('change', filterMaintTable);

    var expenseCategoryFilter = safe('expenseCategoryFilter'); if (expenseCategoryFilter) expenseCategoryFilter.addEventListener('change', filterExpenseTable);
    var expenseMonthFilter = safe('expenseMonthFilter'); if (expenseMonthFilter) expenseMonthFilter.addEventListener('change', function(){ loadExpenseHistory(); filterExpenseTable(); });

    var statusMonthFilter = safe('statusMonthFilter'); if (statusMonthFilter) statusMonthFilter.addEventListener('change', filterStatusTable);
}

function showToast(message, type) {
    type = type || 'success';
    var toast = safe('toast');
    if (!toast) {
        console.log('TOAST:', message);
        return;
    }
    toast.textContent = message;
    toast.style.background = (type === 'success') ? 'var(--success)' : 'var(--danger)';
    toast.classList.add('show');
    setTimeout(function(){ toast.classList.remove('show'); }, 3000);
}

// === Charging session ===
function startCharging(e) {
    try {
        e.preventDefault();
        var input = safe('cStation');
        var station = '';
        if (selectedStation === '其他') {
            if (input) station = input.value || '';
        } else {
            station = selectedStation || '';
        }
        if (!station) { showToast('請選擇充電站', 'error'); return; }
        var odoEl = safe('cOdo');
        var odoVal = 0;
        if (odoEl) odoVal = parseFloat(odoEl.value) || 0;
        var batteryStartRadio = document.querySelector('input[name="cBatteryStart"]:checked');
        var batteryStart = batteryStartRadio ? parseInt(batteryStartRadio.value) : 1;
        var session = {
            id: Date.now(),
            startTime: new Date().toISOString(),
            odo: odoVal,
            batteryStart: batteryStart,
            station: station,
            stationType: selectedStation || '其他',
            notes: (safe('cNotes') ? safe('cNotes').value : '')
        };
        localStorage.setItem('currentChargingSession', JSON.stringify(session));
        if (safe('startChargeForm')) safe('startChargeForm').reset();
        selectedStation = '';
        var all = document.querySelectorAll('.station-btn'); if (all) all.forEach(function(b){ b.classList.remove('active'); });
        updateChargeUI();
        showToast('⚡ 充電已開始');
    } catch (err) {
        console.error('startCharging error', err);
        showToast('開始充電失敗', 'error');
    }
}

function endCharging(e) {
    try {
        e.preventDefault();
        if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
        var session = JSON.parse(localStorage.getItem('currentChargingSession') || 'null');
        if (!session) { showToast('沒有進行中的充電', 'error'); return; }
        var endTime = new Date();
        var startTime = new Date(session.startTime);
        var diff = endTime - startTime;
        var hours = Math.floor(diff / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);
        var batteryEndRadio = document.querySelector('input[name="cBatteryEnd"]:checked');
        var batteryEnd = batteryEndRadio ? parseInt(batteryEndRadio.value) : 5;
        var kwh = safe('cKwh') ? parseFloat(safe('cKwh').value) || 0 : 0;
        var cost = safe('cCost') ? parseFloat(safe('cCost').value) || 0 : 0;
        var range = safe('cRange') ? parseFloat(safe('cRange').value) || 0 : 0;
        var record = {
            id: session.id,
            startTime: session.startTime,
            endTime: endTime.toISOString(),
            date: session.startTime.slice(0,10),
            duration: hours + '小時 ' + minutes + '分',
            odo: session.odo,
            station: session.station,
            stationType: session.stationType,
            batteryStart: session.batteryStart,
            batteryEnd: batteryEnd,
            kwh: kwh,
            cost: cost,
            range: range,
            notes: session.notes
        };
        saveData('chargeLog', record);
        localStorage.removeItem('currentChargingSession');
        if (safe('endChargeForm')) safe('endChargeForm').reset();
        updateChargeUI();
        loadAllData();
        showToast('✅ 充電記錄已儲存');
    } catch (err) {
        console.error('endCharging error', err);
        showToast('結束充電失敗', 'error');
    }
}

function updateChargeUI() {
    try {
        var session = JSON.parse(localStorage.getItem('currentChargingSession') || 'null');
        var startSection = safe('startChargeSection');
        var endSection = safe('endChargeSection');
        if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
        if (session) {
            if (startSection) startSection.style.display = 'none';
            if (endSection) endSection.style.display = 'block';
            var currentInfo = safe('currentChargeInfo');
            if (currentInfo) {
                currentInfo.innerHTML = '<p><strong>開始時間:</strong> ' + formatDateTime(session.startTime) + '</p>'
                    + '<p><strong>開始里程:</strong> ' + session.odo + ' km</p>'
                    + '<p><strong>開始電量:</strong> ' + session.batteryStart + ' 格</p>'
                    + '<p><strong>充電站:</strong> ' + session.station + '</p>';
            }
            var kwhInput = safe('cKwh');
            var costInput = safe('cCost');
            if (kwhInput) { kwhInput.value = ''; kwhInput.readOnly = false; kwhInput.required = false; }
            if (costInput) { costInput.value = ''; costInput.readOnly = false; costInput.required = false; }
            if (session.stationType === '公司' || session.stationType === '家裡') {
                var settings = loadSettings();
                if (settings && settings.electricRate && settings.electricRate > 0) {
                    if (costInput) costInput.readOnly = true;
                }
            }
            var timerEl = safe('chargingTimer');
            if (timerEl) {
                var start = new Date(session.startTime);
                function updateTimer() {
                    var now = new Date();
                    var diff2 = now - start;
                    var h = String(Math.floor(diff2 / 3600000)).padStart(2,'0');
                    var m = String(Math.floor((diff2 % 3600000) / 60000)).padStart(2,'0');
                    var s = String(Math.floor((diff2 % 60000) / 1000)).padStart(2,'0');
                    timerEl.textContent = h + ':' + m + ':' + s;
                }
                updateTimer();
                chargeTimer = setInterval(updateTimer, 1000);
            }
        } else {
            if (startSection) startSection.style.display = 'block';
            if (endSection) endSection.style.display = 'none';
            prefillChargeDefaults();
        }
    } catch (err) {
        console.error('updateChargeUI error', err);
    }
}

// --- Storage helpers ---
function saveData(key, record, isEdit) {
    try {
        isEdit = !!isEdit;
        var data = JSON.parse(localStorage.getItem(key) || '[]');
        if (isEdit) {
            var idx = -1;
            for (var i=0;i<data.length;i++){ if (data[i].id === record.id) { idx = i; break; } }
            if (idx !== -1) data[idx] = record; else data.push(record);
        } else {
            data.push(record);
        }
        data.sort(function(a,b){
            var as = a.startTime ? a.startTime : (a.date ? a.date + 'T' + (a.time || '00:00') : '');
            var bs = b.startTime ? b.startTime : (b.date ? b.date + 'T' + (b.time || '00:00') : '');
            return new Date(bs) - new Date(as);
        });
        localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
        console.error('saveData error', err);
    }
}

function loadAllData() {
    try {
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
    } catch (err) {
        console.error('loadAllData error', err);
    }
}

// --- Dashboard & analytics ---
function updateDashboard() {
    try {
        var maintData = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        var chargeData = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        var expenseData = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        var statusData = JSON.parse(localStorage.getItem('statusLog') || '[]');
        var odos = [];
        [chargeData, maintData, expenseData, statusData].forEach(function(arr){
            arr.forEach(function(d){ if (d && d.odo && d.odo > 0) odos.push(d.odo); });
        });
        var totalMileage = odos.length ? Math.max.apply(null, odos) : 0;
        if (safe('totalMileage')) safe('totalMileage').textContent = totalMileage.toFixed(1);

        var totalExpense = 0;
        maintData.forEach(function(m){ totalExpense += m.totalCost || 0; });
        chargeData.forEach(function(c){ totalExpense += c.cost || 0; });
        expenseData.forEach(function(e){ totalExpense += e.amount || 0; });
        if (safe('totalExpense')) safe('totalExpense').textContent = totalExpense.toFixed(0);

        if (chargeData.length > 0) {
            var last = chargeData[0];
            var daysAgo = daysBetween(last.date, new Date().toISOString().slice(0,10));
            if (safe('lastChargeDays')) safe('lastChargeDays').textContent = (daysAgo === 0 ? '今天' : daysAgo + '天前');
            var kmSince = totalMileage - last.odo;
            if (safe('lastChargeDate')) safe('lastChargeDate').textContent = (kmSince > 0 && last.odo > 0) ? (last.date + ' (已騎乘 ' + kmSince.toFixed(1) + ' km)') : last.date;
        }

        var regularMaint = maintData.filter(function(m){ return m.type === '定期保養'; });
        if (regularMaint.length === 0) {
            var kmLeft = FIRST_SERVICE_KM - totalMileage;
            if (kmLeft > 0) {
                if (safe('nextServiceKm')) safe('nextServiceKm').textContent = kmLeft.toFixed(0) + ' km';
                if (safe('nextServiceDate')) safe('nextServiceDate').textContent = '首次保養';
            } else {
                if (safe('nextServiceKm')) safe('nextServiceKm').textContent = '已超過';
                if (safe('nextServiceDate')) safe('nextServiceDate').textContent = '請盡快保養';
            }
        } else {
            var lastm = regularMaint[0];
            var kmSince = totalMileage - lastm.odo;
            var kmLeft = REGULAR_SERVICE_KM - kmSince;
            var daysAgo2 = daysBetween(lastm.date, new Date().toISOString().slice(0,10));
            var daysLeft = REGULAR_SERVICE_DAYS - daysAgo2;
            if (kmLeft > 0 && daysLeft > 0) {
                if (safe('nextServiceKm')) safe('nextServiceKm').textContent = kmLeft.toFixed(0) + ' km';
                if (safe('nextServiceDate')) safe('nextServiceDate').textContent = '或 ' + daysLeft + ' 天後';
            } else {
                if (safe('nextServiceKm')) safe('nextServiceKm').textContent = '已超過';
                if (safe('nextServiceDate')) safe('nextServiceDate').textContent = '請盡快保養';
            }
        }

        if (safe('statTotalMileage')) safe('statTotalMileage').textContent = totalMileage.toFixed(1) + ' km';
        if (safe('statTotalCost')) safe('statTotalCost').textContent = totalExpense.toFixed(0) + ' NT$';
        if (safe('statMaintCount')) safe('statMaintCount').textContent = maintData.length;
        if (safe('statChargeCount')) safe('statChargeCount').textContent = chargeData.length;
        if (totalMileage > 0 && safe('statCostPerKm')) safe('statCostPerKm').textContent = (totalExpense / totalMileage).toFixed(2) + ' NT$';

        var allRecords = [].concat(chargeData, maintData, expenseData, statusData).filter(function(d){ return d && d.date; }).sort(function(a,b){ return new Date(a.date) - new Date(b.date); });
        if (allRecords.length > 1 && safe('statAvgDaily')) {
            var days = daysBetween(allRecords[0].date, new Date().toISOString().slice(0,10)) || 1;
            var avgDaily = totalMileage / days;
            safe('statAvgDaily').textContent = avgDaily.toFixed(1) + ' km';
        }
    } catch (err) {
        console.error('updateDashboard error', err);
    }
}

function daysBetween(date1, date2) {
    try {
        var d1 = new Date(date1);
        var d2 = new Date(date2);
        return Math.round(Math.abs((d2 - d1) / 86400000));
    } catch (e) { return 0; }
}

// --- History renders (charge table simplified, details collapsed) ---
function loadChargeHistory() {
    try {
        var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        var tbody = safe('chargeTable');
        if (!tbody) return;
        tbody.innerHTML = '';
        var effMap = calculateEfficiencies(data);
        var monthFilter = safe('chargeMonthFilter') ? safe('chargeMonthFilter').value : '';
        var filtered = [];
        if (monthFilter) {
            for (var i=0;i<data.length;i++){ if (data[i] && data[i].date && data[i].date.slice(0,7) === monthFilter) filtered.push(data[i]); }
        } else {
            filtered = data.slice();
        }
        filtered.forEach(function(record) {
            var row = tbody.insertRow();
            var eff = effMap[record.id] || '-';
            var dateLabel = record.date ? record.date.slice(5) : (record.startTime ? record.startTime.slice(5,10) : '-');
            var detailsHTML = '<details><summary style="cursor:pointer">' + dateLabel + '</summary>'
                + '<div style="margin-top:8px; font-size:0.95rem; color:var(--secondary);">'
                + '<div><strong>期間:</strong> ' + formatDateTime(record.startTime) + ' ～ ' + formatDateTime(record.endTime) + '</div>'
                + '<div><strong>費用:</strong> ' + (record.cost || '-') + ' NT$</div>'
                + '<div><strong>效率:</strong> ' + eff + '</div>'
                + '<div><strong>電量:</strong> ' + (record.batteryStart) + ' → ' + (record.batteryEnd) + ' 格</div>'
                + '<div><strong>度數:</strong> ' + (record.kwh || '-') + ' kWh</div>'
                + '<div><strong>估計里程:</strong> ' + (record.range || '-') + ' km</div>'
                + '<div><strong>備註:</strong> ' + (record.notes || '-') + '</div>'
                + '</div></details>';
            row.innerHTML = '<td>' + detailsHTML + '</td><td>' + (record.station || '-') + '</td><td>' + (record.duration || '-') + '</td><td class="action-btns"><button class="btn btn-warning" onclick="editCharge(' + record.id + ')">編輯</button> <button class="btn btn-danger" onclick="deleteRecord(\'chargeLog\',' + record.id + ')">刪除</button></td>';
        });
    } catch (err) {
        console.error('loadChargeHistory error', err);
    }
}

function calculateEfficiencies(data) {
    try {
        var sorted = data.slice().sort(function(a,b){ return new Date(a.startTime) - new Date(b.startTime); });
        var effMap = {};
        for (var i=1;i<sorted.length;i++){
            var curr = sorted[i], prev = sorted[i-1];
            var mileage = curr.odo - prev.odo;
            var kwh = curr.kwh;
            if (mileage > 0 && kwh > 0) effMap[curr.id] = (mileage / kwh).toFixed(2);
        }
        return effMap;
    } catch (err) {
        console.error('calculateEfficiencies error', err);
        return {};
    }
}

function loadMaintenanceHistory() {
    try {
        var data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        var tbody = safe('maintTable'); if (!tbody) return;
        tbody.innerHTML = '';
        var monthFilter = safe('maintMonthFilter') ? safe('maintMonthFilter').value : '';
        var filtered = [];
        if (monthFilter) {
            for (var i=0;i<data.length;i++){ if (data[i] && data[i].date && data[i].date.slice(0,7) === monthFilter) filtered.push(data[i]); }
        } else filtered = data.slice();
        filtered.forEach(function(record){
            var row = tbody.insertRow();
            var items = (record.parts && record.parts.length) ? record.parts.map(function(p){ return p.name; }).join(', ') : (record.notes || '-');
            if (items.length > 30) items = items.substring(0,30) + '...';
            row.innerHTML = '<td>' + record.date.slice(5) + '</td><td>' + record.odo + '</td><td>' + record.type + '</td><td>' + items + '</td><td>' + record.totalCost + '</td><td class="action-btns"><button class="btn btn-warning" onclick="editMaintenance(' + record.id + ')">編輯</button> <button class="btn btn-danger" onclick="deleteRecord(\'maintenanceLog\',' + record.id + ')">刪除</button></td>';
        });
    } catch (err) {
        console.error('loadMaintenanceHistory error', err);
    }
}

function loadExpenseHistory() {
    try {
        var data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        var tbody = safe('expenseTable'); if (!tbody) return;
        tbody.innerHTML = '';
        var monthFilter = safe('expenseMonthFilter') ? safe('expenseMonthFilter').value : '';
        var filtered = [];
        if (monthFilter) {
            for (var i=0;i<data.length;i++){ if (data[i] && data[i].date && data[i].date.slice(0,7) === monthFilter) filtered.push(data[i]); }
        } else filtered = data.slice();
        filtered.forEach(function(record){
            var row = tbody.insertRow();
            row.innerHTML = '<td>' + record.date.slice(5) + '</td><td>' + record.category + '</td><td>' + record.amount + '</td><td>' + (record.description || '-') + '</td><td class="action-btns"><button class="btn btn-warning" onclick="editExpense(' + record.id + ')">編輯</button> <button class="btn btn-danger" onclick="deleteRecord(\'expenseLog\',' + record.id + ')">刪除</button></td>';
        });
    } catch (err) {
        console.error('loadExpenseHistory error', err);
    }
}

function loadStatusHistory() {
    try {
        var data = JSON.parse(localStorage.getItem('statusLog') || '[]');
        var tbody = safe('statusTable'); if (!tbody) return;
        tbody.innerHTML = '';
        data.forEach(function(record){
            var row = tbody.insertRow();
            row.innerHTML = '<td>' + record.date.slice(5) + '</td><td>' + record.time + '</td><td>' + record.odo + '</td><td>' + record.battery + '</td><td>' + (record.notes || '-') + '</td>';
        });
    } catch (err) {
        console.error('loadStatusHistory error', err);
    }
}

// --- Edit / Save functions ---
window.editCharge = function(id) {
    try {
        var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        var rec = data.find(function(r){ return r.id === id; });
        if (!rec) return;
        if (safe('editingChargeId')) safe('editingChargeId').value = rec.id;
        if (safe('edit_cStartTime')) safe('edit_cStartTime').value = toLocalISO(rec.startTime);
        if (safe('edit_cEndTime')) safe('edit_cEndTime').value = toLocalISO(rec.endTime);
        if (safe('edit_cOdo')) safe('edit_cOdo').value = rec.odo;
        if (safe('edit_cStation')) safe('edit_cStation').value = rec.station || '';
        if (safe('edit_cBatteryStart')) safe('edit_cBatteryStart').value = rec.batteryStart || '';
        if (safe('edit_cBatteryEnd')) safe('edit_cBatteryEnd').value = rec.batteryEnd || '';
        if (safe('edit_cKwh')) safe('edit_cKwh').value = rec.kwh || '';
        if (safe('edit_cCost')) safe('edit_cCost').value = rec.cost || '';
        if (safe('edit_cNotes')) safe('edit_cNotes').value = rec.notes || '';
        if (safe('editChargeModal')) safe('editChargeModal').classList.add('active');
    } catch (err) { console.error('editCharge error', err); }
};

function saveEditCharge(e) {
    try {
        e.preventDefault();
        var id = parseInt(safe('editingChargeId') ? safe('editingChargeId').value : 0);
        var startTime = new Date(safe('edit_cStartTime') ? safe('edit_cStartTime').value : '');
        var endTime = new Date(safe('edit_cEndTime') ? safe('edit_cEndTime').value : '');
        var diff = endTime - startTime;
        var hours = Math.floor(diff / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);
        var record = {
            id: id,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            date: startTime.toISOString().slice(0,10),
            duration: hours + '小時 ' + minutes + '分',
            odo: parseFloat(safe('edit_cOdo') ? safe('edit_cOdo').value : 0) || 0,
            station: safe('edit_cStation') ? safe('edit_cStation').value : '',
            batteryStart: parseInt(safe('edit_cBatteryStart') ? safe('edit_cBatteryStart').value : 0) || 0,
            batteryEnd: parseInt(safe('edit_cBatteryEnd') ? safe('edit_cBatteryEnd').value : 0) || 0,
            kwh: parseFloat(safe('edit_cKwh') ? safe('edit_cKwh').value : 0) || 0,
            cost: parseFloat(safe('edit_cCost') ? safe('edit_cCost').value : 0) || 0,
            notes: safe('edit_cNotes') ? safe('edit_cNotes').value : '',
            range: 0
        };
        saveData('chargeLog', record, true);
        closeEditModal();
        loadAllData();
        showToast('✅ 充電記錄已更新');
    } catch (err) { console.error('saveEditCharge error', err); showToast('儲存編輯失敗', 'error'); }
}

function closeEditModal() {
    var modal = safe('editChargeModal');
    if (modal) modal.classList.remove('active');
}

window.editMaintenance = function(id) {
    try {
        var data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        var rec = data.find(function(r){ return r.id === id; });
        if (!rec) return;
        if (safe('editingMaintId')) safe('editingMaintId').value = rec.id;
        if (safe('mDate')) safe('mDate').value = rec.date;
        if (safe('mTime')) safe('mTime').value = rec.time;
        if (safe('mOdo')) safe('mOdo').value = rec.odo;
        var locSelect = safe('mLocationSelect');
        var locInput = safe('mLocationInput');
        if (locSelect) {
            if (rec.location === '基隆成功專賣店') {
                locSelect.value = '基隆成功專賣店';
                if (locInput) { locInput.style.display = 'none'; locInput.value = ''; }
            } else {
                locSelect.value = '其他';
                if (locInput) { locInput.style.display = 'block'; locInput.value = rec.location || ''; }
            }
        }
        if (safe('mType')) safe('mType').value = rec.type;
        if (safe('mNotes')) safe('mNotes').value = rec.notes || '';
        if (safe('partsList')) safe('partsList').innerHTML = '';
        if (rec.parts) rec.parts.forEach(function(p){ addPartItem(p.name, p.cost); });
        updateTotalCost();
        if (safe('maintTitle')) safe('maintTitle').textContent = '編輯保養記錄';
        if (safe('cancelMaintEdit')) safe('cancelMaintEdit').style.display = 'block';
        var tabBtn = document.querySelector('[data-tab="maintenance"]');
        if (tabBtn) tabBtn.click();
        window.scrollTo(0,0);
    } catch (err) { console.error('editMaintenance error', err); }
};

window.editExpense = function(id) {
    try {
        var data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        var rec = data.find(function(r){ return r.id === id; });
        if (!rec) return;
        if (safe('editingExpenseId')) safe('editingExpenseId').value = rec.id;
        if (safe('eDate')) safe('eDate').value = rec.date;
        if (safe('eTime')) safe('eTime').value = rec.time;
        if (safe('eOdo')) safe('eOdo').value = rec.odo || '';
        if (safe('eCategory')) safe('eCategory').value = rec.category || '';
        if (safe('eAmount')) safe('eAmount').value = rec.amount || '';
        if (safe('eDescription')) safe('eDescription').value = rec.description || '';
        if (safe('expenseTitle')) safe('expenseTitle').textContent = '編輯費用記錄';
        if (safe('cancelExpenseEdit')) safe('cancelExpenseEdit').style.display = 'block';
        var tabBtn = document.querySelector('[data-tab="expense"]');
        if (tabBtn) tabBtn.click();
        window.scrollTo(0,0);
    } catch (err) { console.error('editExpense error', err); }
};

window.deleteRecord = function(key, id) {
    try {
        if (!confirm('確定要刪除這筆記錄嗎？此操作無法復原。')) return;
        var data = JSON.parse(localStorage.getItem(key) || '[]');
        data = data.filter(function(d){ return d.id !== id; });
        localStorage.setItem(key, JSON.stringify(data));
        loadAllData();
        showToast('🗑️ 記錄已刪除');
    } catch (err) { console.error('deleteRecord error', err); }
};

// --- Filters ---
function filterChargeTable() {
    try {
        var search = safe('chargeSearch') ? safe('chargeSearch').value.toLowerCase() : '';
        var month = safe('chargeMonthFilter') ? safe('chargeMonthFilter').value : '';
        var rows = safe('chargeTable') ? safe('chargeTable').rows : [];
        for (var i=0;i<rows.length;i++){
            var row = rows[i];
            var text = row.textContent.toLowerCase();
            var matchSearch = text.indexOf(search) !== -1;
            var matchMonth = !month || text.indexOf(month) !== -1;
            row.style.display = (matchSearch && matchMonth) ? '' : 'none';
        }
    } catch (err) { console.error('filterChargeTable error', err); }
}

function filterMaintTable() {
    try {
        var search = safe('maintSearch') ? safe('maintSearch').value.toLowerCase() : '';
        var month = safe('maintMonthFilter') ? safe('maintMonthFilter').value : '';
        var type = safe('maintTypeFilter') ? safe('maintTypeFilter').value : '';
        var rows = safe('maintTable') ? safe('maintTable').rows : [];
        for (var i=0;i<rows.length;i++){
            var row = rows[i];
            var text = row.textContent.toLowerCase();
            var matchSearch = text.indexOf(search) !== -1;
            var matchMonth = !month || text.indexOf(month) !== -1;
            var matchType = !type || row.cells[2].textContent === type;
            row.style.display = (matchSearch && matchMonth && matchType) ? '' : 'none';
        }
    } catch (err) { console.error('filterMaintTable error', err); }
}

function filterExpenseTable() {
    try {
        var category = safe('expenseCategoryFilter') ? safe('expenseCategoryFilter').value : '';
        var month = safe('expenseMonthFilter') ? safe('expenseMonthFilter').value : '';
        var rows = safe('expenseTable') ? safe('expenseTable').rows : [];
        for (var i=0;i<rows.length;i++){
            var row = rows[i];
            var matchCategory = !category || row.cells[1].textContent === category;
            var matchMonth = !month || row.textContent.indexOf(month) !== -1;
            row.style.display = (matchCategory && matchMonth) ? '' : 'none';
        }
    } catch (err) { console.error('filterExpenseTable error', err); }
}

function filterStatusTable() {
    try {
        var month = safe('statusMonthFilter') ? safe('statusMonthFilter').value : '';
        var rows = safe('statusTable') ? safe('statusTable').rows : [];
        for (var i=0;i<rows.length;i++){
            var row = rows[i];
            var matchMonth = !month || row.textContent.indexOf(month) !== -1;
            row.style.display = matchMonth ? '' : 'none';
        }
    } catch (err) { console.error('filterStatusTable error', err); }
}

// --- Analytics / Charts ---
function updateAnalytics() {
    try {
        var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        if (safe('totalCharges')) safe('totalCharges').textContent = data.length;
        var effMap = calculateEfficiencies(data);
        var effs = Object.keys(effMap).map(function(k){ return parseFloat(effMap[k]); });
        if (effs.length > 0) {
            var sum = effs.reduce(function(a,b){ return a+b; }, 0);
            var avg = sum / effs.length;
            if (safe('avgEfficiency')) safe('avgEfficiency').textContent = avg.toFixed(2) + ' km/kWh';
            if (safe('bestEfficiency')) safe('bestEfficiency').textContent = Math.max.apply(null, effs).toFixed(2) + ' km/kWh';
            if (safe('worstEfficiency')) safe('worstEfficiency').textContent = Math.min.apply(null, effs).toFixed(2) + ' km/kWh';
        } else {
            if (safe('avgEfficiency')) safe('avgEfficiency').textContent = '-';
            if (safe('bestEfficiency')) safe('bestEfficiency').textContent = '-';
            if (safe('worstEfficiency')) safe('worstEfficiency').textContent = '-';
        }
    } catch (err) { console.error('updateAnalytics error', err); }
}

function renderCharts() {
    try {
        renderChargeChart();
        renderMaintChart();
        renderExpenseChart();
        renderMonthlyChart();
        renderCategoryChart();
    } catch (err) { console.error('renderCharts error', err); }
}

function renderChargeChart() {
    try {
        var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        if (data.length < 2) return;
        var effMap = calculateEfficiencies(data);
        var sorted = data.slice().sort(function(a,b){ return new Date(a.startTime) - new Date(b.startTime); });
        var chartData = [];
        for (var i=0;i<sorted.length;i++){
            var r = sorted[i];
            if (effMap[r.id]) chartData.push({ label: r.date ? r.date.slice(5) : r.startTime.slice(5,10), value: effMap[r.id] });
        }
        if (charts.charge) charts.charge.destroy();
        var ctxEl = safe('chargeChart');
        if (!ctxEl) return;
        var ctx = ctxEl.getContext('2d');
        charts.charge = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(function(d){ return d.label; }),
                datasets: [{ label: '效率 (km/kWh)', data: chartData.map(function(d){ return d.value; }), backgroundColor: 'rgba(37,99,235,0.5)', borderColor:'rgba(37,99,235,1)', borderWidth:2 }]
            },
            options: { responsive: true }
        });
    } catch (err) { console.error('renderChargeChart error', err); }
}

function renderMaintChart() {
    try {
        var data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        if (!data.length) return;
        if (charts.maint) charts.maint.destroy();
        var ctxEl = safe('maintChart'); if (!ctxEl) return;
        var ctx = ctxEl.getContext('2d');
        charts.maint = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.slice().reverse().map(function(d){ return d.date.slice(5); }),
                datasets: [{ label:'保養費用 (NT$)', data: data.slice().reverse().map(function(d){ return d.totalCost; }), borderColor:'rgb(239,68,68)', backgroundColor:'rgba(239,68,68,0.1)', tension:0.4 }]
            },
            options: { responsive: true }
        });
    } catch (err) { console.error('renderMaintChart error', err); }
}

function renderExpenseChart() {
    try {
        var data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        if (!data.length) return;
        if (charts.expense) charts.expense.destroy();
        var ctxEl = safe('expenseChart'); if (!ctxEl) return;
        var ctx = ctxEl.getContext('2d');
        charts.expense = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.slice().reverse().map(function(d){ return d.date.slice(5); }),
                datasets: [{ label:'費用 (NT$)', data: data.slice().reverse().map(function(d){ return d.amount; }), backgroundColor:'rgba(16,185,129,0.5)', borderColor:'rgba(16,185,129,1)', borderWidth:2 }]
            },
            options: { responsive: true }
        });
    } catch (err) { console.error('renderExpenseChart error', err); }
}

function renderMonthlyChart() {
    try {
        var maint = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        var charge = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        var expense = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        var monthly = {};
        maint.forEach(function(m){ var mo = m.date.slice(0,7); monthly[mo] = (monthly[mo]||0) + (m.totalCost||0); });
        charge.forEach(function(c){ var mo = c.date.slice(0,7); monthly[mo] = (monthly[mo]||0) + (c.cost||0); });
        expense.forEach(function(e){ var mo = e.date.slice(0,7); monthly[mo] = (monthly[mo]||0) + (e.amount||0); });
        var months = Object.keys(monthly).sort();
        if (!months.length) return;
        if (charts.monthly) charts.monthly.destroy();
        var ctxEl = safe('monthlyChart'); if (!ctxEl) return;
        var ctx = ctxEl.getContext('2d');
        charts.monthly = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{ label:'月度總花費 (NT$)', data: months.map(function(m){ return monthly[m]; }), borderColor:'rgb(139,92,246)', backgroundColor:'rgba(139,92,246,0.1)', tension:0.4, fill:true }]
            },
            options: { responsive: true }
        });
    } catch (err) { console.error('renderMonthlyChart error', err); }
}

function renderCategoryChart() {
    try {
        var maint = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        var charge = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        var expense = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        var cat = { '保養':0, '充電':0 };
        maint.forEach(function(m){ cat['保養'] += m.totalCost || 0; });
        charge.forEach(function(c){ cat['充電'] += c.cost || 0; });
        expense.forEach(function(e){ cat[e.category] = (cat[e.category]||0) + (e.amount||0); });
        var categories = Object.keys(cat).filter(function(k){ return cat[k] > 0; });
        if (!categories.length) return;
        if (charts.category) charts.category.destroy();
        var ctxEl = safe('categoryChart'); if (!ctxEl) return;
        var ctx = ctxEl.getContext('2d');
        charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categories,
                datasets: [{ data: categories.map(function(k){ return cat[k]; }), backgroundColor:['rgba(239,68,68,0.8)','rgba(37,99,235,0.8)','rgba(245,158,11,0.8)','rgba(16,185,129,0.8)','rgba(139,92,246,0.8)','rgba(236,72,153,0.8)','rgba(100,116,139,0.8)'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    } catch (err) { console.error('renderCategoryChart error', err); }
}

// --- Month filters (預設當月顯示) ---
function populateMonthFilters() {
    try {
        var allData = [].concat(
            JSON.parse(localStorage.getItem('chargeLog') || '[]'),
            JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
            JSON.parse(localStorage.getItem('expenseLog') || '[]'),
            JSON.parse(localStorage.getItem('statusLog') || '[]')
        );
        var monthsSet = {};
        allData.forEach(function(r){ if (r && r.date) monthsSet[r.date.slice(0,7)] = true; });
        var months = Object.keys(monthsSet).sort().reverse();
        var now = new Date();
        var curMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
        ['chargeMonthFilter','maintMonthFilter','expenseMonthFilter','statusMonthFilter'].forEach(function(id){
            var select = safe(id);
            if (!select) return;
            select.innerHTML = '<option value="">所有月份</option>';
            months.forEach(function(m){ var opt = document.createElement('option'); opt.value = m; opt.textContent = m; select.appendChild(opt); });
            if (id === 'chargeMonthFilter' || id === 'maintMonthFilter' || id === 'expenseMonthFilter') {
                var hasCur = false;
                for (var i=0;i<select.options.length;i++){ if (select.options[i].value === curMonth) { hasCur = true; break; } }
                select.value = hasCur ? curMonth : '';
            } else {
                select.value = '';
            }
        });
    } catch (err) { console.error('populateMonthFilters error', err); }
}

// --- Import / Export / Clear ---
function importData(e) {
    try {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
            try {
                var imported = JSON.parse(evt.target.result);
                var sortFn = function(a,b){
                    var as = a.startTime ? a.startTime : (a.date ? a.date + 'T' + (a.time || '00:00') : '');
                    var bs = b.startTime ? b.startTime : (b.date ? b.date + 'T' + (b.time || '00:00') : '');
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
                console.error('import parse error', err);
                showToast('❌ 讀取檔案失敗', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    } catch (err) { console.error('importData error', err); }
}

function exportAllData() {
    try {
        var allData = {
            type: 'all',
            version: '1.0',
            exportDate: new Date().toISOString(),
            chargeLog: JSON.parse(localStorage.getItem('chargeLog') || '[]'),
            maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
            expenseLog: JSON.parse(localStorage.getItem('expenseLog') || '[]'),
            statusLog: JSON.parse(localStorage.getItem('statusLog') || '[]')
        };
        downloadJSON(allData, 'motorcycle_all_data_' + new Date().toISOString().slice(0,10) + '.json');
        showToast('✅ 全部資料已匯出');
        localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0,10));
        checkBackupStatus();
    } catch (err) { console.error('exportAllData error', err); }
}

function clearAllData() {
    try {
        if (!confirm('確定要清除所有資料嗎？此操作無法復原！')) return;
        if (!confirm('請再次確認：這將永久刪除所有記錄！')) return;
        localStorage.clear();
        populateMonthFilters();
        loadAllData();
        showToast('🗑️ 所有資料已清除');
    } catch (err) { console.error('clearAllData error', err); }
}

function downloadJSON(data, filename) {
    try {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) { console.error('downloadJSON error', err); }
}

// --- Settings / autos ---
function loadSettings() {
    try {
        var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (safe('electricRate')) safe('electricRate').value = settings.electricRate || '';
        return settings;
    } catch (err) { console.error('loadSettings error', err); return {}; }
}

function saveSettings() {
    try {
        var rate = parseFloat(safe('electricRate') ? safe('electricRate').value : 0) || 0;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ electricRate: rate }));
        showToast('✅ 設定已儲存');
    } catch (err) { console.error('saveSettings error', err); }
}

function autoCalculateCost() {
    try {
        var settings = loadSettings();
        var rate = parseFloat(settings.electricRate) || 0;
        var costInput = safe('cCost');
        if (costInput && costInput.readOnly) {
            var kwh = parseFloat(safe('cKwh') ? safe('cKwh').value : 0) || 0;
            if (rate > 0 && kwh > 0) costInput.value = Math.round(kwh * rate);
            else costInput.value = '0';
        }
    } catch (err) { console.error('autoCalculateCost error', err); }
}

function checkBackupStatus() {
    try {
        var last = localStorage.getItem(BACKUP_KEY);
        var el = safe('backupWarning');
        if (!el) return;
        if (!last) { el.textContent = '您尚未備份過資料，建議立即匯出。'; el.style.display = 'block'; return; }
        var days = daysBetween(last, new Date().toISOString().slice(0,10));
        if (days > 30) { el.textContent = '您已 ' + days + ' 天未備份，建議立即匯出。'; el.style.display = 'block'; }
        else el.style.display = 'none';
    } catch (err) { console.error('checkBackupStatus error', err); }
}

// --- Maintenance helpers ---
function populateMaintTemplates() {
    try {
        var wrap = safe('maintTemplates'); if (!wrap) return;
        wrap.innerHTML = '';
        MAINT_TEMPLATES.forEach(function(t){
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary';
            btn.style.marginRight = '6px';
            btn.textContent = t.name + ' NT$' + t.cost;
            btn.addEventListener('click', function(){ addPartItem(t.name, t.cost); });
            wrap.appendChild(btn);
        });
    } catch (err) { console.error('populateMaintTemplates error', err); }
}

function addPartItem(name, cost) {
    try {
        name = name || '';
        cost = cost || 0;
        var list = safe('partsList'); if (!list) return;
        var id = Date.now() + Math.floor(Math.random()*1000);
        var div = document.createElement('div');
        div.className = 'part-item';
        div.dataset.id = id;
        div.innerHTML = '<input class="part-name" placeholder="項目/零件" value="' + escapeHtml(name) + '"><input class="part-cost" type="number" value="' + cost + '"><button type="button" class="btn btn-danger remove-part">刪除</button>';
        list.appendChild(div);
        var removeBtn = div.querySelector('.remove-part');
        if (removeBtn) removeBtn.addEventListener('click', function(){ div.remove(); updateTotalCost(); });
        var costInput = div.querySelector('.part-cost');
        if (costInput) costInput.addEventListener('input', updateTotalCost);
        updateTotalCost();
    } catch (err) { console.error('addPartItem error', err); }
}

function updateTotalCost() {
    try {
        var costsEls = document.querySelectorAll('.part-cost');
        var total = 0;
        for (var i=0;i<costsEls.length;i++){ total += parseFloat(costsEls[i].value) || 0; }
        if (safe('totalCost')) safe('totalCost').textContent = total;
    } catch (err) { console.error('updateTotalCost error', err); }
}

function saveMaintenance(e) {
    try {
        e.preventDefault();
        var parts = [];
        var items = document.querySelectorAll('.part-item');
        for (var i=0;i<items.length;i++){
            var nameEl = items[i].querySelector('.part-name');
            var costEl = items[i].querySelector('.part-cost');
            parts.push({ name: nameEl ? nameEl.value : '', cost: costEl ? parseFloat(costEl.value) || 0 : 0 });
        }
        var locSelectVal = safe('mLocationSelect') ? safe('mLocationSelect').value : '';
        var locInputVal = safe('mLocationInput') ? safe('mLocationInput').value : '';
        var location = locSelectVal === '其他' ? locInputVal : locSelectVal;
        var editingId = safe('editingMaintId') ? safe('editingMaintId').value : '';
        var record = {
            id: editingId ? parseInt(editingId) : Date.now(),
            date: safe('mDate') ? safe('mDate').value : '',
            time: safe('mTime') ? safe('mTime').value : '',
            odo: parseFloat(safe('mOdo') ? safe('mOdo').value : 0) || 0,
            location: location,
            type: safe('mType') ? safe('mType').value : '',
            notes: safe('mNotes') ? safe('mNotes').value : '',
            parts: parts,
            totalCost: parseFloat(safe('totalCost') ? safe('totalCost').textContent : 0) || 0
        };
        saveData('maintenanceLog', record, !!editingId);
        cancelMaintEdit();
        populateMonthFilters();
        loadAllData();
        showToast('✅ 保養記錄已儲存');
    } catch (err) { console.error('saveMaintenance error', err); showToast('保養儲存失敗', 'error'); }
}

function cancelMaintEdit() {
    try {
        if (safe('maintenanceForm')) safe('maintenanceForm').reset();
        if (safe('editingMaintId')) safe('editingMaintId').value = '';
        if (safe('partsList')) safe('partsList').innerHTML = '';
        if (safe('maintTitle')) safe('maintTitle').textContent = '記錄保養';
        if (safe('cancelMaintEdit')) safe('cancelMaintEdit').style.display = 'none';
        if (safe('mLocationSelect')) safe('mLocationSelect').value = '基隆成功專賣店';
        var input = safe('mLocationInput'); if (input) { input.value = ''; input.style.display = 'none'; }
        updateTotalCost();
        populateDateTime('mDate','mTime');
    } catch (err) { console.error('cancelMaintEdit error', err); }
}

function saveExpense(e) {
    try {
        e.preventDefault();
        var editingId = safe('editingExpenseId') ? safe('editingExpenseId').value : '';
        var record = {
            id: editingId ? parseInt(editingId) : Date.now(),
            date: safe('eDate') ? safe('eDate').value : '',
            time: safe('eTime') ? safe('eTime').value : '',
            odo: parseFloat(safe('eOdo') ? safe('eOdo').value : 0) || 0,
            category: safe('eCategory') ? safe('eCategory').value : '',
            amount: parseFloat(safe('eAmount') ? safe('eAmount').value : 0) || 0,
            description: safe('eDescription') ? safe('eDescription').value : ''
        };
        saveData('expenseLog', record, !!editingId);
        cancelExpenseEdit();
        populateMonthFilters();
        loadAllData();
        showToast('✅ 費用記錄已儲存');
    } catch (err) { console.error('saveExpense error', err); showToast('費用儲存失敗', 'error'); }
}

function cancelExpenseEdit() {
    try {
        if (safe('expenseForm')) safe('expenseForm').reset();
        if (safe('editingExpenseId')) safe('editingExpenseId').value = '';
        if (safe('expenseTitle')) safe('expenseTitle').textContent = '記錄其他花費';
        if (safe('cancelExpenseEdit')) safe('cancelExpenseEdit').style.display = 'none';
        populateDateTime('eDate','eTime');
    } catch (err) { console.error('cancelExpenseEdit error', err); }
}

function populateDateTime(dateFieldId, timeFieldId) {
    try {
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth()+1).padStart(2,'0');
        var d = String(now.getDate()).padStart(2,'0');
        var hh = String(now.getHours()).padStart(2,'0');
        var mm = String(now.getMinutes()).padStart(2,'0');
        var dateEl = safe(dateFieldId); if (dateEl) dateEl.value = y + '-' + m + '-' + d;
        var timeEl = safe(timeFieldId); if (timeEl) timeEl.value = hh + ':' + mm;
    } catch (err) { console.error('populateDateTime error', err); }
}

function saveStatus(e) {
    try {
        e.preventDefault();
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth()+1).padStart(2,'0');
        var d = String(now.getDate()).padStart(2,'0');
        var hh = String(now.getHours()).padStart(2,'0');
        var mm = String(now.getMinutes()).padStart(2,'0');
        var batteryRadio = document.querySelector('input[name="sBattery"]:checked');
        var battery = batteryRadio ? parseInt(batteryRadio.value) : 1;
        var record = {
            id: Date.now(),
            date: y + '-' + m + '-' + d,
            time: hh + ':' + mm,
            odo: parseFloat(safe('sOdo') ? safe('sOdo').value : 0) || 0,
            battery: battery,
            notes: safe('sNotes') ? safe('sNotes').value : ''
        };
        localStorage.setItem('statusLog', JSON.stringify([record]));
        if (safe('statusForm')) safe('statusForm').reset();
        var sb = document.querySelector('input[name="sBattery"][value="1"]'); if (sb) sb.checked = true;
        populateMonthFilters();
        loadAllData();
        showToast('✅ 狀態已更新');
    } catch (err) { console.error('saveStatus error', err); showToast('儲存狀態失敗', 'error'); }
}

// --- Prefill defaults (充電站 / 電量) ---
function prefillChargeDefaults() {
    try {
        var chargeData = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        var statusData = JSON.parse(localStorage.getItem('statusLog') || '[]');
        if (!chargeData.length && !statusData.length) return;

        if (chargeData.length > 0) {
            var last = chargeData[0];
            if (last.stationType) {
                selectedStation = last.stationType || '';
                var stationButtons = document.querySelectorAll('.station-btn');
                if (stationButtons) {
                    stationButtons.forEach(function(b){ b.classList.toggle('active', b.dataset.station === selectedStation); });
                }
                var input = safe('cStation');
                if (input) {
                    if (selectedStation === '其他') { input.style.display = 'block'; input.value = last.station || ''; }
                    else { input.style.display = 'none'; input.value = ''; }
                }
            } else {
                var input2 = safe('cStation');
                if (input2) { input2.style.display = 'block'; input2.value = last.station || ''; }
            }
            var cOdo = safe('cOdo'); if (cOdo && last.odo) cOdo.value = last.odo;
            var startVal = (last.batteryEnd != null) ? last.batteryEnd : ((last.batteryStart != null) ? last.batteryStart : 1);
            var bs = document.querySelector('input[name="cBatteryStart"][value="' + startVal + '"]'); if (bs) bs.checked = true;
            var endVal = (last.batteryEnd != null) ? last.batteryEnd : 5;
            var be = document.querySelector('input[name="cBatteryEnd"][value="' + endVal + '"]'); if (be) be.checked = true;
        } else if (statusData.length > 0) {
            var s = statusData[0];
            var sb = document.querySelector('input[name="sBattery"][value="' + s.battery + '"]'); if (sb) sb.checked = true;
            var cs = document.querySelector('input[name="cBatteryStart"][value="' + s.battery + '"]'); if (cs) cs.checked = true;
        }

        var statusBattery = null;
        if (statusData.length > 0) statusBattery = statusData[0].battery;
        else if (chargeData.length > 0) statusBattery = chargeData[0].batteryEnd;
        if (statusBattery != null) {
            var sbr = document.querySelector('input[name="sBattery"][value="' + statusBattery + '"]');
            if (sbr) sbr.checked = true;
        }
    } catch (err) {
        console.error('prefillChargeDefaults error', err);
    }
}

function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
        var d = new Date(isoString);
        return d.toLocaleString('zh-TW', { month: '2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch (e) { return isoString; }
}

function toLocalISO(isoString) {
    if (!isoString) return '';
    try {
        var d = new Date(isoString);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0,16);
    } catch (e) { return ''; }
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
}
