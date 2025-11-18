/* motolog/motolog.js
   Debug-friendly full replacement.
   - Adds early console logs to confirm file loaded.
   - Wraps DOMContentLoaded init in try/catch and exposes window.onerror to capture runtime exceptions.
   - Keeps all features: tabs, start/end charging, maintenance, expense, status, import/export, charts, prefill defaults.
   - Defensive checks to avoid null dereferences that would stop script execution.
*/

console.log('motolog.js: loaded');

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

let chargeTimer = null;
let charts = {};
let selectedStation = '';

// Global error capture so page doesn't silently die
window.onerror = function(message, source, lineno, colno, err) {
    console.error('Global error caught:', { message, source, lineno, colno, err });
    try {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = `錯誤: ${message}`;
            toast.style.background = 'var(--danger)';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 5000);
        }
    } catch (ex) {
        // swallow
    }
    return false; // allow default handling too
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('motolog.js: DOMContentLoaded handler running');
        initEventListeners();
        populateMaintTemplates();
        populateMonthFilters();
        loadAllData();
        prefillChargeDefaults();
    } catch (err) {
        console.error('Error during initialization:', err);
        showToast && showToast('初始化錯誤，請查看 Console', 'error');
    }
});

function safe(id) { return document.getElementById(id); }

function initEventListeners() {
    // tabs
    document.querySelectorAll?.('.tab-button')?.forEach(btn => {
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
    document.querySelectorAll?.('.station-btn')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedStation = e.target.dataset.station;
            const input = safe('cStation');
            if (input) {
                input.style.display = selectedStation === '其他' ? 'block' : 'none';
                if (selectedStation !== '其他') input.value = '';
            }
        });
    });

    // forms
    safe('startChargeForm')?.addEventListener('submit', startCharging);
    safe('endChargeForm')?.addEventListener('submit', endCharging);
    safe('maintenanceForm')?.addEventListener('submit', saveMaintenance);
    safe('expenseForm')?.addEventListener('submit', saveExpense);
    safe('statusForm')?.addEventListener('submit', saveStatus);
    safe('editChargeForm')?.addEventListener('submit', saveEditCharge);

    // settings & auto-calc
    safe('cKwh')?.addEventListener('input', autoCalculateCost);
    safe('saveSettingsBtn')?.addEventListener('click', saveSettings);

    // maintenance helpers
    safe('addPartBtn')?.addEventListener('click', () => addPartItem());
    safe('cancelMaintEdit')?.addEventListener('click', cancelMaintEdit);
    safe('cancelExpenseEdit')?.addEventListener('click', cancelExpenseEdit);
    safe('closeEditModal')?.addEventListener('click', closeEditModal);

    // Now buttons
    safe('maintNowBtn')?.addEventListener('click', () => populateDateTime('mDate', 'mTime'));
    safe('expenseNowBtn')?.addEventListener('click', () => populateDateTime('eDate', 'eTime'));

    // maintenance location
    safe('mLocationSelect')?.addEventListener('change', (e) => {
        const input = safe('mLocationInput');
        if (!input) return;
        if (e.target.value === '其他') { input.style.display = 'block'; }
        else { input.style.display = 'none'; input.value = ''; }
    });

    // import/export/clear
    safe('importBtn')?.addEventListener('click', () => safe('jsonImport')?.click());
    safe('jsonImport')?.addEventListener('change', importData);
    safe('exportAllBtn')?.addEventListener('click', exportAllData);
    safe('clearAllBtn')?.addEventListener('click', clearAllData);

    // filters & search
    safe('chargeSearch')?.addEventListener('input', filterChargeTable);
    safe('chargeMonthFilter')?.addEventListener('change', () => { loadChargeHistory(); filterChargeTable(); });

    safe('maintSearch')?.addEventListener('input', filterMaintTable);
    safe('maintMonthFilter')?.addEventListener('change', () => { loadMaintenanceHistory(); filterMaintTable(); });
    safe('maintTypeFilter')?.addEventListener('change', filterMaintTable);

    safe('expenseCategoryFilter')?.addEventListener('change', filterExpenseTable);
    safe('expenseMonthFilter')?.addEventListener('change', () => { loadExpenseHistory(); filterExpenseTable(); });

    safe('statusMonthFilter')?.addEventListener('change', filterStatusTable);
}

function showToast(message, type = 'success') {
    const toast = safe('toast');
    if (!toast) {
        console.log('TOAST:', message);
        return;
    }
    toast.textContent = message;
    toast.style.background = type === 'success' ? 'var(--success)' : 'var(--danger)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Charging session ---
function startCharging(e) {
    try {
        e.preventDefault();
        const input = safe('cStation');
        const station = selectedStation === '其他' ? (input ? input.value : '') : selectedStation;
        if (!station) { showToast('請選擇充電站', 'error'); return; }
        const odoEl = safe('cOdo');
        const odoVal = odoEl ? parseFloat(odoEl.value) || 0 : 0;
        const session = {
            id: Date.now(),
            startTime: new Date().toISOString(),
            odo: odoVal,
            batteryStart: parseInt(document.querySelector('input[name="cBatteryStart"]:checked')?.value || '1'),
            station: station,
            stationType: selectedStation || '其他',
            notes: safe('cNotes')?.value || ''
        };
        localStorage.setItem('currentChargingSession', JSON.stringify(session));
        safe('startChargeForm')?.reset();
        selectedStation = '';
        document.querySelectorAll('.station-btn')?.forEach(b => b.classList.remove('active'));
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
        const session = JSON.parse(localStorage.getItem('currentChargingSession') || 'null');
        if (!session) { showToast('沒有進行中的充電', 'error'); return; }
        const endTime = new Date();
        const startTime = new Date(session.startTime);
        const diff = endTime - startTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const record = {
            ...session,
            endTime: endTime.toISOString(),
            date: session.startTime.slice(0,10),
            duration: `${hours}小時 ${minutes}分`,
            batteryEnd: parseInt(document.querySelector('input[name="cBatteryEnd"]:checked')?.value || '5'),
            kwh: parseFloat(safe('cKwh')?.value) || 0,
            cost: parseFloat(safe('cCost')?.value) || 0,
            range: parseFloat(safe('cRange')?.value) || 0
        };
        saveData('chargeLog', record);
        localStorage.removeItem('currentChargingSession');
        safe('endChargeForm')?.reset();
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
        const session = JSON.parse(localStorage.getItem('currentChargingSession') || 'null');
        const startSection = safe('startChargeSection');
        const endSection = safe('endChargeSection');
        if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
        if (session) {
            if (startSection) startSection.style.display = 'none';
            if (endSection) endSection.style.display = 'block';
            const currentInfo = safe('currentChargeInfo');
            if (currentInfo) currentInfo.innerHTML = `
                <p><strong>開始時間:</strong> ${formatDateTime(session.startTime)}</p>
                <p><strong>開始里程:</strong> ${session.odo} km</p>
                <p><strong>開始電量:</strong> ${session.batteryStart} 格</p>
                <p><strong>充電站:</strong> ${session.station}</p>
            `;
            const kwhInput = safe('cKwh');
            const costInput = safe('cCost');
            if (kwhInput) { kwhInput.value = ''; kwhInput.readOnly = false; kwhInput.required = false; }
            if (costInput) { costInput.value = ''; costInput.readOnly = false; costInput.required = false; }
            if (session.stationType === '公司' || session.stationType === '家裡') {
                const settings = loadSettings();
                if (settings && settings.electricRate && settings.electricRate > 0) {
                    if (costInput) costInput.readOnly = true;
                }
            }
            const timerEl = safe('chargingTimer');
            if (timerEl) {
                const start = new Date(session.startTime);
                function updateTimer() {
                    const now = new Date();
                    const diff = now - start;
                    const h = String(Math.floor(diff / 3600000)).padStart(2,'0');
                    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0');
                    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2,'0');
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
    } catch (err) {
        console.error('updateChargeUI error', err);
    }
}

// --- Storage helpers ---
function saveData(key, record, isEdit = false) {
    try {
        let data = JSON.parse(localStorage.getItem(key) || '[]');
        if (isEdit) {
            const idx = data.findIndex(i => i.id === record.id);
            if (idx !== -1) data[idx] = record;
            else data.push(record);
        } else {
            data.push(record);
        }
        data.sort((a,b) => {
            const as = a.startTime ? a.startTime : (a.date ? a.date + 'T' + (a.time || '00:00') : '');
            const bs = b.startTime ? b.startTime : (b.date ? b.date + 'T' + (b.time || '00:00') : '');
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
        const maintData = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        const chargeData = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        const expenseData = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        const statusData = JSON.parse(localStorage.getItem('statusLog') || '[]');

        const odos = [...chargeData, ...maintData, ...expenseData, ...statusData].filter(d => d.odo && d.odo > 0).map(d => d.odo);
        const totalMileage = odos.length ? Math.max(...odos) : 0;
        safe('totalMileage') && (safe('totalMileage').textContent = totalMileage.toFixed(1));

        let totalExpense = 0;
        maintData.forEach(m => totalExpense += m.totalCost || 0);
        chargeData.forEach(c => totalExpense += c.cost || 0);
        expenseData.forEach(e => totalExpense += e.amount || 0);
        safe('totalExpense') && (safe('totalExpense').textContent = totalExpense.toFixed(0));

        if (chargeData.length > 0) {
            const last = chargeData[0];
            const daysAgo = daysBetween(last.date, new Date().toISOString().slice(0,10));
            safe('lastChargeDays') && (safe('lastChargeDays').textContent = daysAgo === 0 ? '今天' : `${daysAgo}天前`);
            const kmSince = totalMileage - last.odo;
            safe('lastChargeDate') && (safe('lastChargeDate').textContent = (kmSince > 0 && last.odo > 0) ? `${last.date} (已騎乘 ${kmSince.toFixed(1)} km)` : last.date);
        }

        const regularMaint = JSON.parse(localStorage.getItem('maintenanceLog') || '[]').filter(m => m.type === '定期保養');
        if (regularMaint.length === 0) {
            const kmLeft = FIRST_SERVICE_KM - totalMileage;
            if (kmLeft > 0) {
                safe('nextServiceKm') && (safe('nextServiceKm').textContent = `${kmLeft.toFixed(0)} km`);
                safe('nextServiceDate') && (safe('nextServiceDate').textContent = '首次保養');
            } else {
                safe('nextServiceKm') && (safe('nextServiceKm').textContent = '已超過');
                safe('nextServiceDate') && (safe('nextServiceDate').textContent = '請盡快保養');
            }
        } else {
            const last = regularMaint[0];
            const kmSince = totalMileage - last.odo;
            const kmLeft = REGULAR_SERVICE_KM - kmSince;
            const daysAgo = daysBetween(last.date, new Date().toISOString().slice(0,10));
            const daysLeft = REGULAR_SERVICE_DAYS - daysAgo;
            if (kmLeft > 0 && daysLeft > 0) {
                safe('nextServiceKm') && (safe('nextServiceKm').textContent = `${kmLeft.toFixed(0)} km`);
                safe('nextServiceDate') && (safe('nextServiceDate').textContent = `或 ${daysLeft} 天後`);
            } else {
                safe('nextServiceKm') && (safe('nextServiceKm').textContent = '已超過');
                safe('nextServiceDate') && (safe('nextServiceDate').textContent = '請盡快保養');
            }
        }

        safe('statTotalMileage') && (safe('statTotalMileage').textContent = `${totalMileage.toFixed(1)} km`);
        safe('statTotalCost') && (safe('statTotalCost').textContent = `${totalExpense.toFixed(0)} NT$`);
        safe('statMaintCount') && (safe('statMaintCount').textContent = JSON.parse(localStorage.getItem('maintenanceLog') || '[]').length);
        safe('statChargeCount') && (safe('statChargeCount').textContent = JSON.parse(localStorage.getItem('chargeLog') || '[]').length);

        if (totalMileage > 0) safe('statCostPerKm') && (safe('statCostPerKm').textContent = `${(totalExpense/totalMileage).toFixed(2)} NT$`);

        const allRecords = [...JSON.parse(localStorage.getItem('chargeLog') || '[]'), ...JSON.parse(localStorage.getItem('maintenanceLog') || '[]'), ...JSON.parse(localStorage.getItem('expenseLog') || '[]'), ...JSON.parse(localStorage.getItem('statusLog') || '[]')].filter(r => r.date).sort((a,b)=> new Date(a.date)-new Date(b.date));
        if (allRecords.length > 1) {
            const days = daysBetween(allRecords[0].date, new Date().toISOString().slice(0,10)) || 1;
            const avgDaily = totalMileage / days;
            safe('statAvgDaily') && (safe('statAvgDaily').textContent = `${avgDaily.toFixed(1)} km`);
        }
    } catch (err) {
        console.error('updateDashboard error', err);
    }
}

function daysBetween(date1, date2) {
    try {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return Math.round(Math.abs((d2 - d1) / 86400000));
    } catch {
        return 0;
    }
}

// --- History renderers (simplified charge table with details) ---
function loadChargeHistory() {
    try {
        const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        const tbody = safe('chargeTable');
        if (!tbody) return;
        tbody.innerHTML = '';
        const effMap = calculateEfficiencies(data);
        const monthFilter = safe('chargeMonthFilter')?.value || '';
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
    } catch (err) {
        console.error('loadChargeHistory error', err);
    }
}

function calculateEfficiencies(data) {
    try {
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
    } catch (err) {
        console.error('calculateEfficiencies error', err);
        return {};
    }
}

function loadMaintenanceHistory() {
    try {
        const data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        const tbody = safe('maintTable'); if (!tbody) return;
        tbody.innerHTML = '';
        const monthFilter = safe('maintMonthFilter')?.value || '';
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
    } catch (err) {
        console.error('loadMaintenanceHistory error', err);
    }
}

function loadExpenseHistory() {
    try {
        const data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        const tbody = safe('expenseTable'); if (!tbody) return;
        tbody.innerHTML = '';
        const monthFilter = safe('expenseMonthFilter')?.value || '';
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
    } catch (err) {
        console.error('loadExpenseHistory error', err);
    }
}

function loadStatusHistory() {
    try {
        const data = JSON.parse(localStorage.getItem('statusLog') || '[]');
        const tbody = safe('statusTable'); if (!tbody) return;
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
    } catch (err) {
        console.error('loadStatusHistory error', err);
    }
}

// --- Edit / Save functions ---
window.editCharge = function(id) {
    try {
        const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        const rec = data.find(r => r.id === id);
        if (!rec) return;
        safe('editingChargeId') && (safe('editingChargeId').value = rec.id);
        safe('edit_cStartTime') && (safe('edit_cStartTime').value = toLocalISO(rec.startTime));
        safe('edit_cEndTime') && (safe('edit_cEndTime').value = toLocalISO(rec.endTime));
        safe('edit_cOdo') && (safe('edit_cOdo').value = rec.odo);
        safe('edit_cStation') && (safe('edit_cStation').value = rec.station || '');
        safe('edit_cBatteryStart') && (safe('edit_cBatteryStart').value = rec.batteryStart || '');
        safe('edit_cBatteryEnd') && (safe('edit_cBatteryEnd').value = rec.batteryEnd || '');
        safe('edit_cKwh') && (safe('edit_cKwh').value = rec.kwh || '');
        safe('edit_cCost') && (safe('edit_cCost').value = rec.cost || '');
        safe('edit_cNotes') && (safe('edit_cNotes').value = rec.notes || '');
        safe('editChargeModal') && safe('editChargeModal').classList.add('active');
    } catch (err) {
        console.error('editCharge error', err);
    }
};

function saveEditCharge(e) {
    try {
        e.preventDefault();
        const id = parseInt(safe('editingChargeId')?.value);
        const startTime = new Date(safe('edit_cStartTime')?.value);
        const endTime = new Date(safe('edit_cEndTime')?.value);
        const diff = endTime - startTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const record = {
            id: id,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            date: startTime.toISOString().slice(0,10),
            duration: `${hours}小時 ${minutes}分`,
            odo: parseFloat(safe('edit_cOdo')?.value) || 0,
            station: safe('edit_cStation')?.value || '',
            batteryStart: parseInt(safe('edit_cBatteryStart')?.value || '0'),
            batteryEnd: parseInt(safe('edit_cBatteryEnd')?.value || '0'),
            kwh: parseFloat(safe('edit_cKwh')?.value) || 0,
            cost: parseFloat(safe('edit_cCost')?.value) || 0,
            notes: safe('edit_cNotes')?.value || '',
            range: 0
        };
        saveData('chargeLog', record, true);
        closeEditModal();
        loadAllData();
        showToast('✅ 充電記錄已更新');
    } catch (err) {
        console.error('saveEditCharge error', err);
        showToast('儲存編輯失敗', 'error');
    }
}

function closeEditModal() { safe('editChargeModal')?.classList.remove('active'); }

window.editMaintenance = function(id) {
    try {
        const data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        const rec = data.find(r => r.id === id);
        if (!rec) return;
        safe('editingMaintId') && (safe('editingMaintId').value = rec.id);
        safe('mDate') && (safe('mDate').value = rec.date);
        safe('mTime') && (safe('mTime').value = rec.time);
        safe('mOdo') && (safe('mOdo').value = rec.odo);
        const locSelect = safe('mLocationSelect');
        const locInput = safe('mLocationInput');
        if (locSelect) {
            if (rec.location === '基隆成功專賣店') {
                locSelect.value = '基隆成功專賣店';
                if (locInput) { locInput.style.display = 'none'; locInput.value = ''; }
            } else {
                locSelect.value = '其他';
                if (locInput) { locInput.style.display = 'block'; locInput.value = rec.location || ''; }
            }
        }
        safe('mType') && (safe('mType').value = rec.type);
        safe('mNotes') && (safe('mNotes').value = rec.notes || '');
        safe('partsList') && (safe('partsList').innerHTML = '');
        if (rec.parts) rec.parts.forEach(p => addPartItem(p.name, p.cost));
        updateTotalCost();
        safe('maintTitle') && (safe('maintTitle').textContent = '編輯保養記錄');
        safe('cancelMaintEdit') && (safe('cancelMaintEdit').style.display = 'block');
        document.querySelector('[data-tab="maintenance"]')?.click();
        window.scrollTo(0,0);
    } catch (err) {
        console.error('editMaintenance error', err);
    }
};

window.editExpense = function(id) {
    try {
        const data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        const rec = data.find(r => r.id === id);
        if (!rec) return;
        safe('editingExpenseId') && (safe('editingExpenseId').value = rec.id);
        safe('eDate') && (safe('eDate').value = rec.date);
        safe('eTime') && (safe('eTime').value = rec.time);
        safe('eOdo') && (safe('eOdo').value = rec.odo || '');
        safe('eCategory') && (safe('eCategory').value = rec.category || '');
        safe('eAmount') && (safe('eAmount').value = rec.amount || '');
        safe('eDescription') && (safe('eDescription').value = rec.description || '');
        safe('expenseTitle') && (safe('expenseTitle').textContent = '編輯費用記錄');
        safe('cancelExpenseEdit') && (safe('cancelExpenseEdit').style.display = 'block');
        document.querySelector('[data-tab="expense"]')?.click();
        window.scrollTo(0,0);
    } catch (err) {
        console.error('editExpense error', err);
    }
};

window.deleteRecord = function(key, id) {
    try {
        if (!confirm('確定要刪除這筆記錄嗎？此操作無法復原。')) return;
        let data = JSON.parse(localStorage.getItem(key) || '[]');
        data = data.filter(d => d.id !== id);
        localStorage.setItem(key, JSON.stringify(data));
        loadAllData();
        showToast('🗑️ 記錄已刪除');
    } catch (err) {
        console.error('deleteRecord error', err);
    }
};

// --- Filters ---
function filterChargeTable() {
    try {
        const search = (safe('chargeSearch')?.value || '').toLowerCase();
        const month = safe('chargeMonthFilter')?.value || '';
        const rows = safe('chargeTable')?.rows || [];
        for (let row of rows) {
            const text = row.textContent.toLowerCase();
            const matchSearch = text.includes(search);
            const matchMonth = !month || text.includes(month);
            row.style.display = matchSearch && matchMonth ? '' : 'none';
        }
    } catch (err) { console.error(err); }
}
function filterMaintTable() {
    try {
        const search = (safe('maintSearch')?.value || '').toLowerCase();
        const month = safe('maintMonthFilter')?.value || '';
        const type = safe('maintTypeFilter')?.value || '';
        const rows = safe('maintTable')?.rows || [];
        for (let row of rows) {
            const text = row.textContent.toLowerCase();
            const matchSearch = text.includes(search);
            const matchMonth = !month || text.includes(month);
            const matchType = !type || row.cells[2].textContent === type;
            row.style.display = matchSearch && matchMonth && matchType ? '' : 'none';
        }
    } catch (err) { console.error(err); }
}
function filterExpenseTable() {
    try {
        const category = safe('expenseCategoryFilter')?.value || '';
        const month = safe('expenseMonthFilter')?.value || '';
        const rows = safe('expenseTable')?.rows || [];
        for (let row of rows) {
            const matchCategory = !category || row.cells[1].textContent === category;
            const matchMonth = !month || row.textContent.includes(month);
            row.style.display = matchCategory && matchMonth ? '' : 'none';
        }
    } catch (err) { console.error(err); }
}
function filterStatusTable() {
    try {
        const month = safe('statusMonthFilter')?.value || '';
        const rows = safe('statusTable')?.rows || [];
        for (let row of rows) {
            const matchMonth = !month || row.textContent.includes(month);
            row.style.display = matchMonth ? '' : 'none';
        }
    } catch (err) { console.error(err); }
}

// --- Analytics / Charts ---
function updateAnalytics() {
    try {
        const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        safe('totalCharges') && (safe('totalCharges').textContent = data.length);
        const effMap = calculateEfficiencies(data);
        const effs = Object.values(effMap).map(v => parseFloat(v));
        if (effs.length > 0) {
            const avg = effs.reduce((a,b)=>a+b,0) / effs.length;
            safe('avgEfficiency') && (safe('avgEfficiency').textContent = `${avg.toFixed(2)} km/kWh`);
            safe('bestEfficiency') && (safe('bestEfficiency').textContent = `${Math.max(...effs).toFixed(2)} km/kWh`);
            safe('worstEfficiency') && (safe('worstEfficiency').textContent = `${Math.min(...effs).toFixed(2)} km/kWh`);
        } else {
            safe('avgEfficiency') && (safe('avgEfficiency').textContent = '-');
            safe('bestEfficiency') && (safe('bestEfficiency').textContent = '-');
            safe('worstEfficiency') && (safe('worstEfficiency').textContent = '-');
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
        const data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        if (data.length < 2) return;
        const effMap = calculateEfficiencies(data);
        const sorted = [...data].sort((a,b)=> new Date(a.startTime) - new Date(b.startTime));
        const chartData = sorted.map(r => ({ label: r.date ? r.date.slice(5) : r.startTime.slice(5,10), value: effMap[r.id] })).filter(d => d.value);
        if (charts.charge) charts.charge.destroy();
        const ctx = safe('chargeChart')?.getContext('2d'); if (!ctx) return;
        charts.charge = new Chart(ctx, {
            type: 'bar',
            data: { labels: chartData.map(d => d.label), datasets: [{ label: '效率 (km/kWh)', data: chartData.map(d => d.value), backgroundColor: 'rgba(37,99,235,0.5)', borderColor:'rgba(37,99,235,1)', borderWidth:2 }]},
            options: { responsive: true, plugins:{ legend:{ display:true } } }
        });
    } catch (err) { console.error('renderChargeChart error', err); }
}

function renderMaintChart() {
    try {
        const data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
        if (!data.length) return;
        if (charts.maint) charts.maint.destroy();
        const ctx = safe('maintChart')?.getContext('2d'); if (!ctx) return;
        charts.maint = new Chart(ctx, {
            type: 'line',
            data: { labels: [...data].reverse().map(d=>d.date.slice(5)), datasets:[{ label:'保養費用 (NT$)', data:[...data].reverse().map(d=>d.totalCost), borderColor:'rgb(239,68,68)', backgroundColor:'rgba(239,68,68,0.1)', tension:0.4 }]},
            options: { responsive: true }
        });
    } catch (err) { console.error('renderMaintChart error', err); }
}

function renderExpenseChart() {
    try {
        const data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
        if (!data.length) return;
        if (charts.expense) charts.expense.destroy();
        const ctx = safe('expenseChart')?.getContext('2d'); if (!ctx) return;
        charts.expense = new Chart(ctx, {
            type: 'bar',
            data: { labels: [...data].reverse().map(d=>d.date.slice(5)), datasets:[{ label:'費用 (NT$)', data:[...data].reverse().map(d=>d.amount), backgroundColor:'rgba(16,185,129,0.5)', borderColor:'rgba(16,185,129,1)', borderWidth:2 }]},
            options: { responsive: true }
        });
    } catch (err) { console.error('renderExpenseChart error', err); }
}

function renderMonthlyChart() {
    try {
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
        const ctx = safe('monthlyChart')?.getContext('2d'); if (!ctx) return;
        charts.monthly = new Chart(ctx, {
            type: 'line',
            data: { labels: months, datasets: [{ label:'月度總花費 (NT$)', data: months.map(m => monthly[m]), borderColor:'rgb(139,92,246)', backgroundColor:'rgba(139,92,246,0.1)', tension:0.4, fill:true }]},
            options: { responsive: true }
        });
    } catch (err) { console.error('renderMonthlyChart error', err); }
}

function renderCategoryChart() {
    try {
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
        const ctx = safe('categoryChart')?.getContext('2d'); if (!ctx) return;
        charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: categories, datasets: [{ data: categories.map(k => cat[k]), backgroundColor:['rgba(239,68,68,0.8)','rgba(37,99,235,0.8)','rgba(245,158,11,0.8)','rgba(16,185,129,0.8)','rgba(139,92,246,0.8)','rgba(236,72,153,0.8)','rgba(100,116,139,0.8)'] }]},
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    } catch (err) { console.error('renderCategoryChart error', err); }
}

// --- Month filters (Requirement 1) ---
function populateMonthFilters() {
    try {
        const allData = [
            ...JSON.parse(localStorage.getItem('chargeLog') || '[]'),
            ...JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
            ...JSON.parse(localStorage.getItem('expenseLog') || '[]'),
            ...JSON.parse(localStorage.getItem('statusLog') || '[]')
        ];
        const months = new Set();
        allData.forEach(r => { if (r.date) months.add(r.date.slice(0,7)); });
        const sorted = Array.from(months).sort().reverse();
        const now = new Date();
        const curMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        ['chargeMonthFilter','maintMonthFilter','expenseMonthFilter','statusMonthFilter'].forEach(id => {
            const select = safe(id);
            if (!select) return;
            select.innerHTML = '<option value="">所有月份</option>';
            sorted.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m; select.appendChild(opt);
            });
            if (['chargeMonthFilter','maintMonthFilter','expenseMonthFilter'].includes(id)) {
                const hasCur = Array.from(select.options).some(o => o.value === curMonth);
                select.value = hasCur ? curMonth : '';
            } else {
                select.value = '';
            }
        });
    } catch (err) { console.error('populateMonthFilters error', err); }
}

// --- Import/Export/Clear ---
function importData(e) {
    try {
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
                console.error('import file parse error', err);
                showToast('❌ 讀取檔案失敗', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    } catch (err) { console.error('importData error', err); }
}

function exportAllData() {
    try {
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
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) { console.error('downloadJSON error', err); }
}

// --- Settings / autos ---
function loadSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (safe('electricRate')) safe('electricRate').value = settings.electricRate || '';
        return settings;
    } catch (err) { console.error('loadSettings error', err); return {}; }
}

function saveSettings() {
    try {
        const rate = parseFloat(safe('electricRate')?.value) || 0;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ electricRate: rate }));
        showToast('✅ 設定已儲存');
    } catch (err) { console.error('saveSettings error', err); }
}

function autoCalculateCost() {
    try {
        const settings = loadSettings();
        const rate = parseFloat(settings.electricRate) || 0;
        const costInput = safe('cCost');
        if (costInput && costInput.readOnly) {
            const kwh = parseFloat(safe('cKwh')?.value) || 0;
            if (rate > 0 && kwh > 0) costInput.value = Math.round(kwh * rate);
            else costInput.value = '0';
        }
    } catch (err) { console.error('autoCalculateCost error', err); }
}

function checkBackupStatus() {
    try {
        const last = localStorage.getItem(BACKUP_KEY);
        const el = safe('backupWarning');
        if (!el) return;
        if (!last) { el.textContent = '您尚未備份過資料，建議立即匯出。'; el.style.display = 'block'; return; }
        const days = daysBetween(last, new Date().toISOString().slice(0,10));
        if (days > 30) { el.textContent = `您已 ${days} 天未備份，建議立即匯出。`; el.style.display = 'block'; }
        else el.style.display = 'none';
    } catch (err) { console.error('checkBackupStatus error', err); }
}

// --- Maintenance helpers ---
function populateMaintTemplates() {
    try {
        const wrap = safe('maintTemplates');
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
    } catch (err) { console.error('populateMaintTemplates error', err); }
}

function addPartItem(name = '', cost = 0) {
    try {
        const list = safe('partsList'); if (!list) return;
        const id = Date.now() + Math.floor(Math.random()*1000);
        const div = document.createElement('div');
        div.className = 'part-item'; div.dataset.id = id;
        div.innerHTML = `
            <input class="part-name" placeholder="項目/零件" value="${escapeHtml(name)}">
            <input class="part-cost" type="number" value="${cost}">
            <button type="button" class="btn btn-danger remove-part">刪除</button>
        `;
        list.appendChild(div);
        div.querySelector('.remove-part')?.addEventListener('click', () => { div.remove(); updateTotalCost(); });
        div.querySelector('.part-cost')?.addEventListener('input', updateTotalCost);
        updateTotalCost();
    } catch (err) { console.error('addPartItem error', err); }
}

function updateTotalCost() {
    try {
        const costs = Array.from(document.querySelectorAll('.part-cost')).map(i => parseFloat(i.value) || 0);
        const total = costs.reduce((a,b)=>a+b,0);
        safe('totalCost') && (safe('totalCost').textContent = total);
    } catch (err) { console.error('updateTotalCost error', err); }
}

function saveMaintenance(e) {
    try {
        e.preventDefault();
        const parts = [];
        document.querySelectorAll('.part-item').forEach(item => {
            parts.push({ name: item.querySelector('.part-name').value, cost: parseFloat(item.querySelector('.part-cost').value) || 0 });
        });
        const locSelect = safe('mLocationSelect')?.value || '';
        const locInput = safe('mLocationInput')?.value || '';
        const location = locSelect === '其他' ? locInput : locSelect;
        const editingId = safe('editingMaintId')?.value;
        const record = {
            id: editingId ? parseInt(editingId) : Date.now(),
            date: safe('mDate')?.value,
            time: safe('mTime')?.value,
            odo: parseFloat(safe('mOdo')?.value) || 0,
            location: location,
            type: safe('mType')?.value,
            notes: safe('mNotes')?.value,
            parts: parts,
            totalCost: parseFloat(safe('totalCost')?.textContent) || 0
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
        safe('maintenanceForm')?.reset();
        safe('editingMaintId') && (safe('editingMaintId').value = '');
        safe('partsList') && (safe('partsList').innerHTML = '');
        safe('maintTitle') && (safe('maintTitle').textContent = '記錄保養');
        safe('cancelMaintEdit') && (safe('cancelMaintEdit').style.display = 'none');
        safe('mLocationSelect') && (safe('mLocationSelect').value = '基隆成功專賣店');
        const input = safe('mLocationInput'); if (input) { input.value = ''; input.style.display = 'none'; }
        updateTotalCost();
        populateDateTime('mDate','mTime');
    } catch (err) { console.error('cancelMaintEdit error', err); }
}

function saveExpense(e) {
    try {
        e.preventDefault();
        const editingId = safe('editingExpenseId')?.value;
        const record = {
            id: editingId ? parseInt(editingId) : Date.now(),
            date: safe('eDate')?.value,
            time: safe('eTime')?.value,
            odo: parseFloat(safe('eOdo')?.value) || 0,
            category: safe('eCategory')?.value,
            amount: parseFloat(safe('eAmount')?.value) || 0,
            description: safe('eDescription')?.value
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
        safe('expenseForm')?.reset();
        safe('editingExpenseId') && (safe('editingExpenseId').value = '');
        safe('expenseTitle') && (safe('expenseTitle').textContent = '記錄其他花費');
        safe('cancelExpenseEdit') && (safe('cancelExpenseEdit').style.display = 'none');
        populateDateTime('eDate','eTime');
    } catch (err) { console.error('cancelExpenseEdit error', err); }
}

function populateDateTime(dateFieldId, timeFieldId) {
    try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth()+1).padStart(2,'0');
        const d = String(now.getDate()).padStart(2,'0');
        const hh = String(now.getHours()).padStart(2,'0');
        const mm = String(now.getMinutes()).padStart(2,'0');
        const dateEl = safe(dateFieldId); if (dateEl) dateEl.value = `${y}-${m}-${d}`;
        const timeEl = safe(timeFieldId); if (timeEl) timeEl.value = `${hh}:${mm}`;
    } catch (err) { console.error('populateDateTime error', err); }
}

function saveStatus(e) {
    try {
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
            odo: parseFloat(safe('sOdo')?.value) || 0,
            battery: parseInt(document.querySelector('input[name="sBattery"]:checked')?.value || '1'),
            notes: safe('sNotes')?.value || ''
        };
        localStorage.setItem('statusLog', JSON.stringify([record]));
        safe('statusForm')?.reset();
        document.querySelector('input[name="sBattery"][value="1"]')?.checked = true;
        populateMonthFilters();
        loadAllData();
        showToast('✅ 狀態已更新');
    } catch (err) { console.error('saveStatus error', err); showToast('儲存狀態失敗', 'error'); }
}

// --- Prefill defaults (Requirement 5) ---
function prefillChargeDefaults() {
    try {
        const chargeData = JSON.parse(localStorage.getItem('chargeLog') || '[]');
        const statusData = JSON.parse(localStorage.getItem('statusLog') || '[]');
        if (!chargeData.length && !statusData.length) return;

        if (chargeData.length > 0) {
            const last = chargeData[0];
            if (last.stationType) {
                selectedStation = last.stationType;
                document.querySelectorAll('.station-btn')?.forEach(b => b.classList.toggle('active', b.dataset.station === selectedStation));
                const input = safe('cStation');
                if (input) {
                    if (selectedStation === '其他') { input.style.display = 'block'; input.value = last.station || ''; }
                    else { input.style.display = 'none'; input.value = ''; }
                }
            } else {
                const input = safe('cStation');
                if (input) { input.style.display = 'block'; input.value = last.station || ''; }
            }
            const cOdo = safe('cOdo');
            if (cOdo && last.odo) cOdo.value = last.odo;
            const startVal = last.batteryEnd != null ? last.batteryEnd : (last.batteryStart != null ? last.batteryStart : 1);
            const bsRadio = document.querySelector(`input[name="cBatteryStart"][value="${startVal}"]`);
            if (bsRadio) bsRadio.checked = true;
            const endVal = last.batteryEnd != null ? last.batteryEnd : 5;
            const beRadio = document.querySelector(`input[name="cBatteryEnd"][value="${endVal}"]`);
            if (beRadio) beRadio.checked = true;
        } else if (statusData.length > 0) {
            const s = statusData[0];
            const sb = document.querySelector(`input[name="sBattery"][value="${s.battery}"]`);
            if (sb) sb.checked = true;
            const cs = document.querySelector(`input[name="cBatteryStart"][value="${s.battery}"]`);
            if (cs) cs.checked = true;
        }

        let statusBattery = null;
        if (statusData.length > 0) statusBattery = statusData[0].battery;
        else if (chargeData.length > 0) statusBattery = chargeData[0].batteryEnd;
        if (statusBattery != null) {
            const sb = document.querySelector(`input[name="sBattery"][value="${statusBattery}"]`);
            if (sb) sb.checked = true;
        }
    } catch (err) { console.error('prefillChargeDefaults error', err); }
}

// --- Utilities ---
function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleString('zh-TW', { month: '2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch { return isoString; }
}

function toLocalISO(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0,16);
    } catch { return ''; }
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
