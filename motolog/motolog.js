console.log('motolog.js (v16.0.1): loaded');

const APP_VERSION = 'v16.0.1';
const SETTINGS_KEY = 'motorcycleSettings';
const BACKUP_KEY = 'lastBackupDate';
const DIRTY_KEY = 'hasUnsyncedChanges';

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

// === 全域工具函式 ===
function safe(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
}

function showToast(message, type = 'success') {
    var toast = safe('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show ' + (type === 'success' ? 'toast-success' : 'toast-error');
    toast.style.background = '';
    toast.style.color = '';
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// === 核心：全域編輯/刪除函式 ===
window.deleteRecord = function(key, id) {
    if(!confirm('確定刪除此紀錄?')) return;
    var data = JSON.parse(localStorage.getItem(key) || '[]');
    var newData = data.filter(x => parseInt(x.id) !== parseInt(id));
    localStorage.setItem(key, JSON.stringify(newData));
    markDataDirty();
    loadAllData();
    showToast('🗑️ 已刪除');
};

window.editCharge = function(id) {
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var r = data.find(x => parseInt(x.id) === parseInt(id));
    if (!r) { showToast('找不到紀錄', 'error'); return; }
    
    safe('editingChargeId').value = r.id;
    safe('edit_cStartTime').value = toLocalISO(r.startTime);
    safe('edit_cEndTime').value = toLocalISO(r.endTime);
    safe('edit_cOdo').value = r.odo;
    safe('edit_cStation').value = r.station || '';
    
    safe('edit_cBatteryStart').value = r.batteryStart;
    safe('edit_cBatteryEnd').value = r.batteryEnd;
    
    safe('edit_cKwh').value = r.kwh || '';
    safe('edit_cCost').value = r.cost || '';
    safe('edit_cNotes').value = r.notes || '';
    safe('editChargeModal').classList.add('active');
};

window.editMaintenance = function(id) {
    var data = JSON.parse(localStorage.getItem('maintenanceLog'));
    var r = data.find(x => parseInt(x.id) === parseInt(id));
    if(!r) return;
    
    safe('editingMaintId').value = r.id;
    safe('mDate').value = getRecordDateStr(r);
    safe('mTime').value = getRecordTimeStr(r);
    
    safe('mOdo').value = r.odo;
    safe('mType').value = r.type;
    safe('mNotes').value = r.notes || '';
    
    var sel = safe('mLocationSelect');
    if(r.location === '基隆成功專賣店') {
        sel.value = r.location;
        safe('mLocationInput').style.display = 'none';
    } else {
        sel.value = '其他';
        safe('mLocationInput').style.display = 'block';
        safe('mLocationInput').value = r.location || '';
    }
    
    safe('partsList').innerHTML = '';
    if(r.parts) r.parts.forEach(p => addPartItem(p.name, p.cost));
    updateTotalCost();
    
    safe('maintTitle').textContent = '編輯保養';
    safe('cancelMaintEdit').style.display = 'block';
    document.querySelector('.tab-button[data-tab="maintenance"]').click();
};

window.editExpense = function(id) {
    var data = JSON.parse(localStorage.getItem('expenseLog'));
    var r = data.find(x => parseInt(x.id) === parseInt(id));
    if(!r) return;
    
    safe('editingExpenseId').value = r.id;
    safe('eDate').value = getRecordDateStr(r);
    safe('eTime').value = getRecordTimeStr(r);
    
    safe('eCategory').value = r.category;
    safe('eAmount').value = r.amount;
    safe('eDescription').value = r.description || '';
    safe('eOdo').value = r.odo || '';
    
    safe('expenseTitle').textContent = '編輯花費';
    safe('cancelExpenseEdit').style.display = 'block';
    document.querySelector('.tab-button[data-tab="expense"]').click();
};

// === 初始化 ===
document.addEventListener('DOMContentLoaded', function() {
    try {
        var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (s.theme) applyTheme(s.theme);

        initEventListeners();
        populateMaintTemplates();
        populateMonthFilters(); 
        loadAllData();
        
        prefillForms();
        
        updateChargeUI();
        checkBackupStatus();
        
        var verEl = safe('appVersion');
        if(verEl) verEl.textContent = 'Ver: ' + APP_VERSION;

        if (localStorage.getItem('currentChargingSession')) {
            var chargeTabBtn = document.querySelector('.tab-button[data-tab="charge"]');
            if (chargeTabBtn) chargeTabBtn.click();
        }
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
            
            if (e.target.dataset.tab === 'status' || e.target.dataset.tab === 'charge') {
                prefillForms();
            }
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
    if(safe('restoreFromCloudBtn')) safe('restoreFromCloudBtn').addEventListener('click', restoreFromGoogleSheets); 
    
    if(safe('recalcCostBtn')) safe('recalcCostBtn').addEventListener('click', recalcElectricityCost);

    ['chargeMonthFilter', 'chargeSearch'].forEach(id => { if(safe(id)) safe(id).addEventListener('input', filterChargeTable); });
    ['maintMonthFilter', 'maintTypeFilter'].forEach(id => { if(safe(id)) safe(id).addEventListener('change', filterMaintTable); });
    ['expenseMonthFilter', 'expenseCategoryFilter'].forEach(id => { if(safe(id)) safe(id).addEventListener('change', filterExpenseTable); });
    
    if(safe('themeSelect')) safe('themeSelect').addEventListener('change', function(e) {
        var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        s.theme = e.target.value;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        applyTheme(s.theme);
    });
}

// === 資料處理 ===
function optimizeRecord(record) {
    const optimized = { ...record };
    if (optimized.startTime) {
        delete optimized.date;
        delete optimized.time;
    }
    Object.keys(optimized).forEach(key => {
        const val = optimized[key];
        if (val === null || val === undefined || val === '') delete optimized[key];
        if (Array.isArray(val) && val.length === 0) delete optimized[key];
    });
    return optimized;
}

function getRecordTimestamp(r) {
    if (!r) return 0;
    if (r.startTime) return new Date(r.startTime).getTime();
    
    var dateStr = (r.date || "").slice(0, 10); 
    if (dateStr) {
        var timeStr = r.time || "00:00";
        if (timeStr.includes('T')) { 
             try {
                var d = new Date(timeStr);
                timeStr = d.toTimeString().slice(0,5);
            } catch(e) { timeStr = "00:00"; }
        }
        return new Date(dateStr + 'T' + timeStr).getTime();
    }
    return 0;
}

function getRecordDateStr(r) {
    if (r.startTime) return r.startTime.slice(0, 10);
    return (r.date || "").slice(0, 10);
}

function getRecordTimeStr(r) {
    if (r.startTime) return toLocalISO(r.startTime).slice(11, 16); 
    var t = r.time || "00:00";
    if (t.includes('T')) {
        try { return new Date(t).toTimeString().slice(0,5); } catch(e){ return "00:00"; }
    }
    return t.slice(0, 5);
}

function checkMileageAnomaly(newOdo, recordDateStr) {
    var latestData = getLatestState();
    var latest = latestData.rawRecord;
    if (!latest) return true; 
    
    var lastDateVal = getRecordTimestamp(latest);
    var newDateVal = new Date(recordDateStr).getTime();
    var lastOdo = parseFloat(latest.odo) || 0;
    var diffKm = newOdo - lastOdo;
    var diffDays = (newDateVal - lastDateVal) / (1000 * 60 * 60 * 24);
    
    if (diffDays <= 7 && diffKm > 100) {
        var dateStr = new Date(lastDateVal).toLocaleDateString();
        return confirm(`⚠️ 里程異常警告：\n上次：${lastOdo} km (${dateStr})\n本次：${newOdo} km\n差距：${diffKm.toFixed(1)} km (${Math.round(Math.abs(diffDays))}天)\n\n確定儲存？`);
    }
    return true;
}

function getLatestState() {
    var charges = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var statuses = JSON.parse(localStorage.getItem('statusLog') || '[]');
    var maints = JSON.parse(localStorage.getItem('maintenanceLog') || '[]');
    var expenses = JSON.parse(localStorage.getItem('expenseLog') || '[]');

    var allRecords = [];
    
    // 充電紀錄：battery 取用 batteryEnd (符合需求：充電後電量)
    charges.forEach(r => allRecords.push({ ts: getRecordTimestamp(r), odo: parseFloat(r.odo), battery: r.batteryEnd, type: 'charge', raw: r }));
    statuses.forEach(r => allRecords.push({ ts: getRecordTimestamp(r), odo: parseFloat(r.odo), battery: r.battery, type: 'status', raw: r }));
    maints.forEach(r => allRecords.push({ ts: getRecordTimestamp(r), odo: parseFloat(r.odo), battery: null, type: 'maint', raw: r }));
    expenses.forEach(r => allRecords.push({ ts: getRecordTimestamp(r), odo: parseFloat(r.odo), battery: null, type: 'expense', raw: r }));

    allRecords.sort((a, b) => b.ts - a.ts); // 排序：新 -> 舊

    if (allRecords.length === 0) return { odo: 0, battery: null, rawRecord: null, lastTs: 0 };

    var latestOdo = 0;
    var latestOdoRec = allRecords.find(r => r.odo > 0);
    if (latestOdoRec) latestOdo = latestOdoRec.odo;

    // 尋找最新的電量記錄 (包含充電與狀態更新)
    var latestBat = null;
    var latestBatRec = allRecords.find(r => (r.type === 'charge' || r.type === 'status') && r.battery !== null && r.battery !== undefined);
    if (latestBatRec) latestBat = parseInt(latestBatRec.battery);

    return { odo: latestOdo, battery: latestBat, rawRecord: allRecords[0].raw, lastTs: allRecords[0].ts };
}

function prefillForms() {
    var state = getLatestState();
    updateLastUpdateTimeDisplay(state.lastTs);

    if (safe('sOdo')) safe('sOdo').value = state.odo || '';
    if (state.battery !== null) {
        var sb = document.querySelector(`input[name="sBattery"][value="${state.battery}"]`);
        if(sb) sb.checked = true;
    }

    if (safe('cOdo')) safe('cOdo').value = state.odo || '';
    if (state.battery !== null) {
        var cb = document.querySelector(`input[name="cBatteryStart"][value="${state.battery}"]`);
        if(cb) cb.checked = true;
    }
}

function updateLastUpdateTimeDisplay(timestamp) {
    var display = safe('lastUpdateInfo');
    if (!display || !timestamp) { if(display) display.textContent = ''; return; }
    var now = Date.now();
    var diffMs = now - timestamp;
    var diffMin = Math.floor(diffMs / 60000);
    var diffHour = Math.floor(diffMin / 60);
    var diffDay = Math.floor(diffHour / 24);

    var text = "最後更新：剛剛";
    if (diffDay > 0) text = `最後更新：${diffDay} 天前`;
    else if (diffHour > 0) text = `最後更新：${diffHour} 小時前`;
    else if (diffMin > 0) text = `最後更新：${diffMin} 分鐘前`;
    display.textContent = text;
}

function markDataDirty() {
    localStorage.setItem(DIRTY_KEY, 'true');
    checkBackupStatus(); 
}

function checkBackupStatus() {
    try {
        var alertBox = safe('topAlert');
        var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        var lastBackup = localStorage.getItem(BACKUP_KEY);
        var isDirty = localStorage.getItem(DIRTY_KEY) === 'true';

        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'topAlert';
            alertBox.className = 'top-alert';
            document.body.prepend(alertBox);
        }

        var showMsg = false;
        var msgText = '';
        var clickAction = null;
        var isUnsyncedAlert = false;

        if (isDirty && settings.gasUrl) {
            showMsg = true;
            isUnsyncedAlert = true;
            msgText = '⚠️ 您有新變更尚未同步到雲端 [立即同步]';
            clickAction = function() { syncToGoogleSheets(); this.classList.remove('show'); };
        } 
        else if (!lastBackup || (daysBetween(lastBackup, new Date().toISOString().slice(0,10)) > 30)) {
            showMsg = true;
            if (settings.gasUrl) {
                msgText = '☁️ 系統偵測到您很久未備份，點此<b>立即同步到雲端</b>';
                clickAction = function() { syncToGoogleSheets(); this.classList.remove('show'); };
            } else {
                msgText = '⚠️ 您尚未備份過資料，點此<b>前往設定頁面匯出</b>';
                clickAction = function() { document.querySelector('.tab-button[data-tab="settings"]').click(); this.classList.remove('show'); };
            }
        }

        if (showMsg) {
            alertBox.innerHTML = msgText;
            alertBox.onclick = clickAction;
            if (isUnsyncedAlert) alertBox.classList.add('unsynced'); else alertBox.classList.remove('unsynced');
            alertBox.classList.add('show');
        } else {
            alertBox.classList.remove('show');
            alertBox.classList.remove('unsynced');
        }
    } catch (err) { console.error('checkBackupStatus error', err); }
}

function recalcElectricityCost() {
    var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    var rate = parseFloat(settings.electricRate);
    if (!rate) { alert('請先在設定頁面設定「電費單價」'); return; }
    if (!confirm(`確定要依據單價 ${rate} 元重新計算目前顯示月份的「公司」或「家裡」充電費用嗎？\n(計算將無條件進位至小數後2位)`)) return;

    var month = safe('chargeMonthFilter').value; 
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var count = 0;

    data.forEach(r => {
        var dateStr = getRecordDateStr(r).slice(0,7);
        if (month && dateStr !== month) return;
        var st = (r.stationType || '').trim();
        var sn = (r.station || '').trim();
        var isTarget = (st === '公司' || st === '家裡') || (sn === '公司' || sn === '家裡');
        if (isTarget) {
            var kwh = parseFloat(r.kwh) || 0;
            if (kwh > 0) {
                var newCost = Math.ceil((kwh * rate) * 100) / 100;
                if (r.cost !== newCost) { r.cost = newCost; count++; }
            }
        }
    });

    if (count > 0) {
        var optimizedData = data.map(optimizeRecord);
        optimizedData.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
        localStorage.setItem('chargeLog', JSON.stringify(optimizedData));
        markDataDirty();
        loadChargeHistory(); 
        updateDashboard(); 
        showToast(`✅ 已重新計算 ${count} 筆紀錄`);
    } else { showToast('沒有符合條件需更新的紀錄'); }
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
    markDataDirty();
    localStorage.removeItem('currentChargingSession');
    safe('endChargeForm').reset();
    if (chargeTimer) { clearInterval(chargeTimer); chargeTimer = null; }
    updateChargeUI();
    loadAllData();
    prefillForms();
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
        var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
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
    }
}

function saveStatus(e) {
    e.preventDefault();
    if (!checkMileageAnomaly(parseFloat(safe('sOdo').value), new Date().toISOString().slice(0,10))) return;
    var now = new Date();
    var record = {
        id: Date.now(),
        startTime: now.toISOString(),
        odo: parseFloat(safe('sOdo').value) || 0,
        battery: parseInt(document.querySelector('input[name="sBattery"]:checked').value),
    };
    localStorage.setItem('statusLog', JSON.stringify([optimizeRecord(record)])); 
    markDataDirty();
    safe('statusForm').reset();
    loadAllData();
    prefillForms();
    showToast('✅ 狀態已更新');
}

function saveMaintenance(e) {
    e.preventDefault();
    var dateVal = safe('mDate').value;
    var timeVal = safe('mTime').value;
    if (!checkMileageAnomaly(parseFloat(safe('mOdo').value), dateVal)) return;
    
    var parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        parts.push({
            name: item.querySelector('.part-name').value,
            cost: parseFloat(item.querySelector('.part-cost').value) || 0
        });
    });
    var loc = safe('mLocationSelect').value;
    if(loc === '其他') loc = safe('mLocationInput').value;
    
    var startTime = new Date(dateVal + 'T' + (timeVal || '00:00')).toISOString();
    var record = {
        id: safe('editingMaintId').value ? parseInt(safe('editingMaintId').value) : Date.now(),
        startTime: startTime, 
        odo: parseFloat(safe('mOdo').value) || 0,
        location: loc,
        type: safe('mType').value,
        notes: safe('mNotes').value,
        parts: parts,
        totalCost: parseFloat(safe('totalCost').textContent)
    };
    saveData('maintenanceLog', record, !!safe('editingMaintId').value);
    markDataDirty();
    cancelMaintEdit();
    loadAllData();
    showToast('✅ 保養儲存成功');
}

function saveExpense(e) {
    e.preventDefault();
    var dateVal = safe('eDate').value;
    var timeVal = safe('eTime').value;
    if (safe('eOdo').value) {
         if (!checkMileageAnomaly(parseFloat(safe('eOdo').value), dateVal)) return;
    }
    var startTime = new Date(dateVal + 'T' + (timeVal || '00:00')).toISOString();
    var record = {
        id: safe('editingExpenseId').value ? parseInt(safe('editingExpenseId').value) : Date.now(),
        startTime: startTime,
        category: safe('eCategory').value,
        amount: parseFloat(safe('eAmount').value) || 0,
        odo: parseFloat(safe('eOdo').value) || 0,
        description: safe('eDescription').value
    };
    saveData('expenseLog', record, !!safe('editingExpenseId').value);
    markDataDirty();
    cancelExpenseEdit();
    loadAllData();
    showToast('✅ 花費儲存成功');
}

function saveData(key, record, isEdit) {
    var data = JSON.parse(localStorage.getItem(key) || '[]');
    var finalRecord = optimizeRecord(record);
    if (isEdit) {
        var idx = data.findIndex(r => parseInt(r.id) === parseInt(record.id));
        if (idx !== -1) data[idx] = finalRecord;
    } else {
        data.push(finalRecord);
    }
    data.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    localStorage.setItem(key, JSON.stringify(data));
}

function saveEditCharge(e) {
    e.preventDefault();
    var id = parseInt(safe('editingChargeId').value);
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    var idx = data.findIndex(x => parseInt(x.id) === id);
    if (idx === -1) return;
    
    var r = data[idx];
    r.startTime = new Date(safe('edit_cStartTime').value).toISOString();
    r.endTime = new Date(safe('edit_cEndTime').value).toISOString();
    r.odo = parseFloat(safe('edit_cOdo').value);
    r.station = safe('edit_cStation').value;
    r.batteryStart = parseInt(safe('edit_cBatteryStart').value);
    r.batteryEnd = parseInt(safe('edit_cBatteryEnd').value);
    r.kwh = parseFloat(safe('edit_cKwh').value);
    r.cost = parseFloat(safe('edit_cCost').value);
    r.notes = safe('edit_cNotes').value;
    var ms = new Date(r.endTime) - new Date(r.startTime);
    r.duration = formatDuration(ms);
    
    saveData('chargeLog', r, true);
    markDataDirty();
    closeEditModal();
    loadAllData();
    showToast('✅ 記錄已更新');
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

function cancelExpenseEdit() {
    safe('expenseForm').reset();
    safe('editingExpenseId').value = '';
    safe('expenseTitle').textContent = '💰 記錄花費';
    safe('cancelExpenseEdit').style.display = 'none';
    populateDateTime('eDate','eTime');
}

function closeEditModal() {
    safe('editChargeModal').classList.remove('active');
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

function updateTotalCost() {
    var total = 0;
    document.querySelectorAll('.part-cost').forEach(el => total += (parseFloat(el.value) || 0));
    safe('totalCost').textContent = total;
}

function loadAllData() {
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
        var o = parseFloat(d.odo) || 0;
        if(d && o > maxOdo) maxOdo = o;
    });
    safe('totalMileage').textContent = maxOdo.toFixed(1);
    
    var totalCost = 0;
    maint.forEach(i => totalCost += (parseFloat(i.totalCost) || 0));
    charge.forEach(i => totalCost += (parseFloat(i.cost) || 0));
    expense.forEach(i => totalCost += (parseFloat(i.amount) || 0));
    safe('totalExpense').textContent = Math.round(totalCost).toLocaleString();
    safe('statTotalCost').textContent = Math.round(totalCost).toLocaleString() + ' NT$';

    var totalChargeCost = 0;
    charge.forEach(i => totalChargeCost += (parseFloat(i.cost) || 0));

    if (charge.length > 0) {
        var last = charge[0]; 
        var days = daysBetween(getRecordDateStr(last), new Date().toISOString().slice(0,10));
        safe('lastChargeDays').textContent = (days === 0 ? '今天' : days + '天前');
        var riddenSince = maxOdo - (parseFloat(last.odo)||0);
        safe('lastChargeDate').textContent = '充電後已騎乘 ' + riddenSince.toFixed(1) + ' 公里'; 
    } else {
        safe('lastChargeDays').textContent = '-';
        safe('lastChargeDate').textContent = '無記錄';
    }

    var regularMaint = maint.filter(m => m.type === '定期保養');
    // 確保保養資料也是依照日期排序，以便抓到「最後一次」
    regularMaint.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

    if (regularMaint.length > 0) {
        var lastMaint = regularMaint[0];
        var kmSince = maxOdo - (parseFloat(lastMaint.odo)||0);
        var kmLeft = REGULAR_SERVICE_KM - kmSince;
        var daysSince = daysBetween(getRecordDateStr(lastMaint), new Date().toISOString().slice(0,10));
        var daysLeft = REGULAR_SERVICE_DAYS - daysSince;
        
        // 顯示「保養後已騎 X km」
        var noteHtml = `<div style="font-size:0.8rem; color:var(--secondary); margin-top:2px;">保養後已騎 ${Math.round(kmSince)} km</div>`;

        if (kmLeft < 0 || daysLeft < 0) {
            safe('nextServiceStatus').textContent = "已超過";
            safe('nextServiceStatus').style.color = "var(--danger)";
            safe('nextServiceDate').innerHTML = "建議立即保養" + noteHtml;
        } else {
            safe('nextServiceStatus').textContent = `${daysLeft} 天後`;
            safe('nextServiceStatus').style.color = "var(--primary)";
            safe('nextServiceDate').innerHTML = `或 ${Math.round(kmLeft)} 公里` + noteHtml;
        }
    } else {
        var firstLeft = 300 - maxOdo;
        var noteHtml = `<div style="font-size:0.8rem; color:var(--secondary); margin-top:2px;">新車累計 ${Math.round(maxOdo)} km</div>`;
        if (firstLeft > 0) {
            safe('nextServiceStatus').textContent = "新車訓車期";
            safe('nextServiceDate').innerHTML = `剩餘 ${Math.round(firstLeft)} 公里` + noteHtml;
        } else {
            safe('nextServiceStatus').textContent = "請進行首次保養";
            safe('nextServiceStatus').style.color = "var(--danger)";
            safe('nextServiceDate').innerHTML = "已達 300 公里" + noteHtml;
        }
    }
    
    if(maxOdo > 0) {
        safe('statCostPerKm').textContent = (totalCost / maxOdo).toFixed(2) + " NT$";
        if(safe('statChargeCostPerKm')) {
            safe('statChargeCostPerKm').textContent = (totalChargeCost / maxOdo).toFixed(2) + " NT$";
        }
    }
    safe('statTotalMileage').textContent = maxOdo.toFixed(1) + " 公里";
    var daysRange = 1;
    var allRec = [charge, maint, expense, status].flat();
    if(allRec.length > 1) {
        allRec.sort((a,b) => getRecordTimestamp(a) - getRecordTimestamp(b)); 
        daysRange = daysBetween(getRecordDateStr(allRec[0]), new Date().toISOString().slice(0,10)) || 1;
    }
    safe('statAvgDaily').textContent = (maxOdo / daysRange).toFixed(1) + " 公里";
}

function loadChargeHistory() {
    var data = JSON.parse(localStorage.getItem('chargeLog') || '[]');
    data.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
    
    var tripMap = {};
    for (let i = 0; i < data.length - 1; i++) {
        const current = data[i];
        const previous = data[i+1];
        const dist = (parseFloat(current.odo) - parseFloat(previous.odo)).toFixed(1);
        tripMap[current.id] = dist > 0 ? `+${dist}` : `${dist}`;
    }
    if(data.length > 0) tripMap[data[data.length-1].id] = '首筆';

    var list = safe('chargeList');
    if(!list) return;
    list.innerHTML = '';
    
    var search = safe('chargeSearch').value.toLowerCase();
    var month = safe('chargeMonthFilter').value; 
    
    var filtered = data.filter(r => {
        var matchSearch = (r.station || '').toLowerCase().includes(search);
        var matchMonth = !month || getRecordDateStr(r).startsWith(month);
        return matchSearch && matchMonth;
    });

    var effTotal = 0, effCount = 0, maxEff = 0;
    var reversed = [...data].reverse();
    var effMap = {};
    for(let i=1; i<reversed.length; i++) {
        let curr = reversed[i], prev = reversed[i-1];
        let dist = (parseFloat(curr.odo)||0) - (parseFloat(prev.odo)||0);
        let kwh = parseFloat(curr.kwh)||0;
        if (dist > 0 && kwh > 0) {
            let eff = dist / kwh;
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
        var tripDist = tripMap[r.id] || '-';
        var dateStr = getRecordDateStr(r).replace(/-/g,'/');
        var timeStr = formatTime(r.startTime || (getRecordDateStr(r) + 'T' + (r.time || '00:00')));
        
        var card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="card-date">${dateStr}</span>
                    <span class="card-time">${timeStr}</span>
                </div>
                <span class="card-badge">${r.station || '未知'}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">里程</span>
                    <span class="card-val">${r.odo} km <small style="color:var(--success); font-weight:bold;">(${tripDist})</small></span>
                </div>
                <div class="card-row">
                    <span class="card-label">時長</span>
                    <span class="card-val">${r.duration || '-'}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">電量</span>
                    <span class="card-val">${r.batteryStart} → ${r.batteryEnd} 格</span>
                </div>
                <div class="card-row">
                    <span class="card-label">效率</span>
                    <span class="card-val">${r.kwh || 0} kWh / <span class="highlight">${eff}</span> km/kWh</span>
                </div>
                <div class="card-row">
                    <span class="card-label">費用</span>
                    <span class="card-val cost">$${r.cost || 0}</span>
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
    data.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

    var list = safe('maintList');
    if(!list) return;
    list.innerHTML = '';
    
    var month = safe('maintMonthFilter').value;
    var type = safe('maintTypeFilter').value;
    var filtered = data.filter(r => (!month || getRecordDateStr(r).startsWith(month)) && (!type || r.type === type));
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">本月尚無紀錄</div>';
        return;
    }

    filtered.forEach(r => {
        var dateStr = getRecordDateStr(r).replace(/-/g,'/');
        var items = r.parts ? r.parts.map(p => p.name).join(', ') : (r.notes || '');

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
                    <span class="card-val">${r.location || '-'}</span>
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
                    <span class="card-val cost">$${r.totalCost || 0}</span>
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
    data.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

    var list = safe('expenseList');
    if(!list) return;
    list.innerHTML = '';
    
    var month = safe('expenseMonthFilter').value;
    var cat = safe('expenseCategoryFilter').value;
    var filtered = data.filter(r => (!month || getRecordDateStr(r).startsWith(month)) && (!cat || r.category === cat));
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">本月尚無紀錄</div>';
        return;
    }

    filtered.forEach(r => {
        var dateStr = getRecordDateStr(r).replace(/-/g,'/');
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
    
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ electricRate: rate, gasUrl: gasUrl, theme: theme }));
    markDataDirty();
    applyTheme(theme);
    showToast('設定已儲存');
}

function applyTheme(theme) {
    if (!theme) {
        var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        theme = s.theme || 'light';
    }
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function autoCalculateCost() {
    if(safe('cKwh').dataset.autoCalc !== "true") return;
    var rate = parseFloat(safe('electricRate').value) || 0;
    var kwh = parseFloat(safe('cKwh').value) || 0;
    var rawCost = rate * kwh;
    var finalCost = Math.ceil(rawCost * 100) / 100;
    safe('cCost').value = finalCost.toFixed(2);
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
        JSON.parse(localStorage.getItem(key)||'[]').forEach(i => dates.add(getRecordDateStr(i).slice(0,7)));
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
            markDataDirty();
            loadAllData();
            showToast('✅ 資料匯入成功');
        } catch(err) { showToast('匯入失敗', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function exportAllData() {
    var data = {
        chargeLog: JSON.parse(localStorage.getItem('chargeLog')||'[]').map(optimizeRecord),
        maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog')||'[]').map(optimizeRecord),
        expenseLog: JSON.parse(localStorage.getItem('expenseLog')||'[]').map(optimizeRecord),
        statusLog: JSON.parse(localStorage.getItem('statusLog')||'[]').map(optimizeRecord),
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

function syncToGoogleSheets() {
    if (!navigator.onLine) {
        showToast('❌ 離線狀態無法同步', 'error');
        return;
    }

    var settings = loadSettings();
    if (!settings.gasUrl) {
        showToast('請先在設定頁面輸入 GAS API 網址', 'error');
        return;
    }
    
    if (!confirm('確定要將本機資料同步到 Google Sheets 嗎？(注意：這將覆蓋雲端上的舊備份)')) return;

    var payload = {
        action: 'sync',
        chargeLog: JSON.parse(localStorage.getItem('chargeLog')||'[]').map(optimizeRecord),
        maintenanceLog: JSON.parse(localStorage.getItem('maintenanceLog')||'[]').map(optimizeRecord),
        expenseLog: JSON.parse(localStorage.getItem('expenseLog')||'[]').map(optimizeRecord),
        statusLog: JSON.parse(localStorage.getItem('statusLog')||'[]').map(optimizeRecord)
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
            localStorage.removeItem(DIRTY_KEY);
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
        body: JSON.stringify({ action: 'restore' })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success' && data.data) {
            var d = data.data;

            const sanitize = (list) => {
                if(!Array.isArray(list)) return [];
                return list.map(item => {
                    if (typeof item.odo === 'string' && item.odo.startsWith('1900')) {
                        item.odo = 0; 
                    }
                    return optimizeRecord(item);
                });
            };

            if(d.ChargeLog) localStorage.setItem('chargeLog', JSON.stringify(sanitize(d.ChargeLog)));
            if(d.MaintenanceLog) localStorage.setItem('maintenanceLog', JSON.stringify(sanitize(d.MaintenanceLog)));
            if(d.ExpenseLog) localStorage.setItem('expenseLog', JSON.stringify(sanitize(d.ExpenseLog)));
            if(d.StatusLog) localStorage.setItem('statusLog', JSON.stringify(sanitize(d.StatusLog)));
            
            localStorage.removeItem(DIRTY_KEY);
            localStorage.setItem(BACKUP_KEY, new Date().toISOString().slice(0,10));
            
            showToast('✅ 還原成功！頁面將重新整理...');
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast('❌ 還原失敗: ' + (data.message || '無資料'), 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('❌ 網路錯誤或 API 未支援還原', 'error');
    });
}

// --- 自動偵測更新邏輯 (新增於 motolog.js 末端) ---
if ('serviceWorker' in navigator) {
    // 監聽來自 sw.js 的控制權變動
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        // 當 Service Worker 更新並接管頁面時，不強制刷新，讓使用者手動點擊
    });

    // 頁面載入後檢查更新
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').then(reg => {
            // 定期檢查伺服器是否有新版 sw.js (預設每小時檢查一次，或重開 App 時檢查)
            reg.update();

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    // 當新版本安裝完成 (installed) 且目前已有舊版在執行時
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotify();
                    }
                });
            });
        });
    });
}

// 顯示更新提示 UI
function showUpdateNotify() {
    // 檢查是否已存在提示，避免重複產生
    if (document.getElementById('pwa-update-banner')) return;

    const notifyDiv = document.createElement('div');
    notifyDiv.id = 'pwa-update-banner';
    // 這裡的樣式建議配合您原本的 CSS 變數 (如 --primary)
    notifyDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary, #2563eb);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 15px;
        font-weight: bold;
        width: 90%;
        max-width: 400px;
        justify-content: space-between;
        animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    
    notifyDiv.innerHTML = `
        <span style="font-size: 14px;">🚀 發現新版本 (v${APP_VERSION.split('v')[1]})</span>
        <button id="pwa-reload-btn" style="background: white; color: var(--primary, #2563eb); border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; white-space: nowrap;">立即更新</button>
    `;
    
    document.body.appendChild(notifyDiv);
    
    document.getElementById('pwa-reload-btn').onclick = function() {
        window.location.reload();
    };
}
