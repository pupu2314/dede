/* motolog.js
   手機優化版 (v11)：
   1. 支援深色模式與雲端同步。
   2. 增加「設定教學」視窗的開關邏輯。
*/

console.log('motolog.js (mobile optimized v11): loaded');

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

window.onerror = function(message) {
    showToast('發生錯誤: ' + message, 'error');
    return false;
};

document.addEventListener('DOMContentLoaded', function() {
    try {
        initEventListeners();
        populateMaintTemplates();
        populateMonthFilters();
        loadAllData();
        prefillChargeDefaults();
        prefillStatusForm();
        updateChargeUI();
        
        checkBackupStatus();

        if (localStorage.getItem('currentChargingSession')) {
            var chargeTabBtn = document.querySelector('.tab-button[data-tab="charge"]');
            if (chargeTabBtn) chargeTabBtn.click();
        }

        applyTheme();
    } catch (err) {
        console.error('Init error:', err);
    }
});

function initEventListeners() {
    document.querySelectorAll('.tab-button').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            var target = safe(e.target.dataset.tab + 'Tab');
            if (target) target.classList.add('active');
            window.scrollTo({top: 0, behavior: 'smooth'});
            
            if (e.target.dataset.tab === 'status') prefillStatusForm();
            if (e.target.dataset.tab === 'settings') loadSettings();
        });
    });

    document.querySelectorAll('.station-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedStation = btn.dataset.station;
            var input = safe('cStation');
            if (input) {
                if (selectedStation === '其他') {
                    input.style.display = 'block';
                    input.focus();
                } else {
                    input.style.display = 'none';
                    input.value = '';
                }
            }
        });
    });

    if(safe('startChargeForm')) safe('startChargeForm').addEventListener('submit', startCharging);
    if(safe('endChargeForm')) safe('endChargeForm').addEventListener('submit', endCharging);
    if(safe('maintenanceForm')) safe('maintenanceForm').addEventListener('submit', saveMaintenance);
    if(safe('expenseForm')) safe('expenseForm').addEventListener('submit', saveExpense);
    if(safe('statusForm')) safe('statusForm').addEventListener('submit', saveStatus);
    if(safe('editChargeForm')) safe('editChargeForm').addEventListener('submit', saveEditCharge);

    if(safe('cKwh')) safe('cKwh').addEventListener('input', autoCalculateCost);
    if(safe('saveSettingsBtn')) safe('saveSettingsBtn').addEventListener('click', saveSettings);

    if(safe('addPartBtn')) safe('addPartBtn').addEventListener('click', () => addPartItem());
    if(safe('cancelMaintEdit')) safe('cancelMaintEdit').addEventListener('click', cancelMaintEdit);
    if(safe('cancelExpenseEdit')) safe('cancelExpenseEdit').addEventListener('click', cancelExpenseEdit);
    if(safe('closeEditModal')) safe('closeEditModal').addEventListener('click', closeEditModal);
    if(safe('editChargeModal')) safe('editChargeModal').addEventListener('click', (e) => { if(e.target === safe('editChargeModal')) closeEditModal(); });

    // 教學視窗事件
    if(safe('showTutorialBtn')) safe('showTutorialBtn').addEventListener('click', () => safe('tutorialModal').classList.add('active'));
    if(safe('closeTutorialModal')) safe('closeTutorialModal').addEventListener('click', () => safe('tutorialModal').classList.remove('active'));
    if(safe('tutorialModal')) safe('tutorialModal').addEventListener('click', (e) => { if(e.target === safe('tutorialModal')) safe('tutorialModal').classList.remove('active'); });

    if(safe('maintNowBtn')) safe('maintNowBtn').addEventListener('click', () => populateDateTime('mDate','mTime'));
    if(safe('expenseNowBtn')) safe('expenseNowBtn').addEventListener('click', () => populateDateTime('eDate','eTime'));

    if(safe('mLocationSelect')) safe('mLocationSelect').addEventListener('change', function(e){
        var input = safe('mLocationInput');
        if (e.target.value === '其他') { input.style.display = 'block'; input.focus(); }
        else { input.style.display = 'none'; input.value = ''; }
    });

    if(safe('importBtn')) safe('importBtn').addEventListener('click', () => safe('jsonImport').click());
    if(safe('jsonImport')) safe('jsonImport').addEventListener('change', importData);
    if(safe('exportAllBtn')) safe('exportAllBtn').addEventListener('click', exportAllData);
    if(safe('clearAllBtn')) safe('clearAllBtn').addEventListener('click', clearAllData);
    if(safe('syncToCloudBtn')) safe('syncToCloudBtn').addEventListener('click', syncToGoogleSheets);

    ['chargeMonthFilter', 'chargeSearch'].forEach(id => { if(safe(id)) safe(id).addEventListener('input', filterChargeTable); });
    ['maintMonthFilter', 'maintTypeFilter'].forEach(id => { if(safe(id)) safe(id).addEventListener('change', filterMaintTable); });
    ['expenseMonthFilter', 'expenseCategoryFilter'].forEach(id => { if(safe(id)) safe(id).addEventListener('change', filterExpenseTable); });
    
    if(safe('themeSelect')) safe('themeSelect').addEventListener('change', function(e) {
        var settings = loadSettings();
        settings.theme = e.target.value;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        applyTheme();
    });
}

function showToast(message, type = 'success') {
    var toast = safe('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = (type === 'success') ? 'var(--text-main)' : 'var(--danger)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function checkMileageAnomaly(newOdo, recordDateStr) {
    var latest = getLatestRecord();
    if (!latest) return true; 
    var lastOdo = latest.odo;
    var lastDate = new Date(latest.date);
    var newDate = new Date(recordDateStr);
    var diffKm = newOdo - lastOdo;
    var diffDays = (newDate - lastDate) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7 && diffKm > 100) {
        return confirm(`⚠️ 系統偵測到您的里程增加異常：\n\n上次紀錄：${lastOdo} 公里 (${latest.date})\n本次輸入：${newOdo} 公里\n\n短短 ${Math.round(diffDays)} 天內增加了 ${diffKm.toFixed(1)} 公里。\n\n確定要儲存嗎？`);
    }
    return true;
}

function checkBackupStatus() {
    try {
        var last = localStorage.getItem(BACKUP_KEY);
        var alertBox = safe('topAlert');
        
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'topAlert';
            alertBox.className = 'top-alert';
            document.body.prepend(alertBox);
        }

        alertBox.onclick = function() {
            var settingTabBtn = document.querySelector('[data-tab="settings"]');
            if(settingTabBtn) settingTabBtn.click();
            this.classList.remove('show');
        };

        var msg = '';
        if (!last) {
            msg = '⚠️ 您尚未備份過資料，建議立即匯出 (點擊前往)';
        } else {
            var days = daysBetween(last, new Date().toISOString().slice(0,10));
            if (days > 30) {
                msg = '⚠️ 您已 ' + days + ' 天未備份，建議立即匯出 (點擊前往)';
            }
        }

        if (msg) {
            alertBox.textContent = msg;
            alertBox.classList.add('show');
        } else {
            alertBox.classList.remove('show');
        }
    } catch (err) { console.error('checkBackupStatus error', err); }
}

function getLatestRecord() {
    var all = [
        ...JSON.parse(localStorage.getItem('chargeLog') || '[]'),
        ...JSON.parse(localStorage.getItem('maintenanceLog') || '[]'),
        ...JSON.parse(localStorage.getItem('expenseLog') || '[]'),
        ...JSON.parse(localStorage.getItem('statusLog') || '[]')
    ];
    if (all.length === 0) return null;
    all.sort((a, b) => new Date(b.date + 'T' + (b.time||'00:00')) - new Date(a.date + 'T' + (a.time||'00:00')));
    return all[0];
}

function prefillStatusForm() {
    var latest = getLatestRecord();
    if (latest) {
        if(safe('sOdo')) safe('sOdo').value = latest.odo;
        var battery = null;
        if (latest.battery !== undefined) battery = latest.battery;
        else if (latest.batteryEnd !== undefined) battery = latest.batteryEnd;
        if (battery !== null) {
            var radio = document.querySelector(`input[name="sBattery"][value="${battery}"]`);
            if(radio) radio.checked = true;
        }
    }
}

function startCharging(e) {
    e.preventDefault();
    if (!checkMileageAnomaly(parseFloat(safe('cOdo').value), new Date().toISOString().slice(0,10))) return;
    var input = safe('cStation');
    var station = (selectedStation === '其他' ? input.value : selectedStation) || '';
    if (!station) { showToast('請選擇或輸入充電站', 'error'); return; }
    var session = {
        id: Date.now(),
        startTime: new Date().toISOString(),
        odo: parseFloat(safe('cOdo').value) || 0,
        batteryStart: parseInt(document.querySelector('input[name="cBatteryStart"]:checked')?.value || 1),
        station: station,
        stationType: selectedStation || '其他',
        notes: safe('cNotes').value
    };
    localStorage.setItem('currentChargingSession', JSON.stringify(session));
    safe('startChargeForm').reset();
    document.querySelectorAll('.station-btn').forEach(b => b.classList.remove('active'));
    selectedStation = '';
    updateChargeUI();
    window.scrollTo({top:0, behavior:'smooth'});
    showToast('⚡ 充電開始，計時中...');
}

function endCharging(e) {
    e.preventDefault();
    var session = JSON.parse(localStorage.getItem('currentChargingSession'));
    if (!session) return;
    var endTime = new Date();
    var durationMs = endTime - new Date(session.startTime);
    var record = {
        id: session.id,
        startTime: session.startTime,
        endTime: endTime.toISOString(),
        date: session.startTime.slice(0,10), 
        duration: formatDuration(durationMs),
        odo: session.odo,
        station: session.station,
        stationType: session.stationType,
        batteryStart: session.batteryStart,
        batteryEnd: parseInt(document.querySelector('input[name="cBatteryEnd"]:checked')?.value || 5),
        kwh: parseFloat(safe('cKwh').value) || 0,
        cost: parseFloat(safe('cCost').value) || 0,
        range: parseFloat(safe('cRange').value) || 0,
        notes: session.notes
    };
    saveData('chargeLog', record);
    localStorage.removeItem('currentChargingSession');
    safe('endChargeForm').reset();
    if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
    updateChargeUI();
    loadAllData();
    showToast('✅ 充電記錄已完成');
}

function updateChargeUI() {
    var session = JSON.parse(localStorage.getItem('currentChargingSession'));
    var startSec = safe('startChargeSection');
    var endSec = safe('endChargeSection');
    if (session) {
        startSec.style.display = 'none';
        endSec.style.display = 'block';
        safe('currentChargeInfo').innerHTML = `
            <div style="background:white; padding:10px; border-radius:8px; font-size:0.9rem; color:#555;">
                <div>📍 地點: ${session.station}</div>
                <div>🔋 初始: ${session.batteryStart} 格</div>
                <div>⏱️ 開始: ${formatTime(session.startTime)}</div>
            </div>
        `;
        var settings = loadSettings();
        var costInput = safe('cCost');
        if (settings.electricRate && (session.stationType === '公司' || session.stationType === '家裡')) {
           costInput.placeholder = "輸入度數自動計算";
           safe('cKwh').dataset.autoCalc = "true"; 
        } else {
           safe('cKwh').dataset.autoCalc = "false";
        }
        if (chargeTimer) clearInterval(chargeTimer);
        var start = new Date(session.startTime);
        chargeTimer = setInterval(() => {
            var diff = new Date() - start;
            var h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            var m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            var s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            safe('chargingTimer').textContent = `${h}:${m}:${s}`;
        }, 1000);
    } else {
        startSec.style.display = 'block';
        endSec.style.display = 'none';
        if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
        prefillChargeDefaults();
    }
}

function saveData(key, record, isEdit) {
    var data = JSON.parse(localStorage.getItem(key) || '[]');
    if (isEdit) {
        var idx = data.findIndex(r => r.id === record.id);
        if (idx !== -1) data[idx] = record;
    } else {
        data.push(record);
    }
    data.sort((a, b) => new Date(b.startTime || b.date + 'T' + (b.time||'00:00')) - new Date(a.startTime || a.date + 'T' + (a.time||'00:00')));
    localStorage.setItem(key, JSON.stringify(data));
}

function loadAllData() {
    loadSettings();
    updateDashboard();
    checkBackupStatus();
    filterChargeTable();
    filterMaintTable();
    filterExpenseTable();
}

function updateDashboard() {
    var maint = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    var charge = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var expense = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    var status = JSON.parse(localStorage.getItem('statusLog') || '[]');
    
    var maxOdo = 0;
    [charge, maint, expense, status].flat().forEach(d => {
        if(d && d.odo > maxOdo) maxOdo = d.odo;
    });
    safe('totalMileage').textContent = maxOdo.toFixed(1);
    
    var totalCost = 0;
    maint.forEach(i => totalCost += (i.totalCost || 0));
    charge.forEach(i => totalCost += (i.cost || 0));
    expense.forEach(i => totalCost += (i.amount || 0));
    safe('totalExpense').textContent = Math.round(totalCost).toLocaleString();
    safe('statTotalCost').textContent = Math.round(totalCost).toLocaleString() + ' NT$';

    if (charge.length > 0) {
        var last = charge[0]; 
        var days = daysBetween(last.date, new Date().toISOString().slice(0,10));
        safe('lastChargeDays').textContent = (days === 0 ? '今天' : days + '天前');
        var riddenSince = maxOdo - last.odo;
        safe('lastChargeDate').textContent = '充電後已騎乘 ' + riddenSince.toFixed(1) + ' 公里'; 
    } else {
        safe('lastChargeDays').textContent = '-';
        safe('lastChargeDate').textContent = '無記錄';
    }

    var regularMaint = maint.filter(m => m.type === '定期保養');
    if (regularMaint.length > 0) {
        var lastMaint = regularMaint[0];
        var kmSince = maxOdo - lastMaint.odo;
        var kmLeft = REGULAR_SERVICE_KM - kmSince;
        var daysSince = daysBetween(lastMaint.date, new Date().toISOString().slice(0,10));
        var daysLeft = REGULAR_SERVICE_DAYS - daysSince;
        
        if (kmLeft < 0 || daysLeft < 0) {
            safe('nextServiceStatus').textContent = "已超過";
            safe('nextServiceStatus').style.color = "var(--danger)";
            safe('nextServiceDate').textContent = "建議立即保養";
        } else {
            safe('nextServiceStatus').textContent = `${daysLeft} 天後`;
            safe('nextServiceStatus').style.color = "var(--primary)";
            safe('nextServiceDate').textContent = `或 ${Math.round(kmLeft)} 公里`;
        }
    } else {
        var firstLeft = 300 - maxOdo;
        if (firstLeft > 0) {
            safe('nextServiceStatus').textContent = "新車訓車期";
            safe('nextServiceDate').textContent = `剩餘 ${Math.round(firstLeft)} 公里`;
        } else {
            safe('nextServiceStatus').textContent = "請進行首次保養";
            safe('nextServiceStatus').style.color = "var(--danger)";
            safe('nextServiceDate').textContent = "已達 300 公里";
        }
    }
    
    if(maxOdo > 0) safe('statCostPerKm').textContent = (totalCost / maxOdo).toFixed(2) + " NT$";
    safe('statTotalMileage').textContent = maxOdo.toFixed(1) + " 公里";
    var daysRange = 1;
    var allRec = [charge, maint, expense, status].flat();
    if(allRec.length > 1) {
        allRec.sort((a,b) => new Date(a.date) - new Date(b.date));
        daysRange = daysBetween(allRec[0].date, new Date().toISOString().slice(0,10)) || 1;
    }
    safe('statAvgDaily').textContent = (maxOdo / daysRange).toFixed(1) + " 公里";
}

function loadChargeHistory() {
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var list = safe('chargeList');
    if(!list) return;
    list.innerHTML = '';
    
    var search = safe('chargeSearch').value.toLowerCase();
    var month = safe('chargeMonthFilter').value; 
    
    var filtered = data.filter(r => {
        var matchSearch = (r.station || '').toLowerCase().includes(search);
        var matchMonth = !month || r.date.startsWith(month);
        return matchSearch && matchMonth;
    });

    var effTotal = 0, effCount = 0, maxEff = 0;
    var reversed = [...data].reverse();
    var effMap = {};
    for(let i=1; i<reversed.length; i++) {
        let curr = reversed[i], prev = reversed[i-1];
        let dist = curr.odo - prev.odo;
        if (dist > 0 && curr.kwh > 0) {
            let eff = dist / curr.kwh;
            effMap[curr.id] = eff;
            effTotal += eff; effCount++;
            if(eff > maxEff) maxEff = eff;
        }
    }
    safe('avgEfficiency').textContent = effCount ? (effTotal/effCount).toFixed(1) + ' 公里/kWh' : '-';
    safe('bestEfficiency').textContent = maxEff ? maxEff.toFixed(1) + ' 公里/kWh' : '-';
    safe('totalCharges').textContent = data.length + ' 次';

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">本月尚無紀錄</div>';
        return;
    }

    filtered.forEach(r => {
        var eff = effMap[r.id] ? effMap[r.id].toFixed(1) : '-';
        var dateStr = r.date.replace(/-/g,'/');
        var timeStr = formatTime(r.startTime);
        
        var card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="card-date">${dateStr}</span>
                    <span class="card-time">${timeStr}</span>
                </div>
                <span class="card-badge">${r.station}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">時長</span>
                    <span class="card-val">${r.duration}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">電量</span>
                    <span class="card-val">${r.batteryStart} → ${r.batteryEnd} 格</span>
                </div>
                <div class="card-row">
                    <span class="card-label">效率</span>
                    <span class="card-val">${r.kwh} kWh / <span class="highlight">${eff}</span> km/kWh</span>
                </div>
                <div class="card-row">
                    <span class="card-label">費用</span>
                    <span class="card-val cost">$${r.cost}</span>
                </div>
                ${r.notes ? `<div class="card-notes">📝 ${r.notes}</div>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn btn-warning btn-sm" onclick="editCharge(${r.id})">編輯</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRecord('chargeLog',${r.id})">刪除</button>
            </div>
        `;
        list.appendChild(card);
    });
}

function loadMaintenanceHistory() {
    var data = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    var list = safe('maintList');
    if(!list) return;
    list.innerHTML = '';
    
    var month = safe('maintMonthFilter').value;
    var type = safe('maintTypeFilter').value;
    var filtered = data.filter(r => (!month || r.date.startsWith(month)) && (!type || r.type === type));
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">本月尚無紀錄</div>';
        return;
    }

    filtered.forEach(r => {
        var dateStr = r.date.replace(/-/g,'/');
        var items = r.parts ? r.parts.map(p => p.name).join(', ') : r.notes;

        var card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="card-header">
                <div><span class="card-date">${dateStr}</span></div>
                <span class="card-badge">${r.type}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">地點</span>
                    <span class="card-val">${r.location}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">里程</span>
                    <span class="card-val">${r.odo} km</span>
                </div>
                <div class="card-row">
                    <span class="card-label">項目</span>
                    <span class="card-val" style="max-width:70%">${items}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">總費用</span>
                    <span class="card-val cost">$${r.totalCost}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-warning btn-sm" onclick="editMaintenance(${r.id})">編輯</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRecord('maintenanceLog',${r.id})">刪除</button>
            </div>
        `;
        list.appendChild(card);
    });
}

function loadExpenseHistory() {
    var data = JSON.parse(localStorage.getItem('expenseLog') || '[]');
    var list = safe('expenseList');
    if(!list) return;
    list.innerHTML = '';
    
    var month = safe('expenseMonthFilter').value;
    var cat = safe('expenseCategoryFilter').value;
    var filtered = data.filter(r => (!month || r.date.startsWith(month)) && (!cat || r.category === cat));
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">本月尚無紀錄</div>';
        return;
    }

    filtered.forEach(r => {
        var dateStr = r.date.replace(/-/g,'/');
        var card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="card-header">
                <div><span class="card-date">${dateStr}</span></div>
                <span class="card-badge">${r.category}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">金額</span>
                    <span class="card-val cost">$${r.amount}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">里程</span>
                    <span class="card-val">${r.odo || '-'} km</span>
                </div>
                ${r.description ? `<div class="card-notes">${r.description}</div>` : ''}
            </div>
            <div class="card-actions">
                <button class="btn btn-warning btn-sm" onclick="editExpense(${r.id})">編輯</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRecord('expenseLog',${r.id})">刪除</button>
            </div>
        `;
        list.appendChild(card);
    });
}

window.editCharge = function(id) {
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var r = data.find(x => x.id === id);
    if (!r) return;
    safe('editingChargeId').value = r.id;
    safe('edit_cStartTime').value = toLocalISO(r.startTime);
    safe('edit_cEndTime').value = toLocalISO(r.endTime);
    safe('edit_cOdo').value = r.odo;
    safe('edit_cStation').value = r.station;
    
    safe('edit_cBatteryStart').value = r.batteryStart;
    safe('edit_cBatteryEnd').value = r.batteryEnd;
    
    safe('edit_cKwh').value = r.kwh;
    safe('edit_cCost').value = r.cost;
    safe('edit_cNotes').value = r.notes;
    safe('editChargeModal').classList.add('active');
}

function saveEditCharge(e) {
    e.preventDefault();
    var id = parseInt(safe('editingChargeId').value);
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var idx = data.findIndex(x => x.id === id);
    if (idx === -1) return;
    var r = data[idx];
    r.startTime = new Date(safe('edit_cStartTime').value).toISOString();
    r.endTime = new Date(safe('edit_cEndTime').value).toISOString();
    r.date = r.startTime.slice(0,10);
    r.odo = parseFloat(safe('edit_cOdo').value);
    r.station = safe('edit_cStation').value;
    
    r.batteryStart = parseInt(safe('edit_cBatteryStart').value);
    r.batteryEnd = parseInt(safe('edit_cBatteryEnd').value);
    
    r.kwh = parseFloat(safe('edit_cKwh').value);
    r.cost = parseFloat(safe('edit_cCost').value);
    r.notes = safe('edit_cNotes').value;
    var ms = new Date(r.endTime) - new Date(r.startTime);
    r.duration = formatDuration(ms);
    localStorage.setItem('chargeLog', JSON.stringify(data));
    closeEditModal();
    loadAllData();
    showToast('✅ 記錄已更新');
}

function closeEditModal() {
    safe('editChargeModal').classList.remove('active');
}

window.editMaintenance = function(id) {
    var data = JSON.parse(localStorage.getItem('maintenanceLog'));
    var r = data.find(x => x.id === id);
    if(!r) return;
    safe('editingMaintId').value = r.id;
    safe('mDate').value = r.date;
    safe('mTime').value = r.time;
    safe('mOdo').value = r.odo;
    safe('mType').value = r.type;
    safe('mNotes').value = r.notes;
    var sel = safe('mLocationSelect');
    if(r.location === '基隆成功專賣店') {
        sel.value = r.location;
        safe('mLocationInput').style.display = 'none';
    } else {
        sel.value = '其他';
        safe('mLocationInput').style.display = 'block';
        safe('mLocationInput').value = r.location;
    }
    safe('partsList').innerHTML = '';
    if(r.parts) r.parts.forEach(p => addPartItem(p.name, p.cost));
    updateTotalCost();
    safe('maintTitle').textContent = '編輯保養';
    safe('cancelMaintEdit').style.display = 'block';
    document.querySelector('[data-tab="maintenance"]').click();
}

function cancelMaintEdit() {
    safe('maintenanceForm').reset();
    safe('editingMaintId').value = '';
    safe('partsList').innerHTML = '';
    safe('maintTitle').textContent = '🛠️ 記錄保養';
    safe('cancelMaintEdit').style.display = 'none';
    updateTotalCost();
    populateDateTime('mDate','mTime');
}

window.editExpense = function(id) {
    var data = JSON.parse(localStorage.getItem('expenseLog'));
    var r = data.find(x => x.id === id);
    if(!r) return;
    safe('editingExpenseId').value = r.id;
    safe('eDate').value = r.date;
    safe('eTime').value = r.time;
    safe('eCategory').value = r.category;
    safe('eAmount').value = r.amount;
    safe('eDescription').value = r.description;
    safe('eOdo').value = r.odo;
    safe('expenseTitle').textContent = '編輯花費';
    safe('cancelExpenseEdit').style.display = 'block';
    document.querySelector('[data-tab="expense"]').click();
}

function cancelExpenseEdit() {
    safe('expenseForm').reset();
    safe('editingExpenseId').value = '';
    safe('expenseTitle').textContent = '💰 記錄花費';
    safe('cancelExpenseEdit').style.display = 'none';
    populateDateTime('eDate','eTime');
}

window.deleteRecord = function(key, id) {
    if(!confirm('確定刪除?')) return;
    var data = JSON.parse(localStorage.getItem(key) || '[]');
    var newData = data.filter(x => x.id !== id);
    localStorage.setItem(key, JSON.stringify(newData));
    loadAllData();
    showToast('🗑️ 已刪除');
}

function populateMaintTemplates() {
    var div = safe('maintTemplates');
    if(!div) return;
    div.innerHTML = '';
    MAINT_TEMPLATES.forEach(t => {
        var btn = document.createElement('button');
        btn.className = 'btn btn-secondary btn-sm';
        btn.type = 'button';
        btn.textContent = `${t.name} $${t.cost}`;
        btn.onclick = () => addPartItem(t.name, t.cost);
        div.appendChild(btn);
    });
}

function addPartItem(name = '', cost = 0) {
    var div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <input type="text" class="part-name" value="${name}" placeholder="項目名稱">
        <input type="number" class="part-cost" value="${cost}" placeholder="$">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove(); updateTotalCost();">X</button>
    `;
    safe('partsList').appendChild(div);
    div.querySelector('.part-cost').addEventListener('input', updateTotalCost);
    updateTotalCost();
}

function updateTotalCost() {
    var total = 0;
    document.querySelectorAll('.part-cost').forEach(el => total += (parseFloat(el.value) || 0));
    safe('totalCost').textContent = total;
}

function saveMaintenance(e) {
    e.preventDefault();
    if (!checkMileageAnomaly(parseFloat(safe('mOdo').value), safe('mDate').value)) return;
    var parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        parts.push({
            name: item.querySelector('.part-name').value,
            cost: parseFloat(item.querySelector('.part-cost').value) || 0
        });
    });
    var loc = safe('mLocationSelect').value;
    if(loc === '其他') loc = safe('mLocationInput').value;
    var record = {
        id: safe('editingMaintId').value ? parseInt(safe('editingMaintId').value) : Date.now(),
        date: safe('mDate').value,
        time: safe('mTime').value,
        odo: parseFloat(safe('mOdo').value) || 0,
        location: loc,
        type: safe('mType').value,
        notes: safe('mNotes').value,
        parts: parts,
        totalCost: parseFloat(safe('totalCost').textContent)
    };
    saveData('maintenanceLog', record, !!safe('editingMaintId').value);
    cancelMaintEdit();
    loadAllData();
    showToast('✅ 保養儲存成功');
}

function saveExpense(e) {
    e.preventDefault();
    if (safe('eOdo').value) {
         if (!checkMileageAnomaly(parseFloat(safe('eOdo').value), safe('eDate').value)) return;
    }
    var record = {
        id: safe('editingExpenseId').value ? parseInt(safe('editingExpenseId').value) : Date.now(),
        date: safe('eDate').value,
        time: safe('eTime').value,
        category: safe('eCategory').value,
        amount: parseFloat(safe('eAmount').value) || 0,
        odo: parseFloat(safe('eOdo').value) || 0,
        description: safe('eDescription').value
    };
    saveData('expenseLog', record, !!safe('editingExpenseId').value);
    cancelExpenseEdit();
    loadAllData();
    showToast('✅ 花費儲存成功');
}

function saveStatus(e) {
    e.preventDefault();
    if (!checkMileageAnomaly(parseFloat(safe('sOdo').value), new Date().toISOString().slice(0,10))) return;
    var record = {
        id: Date.now(),
        date: new Date().toISOString().slice(0,10),
        time: new Date().toTimeString().slice(0,5),
        odo: parseFloat(safe('sOdo').value) || 0,
        battery: parseInt(document.querySelector('input[name="sBattery"]:checked').value),
        notes: '' 
    };
    localStorage.setItem('statusLog', JSON.stringify([record])); 
    safe('statusForm').reset();
    loadAllData();
    prefillStatusForm();
    showToast('✅ 狀態已更新');
}

function loadSettings() {
    var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if(safe('electricRate')) safe('electricRate').value = s.electricRate || '';
    if(safe('gasUrl')) safe('gasUrl').value = s.gasUrl || '';
    if(safe('themeSelect')) safe('themeSelect').value = s.theme || 'light';
    return s;
}

function saveSettings() {
    var rate = parseFloat(safe('electricRate').value);
    var gasUrl = safe('gasUrl').value.trim();
    var theme = safe('themeSelect').value;
    
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ 
        electricRate: rate,
        gasUrl: gasUrl,
        theme: theme
    }));
    
    applyTheme();
    showToast('設定已儲存');
}

function applyTheme() {
    var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function autoCalculateCost() {
    if(safe('cKwh').dataset.autoCalc !== "true") return;
    var rate = parseFloat(safe('electricRate').value) || 0;
    var kwh = parseFloat(safe('cKwh').value) || 0;
    safe('cCost').value = Math.round(rate * kwh);
}

function prefillChargeDefaults() {
    var charge = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    if(charge.length > 0) {
        var last = charge[0];
        safe('cOdo').value = last.odo; 
        var lastEnd = last.batteryEnd || 5;
        var radio = document.querySelector(`input[name="cBatteryStart"][value="${lastEnd}"]`);
        if(radio) radio.checked = true;
    }
}

function populateDateTime(dId, tId) {
    var now = new Date();
    safe(dId).value = now.toISOString().slice(0,10);
    safe(tId).value = now.toTimeString().slice(0,5);
}

function daysBetween(d1, d2) {
    return Math.round(Math.abs((new Date(d2) - new Date(d1)) / 86400000));
}

function formatDuration(ms) {
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return (h > 0 ? h + 'h ' : '') + m + 'm';
}

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false});
}

function toLocalISO(iso) {
    if(!iso) return '';
    var d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
}

function populateMonthFilters() {
    var dates = new Set();
    ['chargeLog','maintenanceLog','expenseLog'].forEach(key => {
        JSON.parse(localStorage.getItem(key)||'[]').forEach(i => dates.add(i.date.slice(0,7)));
    });
    var sorted = Array.from(dates).sort().reverse();
    
    var now = new Date();
    var currentMonth = now.toISOString().slice(0,7); 

    var selects = ['chargeMonthFilter','maintMonthFilter','expenseMonthFilter'];
    selects.forEach(id => {
        var sel = safe(id);
        if(!sel) return;
        sel.innerHTML = '<option value="">所有月份</option>';
        var hasCurrent = false;
        sorted.forEach(m => {
            var opt = document.createElement('option');
            opt.value = m; opt.textContent = m;
            if(m === currentMonth) hasCurrent = true;
            sel.appendChild(opt);
        });
        
        if (hasCurrent) {
            sel.value = currentMonth;
        } else if (sorted.length > 0) {
             if (!hasCurrent) {
                 var opt = document.createElement('option');
                 opt.value = currentMonth; 
                 opt.textContent = currentMonth + " (本月)";
                 if(sel.options.length > 1) sel.insertBefore(opt, sel.options[1]);
                 else sel.appendChild(opt);
                 sel.value = currentMonth;
             }
        }
    });
}

function filterChargeTable() { loadChargeHistory(); }
function filterMaintTable() { loadMaintenanceHistory(); }
function filterExpenseTable() { loadExpenseHistory(); }

function importData(e) {
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
        try {
            var data = JSON.parse(evt.target.result);
            if(data.chargeLog) localStorage.setItem('chargeLog', JSON.stringify(data.chargeLog));
            if(data.maintenanceLog) localStorage.setItem('maintenanceLog', JSON.stringify(data.maintenanceLog));
            if(data.expenseLog) localStorage.setItem('expenseLog', JSON.stringify(data.expenseLog));
            if(data.statusLog) localStorage.setItem('statusLog', JSON.stringify(data.statusLog));
            if(data.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
            loadAllData();
            showToast('✅ 資料匯入成功');
        } catch(err) { showToast('匯入失敗', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function exportAllData() {
    var data = {
        chargeLog: JSON.parse(localStorage.getItem('chargeLog')||'[]'),
        maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog')||'[]'),
        expenseLog: JSON.parse(localStorage.getItem('expenseLog')||'[]'),
        statusLog: JSON.parse(localStorage.getItem('statusLog')||'[]'),
        settings: loadSettings()
    };
    var blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'motolog_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    
    localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0,10));
    checkBackupStatus();
}

function clearAllData() {
    if(confirm('確定清除所有資料?')) {
        localStorage.clear();
        location.reload();
    }
}

// 雲端同步邏輯
function syncToGoogleSheets() {
    var settings = loadSettings();
    if (!settings.gasUrl) {
        showToast('請先在設定頁面輸入 GAS API 網址', 'error');
        return;
    }
    
    if (!confirm('確定要將本機資料同步到 Google Sheets 嗎？')) return;

    var payload = {
        action: 'sync',
        chargeLog: JSON.parse(localStorage.getItem('chargeLog')||'[]'),
        maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog')||'[]'),
        expenseLog: JSON.parse(localStorage.getItem('expenseLog')||'[]'),
        statusLog: JSON.parse(localStorage.getItem('statusLog')||'[]')
    };

    showToast('☁️ 同步中...', 'success');
    
    fetch(settings.gasUrl, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            showToast('✅ 雲端同步成功');
            localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0,10));
            checkBackupStatus();
        } else {
            showToast('❌ 同步失敗: ' + data.message, 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('❌ 網路錯誤', 'error');
    });
}
