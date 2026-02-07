/**
 * 加班費計算機 v2.8.5 - JavaScript
 * - 修正編輯紀錄時時間載入問題
 * - 特休分頁支援編輯、刪除與統計顯示
 */

(function() {
    'use strict';

    // --- 常數定義 ---
    const LABOR_STANDARDS = {
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
    const recordTableBody = document.querySelector('#record-table tbody');
    const monthFilter = document.getElementById('month-filter');
    const totalOvertimeDisplay = document.getElementById('total-overtime');
    const totalPayDisplay = document.getElementById('total-pay');
    
    // 特休相關 DOM
    const leaveDateInput = document.getElementById('leave-date');
    const leaveHoursInput = document.getElementById('leave-hours');
    const leaveTypeInput = document.getElementById('leave-type');
    const leaveNoteInput = document.getElementById('leave-note');
    const addLeaveBtn = document.getElementById('add-leave');
    const leaveListBody = document.querySelector('#leave-list tbody');

    // --- 變數 ---
    let settings = {
        salary: 0,
        hourlyRate: 0,
        joinDate: '',
        annualLeaveBase: 0
    };
    let records = [];
    let editingId = null;
    let editingLeaveId = null; // 用於特休編輯

    // --- 輔助函式 ---
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => toast.className = 'toast', 3000);
    }

    function calculateDiffInHours(start, end) {
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60; // 跨夜
        return diff / 60;
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()} (${['日','一','二','三','四','五','六'][d.getDay()]})`;
    }

    function getYearMonth(dateStr) {
        return dateStr.substring(0, 7);
    }

    function updateModifiedTimestamp() {
        localStorage.setItem(STORAGE_KEYS.LAST_MODIFIED, Date.now().toString());
        checkSyncStatus();
    }

    // --- 資料存取 ---
    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (saved) settings = JSON.parse(saved);
        salaryInput.value = settings.salary || '';
        hourlyRateInput.value = settings.hourlyRate || '';
        document.getElementById('join-date').value = settings.joinDate || '';
        document.getElementById('annual-leave-base').value = settings.annualLeaveBase || 0;
    }

    function saveSettings() {
        settings.salary = Number(salaryInput.value);
        settings.hourlyRate = Number(hourlyRateInput.value);
        settings.joinDate = document.getElementById('join-date').value;
        settings.annualLeaveBase = Number(document.getElementById('annual-leave-base').value);
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        updateModifiedTimestamp();
        render();
        showToast('設定已儲存');
    }

    function loadRecords() {
        const saved = localStorage.getItem(STORAGE_KEYS.RECORDS);
        if (saved) records = JSON.parse(saved);
    }

    function saveRecords() {
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
        updateModifiedTimestamp();
    }

    // --- 核心邏輯：加班費計算 ---
    function calculateOvertimePay(hours, type, rate) {
        let pay = 0;
        let details = [];

        if (type === 'weekday') {
            const h1 = Math.min(hours, 2);
            const h2 = Math.max(0, hours - 2);
            const p1 = Math.round(h1 * rate * LABOR_STANDARDS.WEEKDAY_RATE_1);
            const p2 = Math.round(h2 * rate * LABOR_STANDARDS.WEEKDAY_RATE_2);
            pay = p1 + p2;
            details.push(`前2時: ${h1}h × ${LABOR_STANDARDS.WEEKDAY_RATE_1} = ${p1}`);
            if (h2 > 0) details.push(`後續: ${h2}h × ${LABOR_STANDARDS.WEEKDAY_RATE_2} = ${p2}`);
        } else if (type === 'restday') {
            const h1 = Math.min(hours, 2);
            const h2 = Math.min(Math.max(0, hours - 2), 6);
            const h3 = Math.max(0, hours - 8);
            const p1 = Math.round(h1 * rate * LABOR_STANDARDS.RESTDAY_RATE_1);
            const p2 = Math.round(h2 * rate * LABOR_STANDARDS.RESTDAY_RATE_2);
            const p3 = Math.round(h3 * rate * LABOR_STANDARDS.RESTDAY_RATE_3);
            pay = p1 + p2 + p3;
            details.push(`前2時: ${h1}h × ${LABOR_STANDARDS.RESTDAY_RATE_1} = ${p1}`);
            if (h2 > 0) details.push(`3-8時: ${h2}h × ${LABOR_STANDARDS.RESTDAY_RATE_2} = ${p2}`);
            if (h3 > 0) details.push(`9時起: ${h3}h × ${LABOR_STANDARDS.RESTDAY_RATE_3} = ${p3}`);
        } else if (type === 'holiday') {
            pay = Math.round(hours * rate * LABOR_STANDARDS.HOLIDAY_RATE);
            details.push(`全工時: ${hours}h × ${LABOR_STANDARDS.HOLIDAY_RATE} = ${pay}`);
        }

        return { pay, details };
    }

    // --- 操作函式 ---
    function addRecord() {
        const date = document.getElementById('work-date').value;
        const start = document.getElementById('time-start').value;
        const end = document.getElementById('time-end').value;
        const type = document.getElementById('day-type').value;

        if (!date || !start || !end) {
            showToast('請填寫完整資訊', 'danger');
            return;
        }

        const hours = calculateDiffInHours(start, end);
        const { pay, details } = calculateOvertimePay(hours, type, settings.hourlyRate);

        if (editingId) {
            const idx = records.findIndex(r => r.id === editingId);
            records[idx] = { ...records[idx], date, start, end, type, hours, pay, details };
            editingId = null;
            addRecordBtn.textContent = '新增紀錄';
            addRecordBtn.classList.remove('btn-warning');
        } else {
            const newRecord = {
                id: Date.now(),
                date, start, end, type, hours, pay, details
            };
            records.push(newRecord);
        }

        saveRecords();
        render();
        showToast('紀錄已儲存');
        
        // 重置欄位 (保留日期以便連續輸入)
        document.getElementById('time-start').value = '18:00';
        document.getElementById('time-end').value = '';
    }

    function deleteRecord(id) {
        if (!confirm('確定要刪除此紀錄嗎？')) return;
        records = records.filter(r => r.id !== id);
        saveRecords();
        render();
        showToast('紀錄已刪除');
    }

    function editRecord(id) {
        const record = records.find(r => r.id === id);
        if (!record) return;

        document.getElementById('work-date').value = record.date;
        document.getElementById('time-start').value = record.start;
        document.getElementById('time-end').value = record.end;
        document.getElementById('day-type').value = record.type;

        editingId = id;
        addRecordBtn.textContent = '更新紀錄';
        addRecordBtn.classList.add('btn-warning');
        
        // 滾動到頂部方便編輯
        window.scrollTo({ top: 0, behavior: 'smooth' });
        switchTab('punch');
    }

    // --- 特休功能 ---
    function addLeaveRecord() {
        const date = leaveDateInput.value;
        const hours = Number(leaveHoursInput.value);
        const type = leaveTypeInput.value;
        const note = leaveNoteInput.value;

        if (!date || !hours) {
            showToast('請填寫日期與時數', 'danger');
            return;
        }

        if (editingLeaveId) {
            const idx = records.findIndex(r => r.id === editingLeaveId);
            records[idx] = { ...records[idx], date, hours, leaveType: type, note };
            editingLeaveId = null;
            addLeaveBtn.textContent = '新增紀錄';
            addLeaveBtn.classList.remove('btn-warning');
        } else {
            const newLeave = {
                id: Date.now(),
                isLeave: true,
                date,
                hours,
                leaveType: type,
                note
            };
            records.push(newLeave);
        }

        saveRecords();
        render();
        showToast('特休紀錄已儲存');
        
        leaveHoursInput.value = '';
        leaveNoteInput.value = '';
    }

    function editLeave(id) {
        const record = records.find(r => r.id === id);
        if (!record) return;

        leaveDateInput.value = record.date;
        leaveHoursInput.value = record.hours;
        leaveTypeInput.value = record.leaveType || 'annual';
        leaveNoteInput.value = record.note || '';

        editingLeaveId = id;
        addLeaveBtn.textContent = '更新紀錄';
        addLeaveBtn.classList.add('btn-warning');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function deleteLeave(id) {
        if (!confirm('確定要刪除此特休紀錄嗎？')) return;
        records = records.filter(r => r.id !== id);
        saveRecords();
        render();
        showToast('紀錄已刪除');
    }

    // --- 渲染 UI ---
    function render() {
        const selectedMonth = monthFilter.value;
        
        // 過濾加班紀錄
        const filteredRecords = records.filter(r => !r.isLeave && getYearMonth(r.date) === selectedMonth);
        filteredRecords.sort((a, b) => a.date.localeCompare(b.date));

        // 渲染加班表格
        recordTableBody.innerHTML = '';
        let totalHours = 0;
        let totalPay = 0;

        filteredRecords.forEach(r => {
            totalHours += r.hours;
            totalPay += r.pay;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDate(r.date)}</td>
                <td>${r.start} - ${r.end}</td>
                <td>${r.hours.toFixed(1)}</td>
                <td><span class="badge badge-${r.type}">${r.type === 'weekday' ? '平日' : r.type === 'restday' ? '休息日' : '例假'}</span></td>
                <td>$${r.pay.toLocaleString()}</td>
                <td class="action-btns">
                    <button class="btn-icon" onclick="app.editRecord(${r.id})" title="編輯">✏️</button>
                    <button class="btn-icon" onclick="app.deleteRecord(${r.id})" title="刪除">🗑️</button>
                </td>
            `;
            recordTableBody.appendChild(tr);
        });

        totalOvertimeDisplay.textContent = totalHours.toFixed(1);
        totalPayDisplay.textContent = totalPay.toLocaleString();

        // 渲染特休部分
        renderLeave();
    }

    function renderLeave() {
        const currentYear = new Date().getFullYear();
        const leaveRecords = records.filter(r => r.isLeave);
        const annualLeaveUsed = leaveRecords
            .filter(r => r.leaveType === 'annual' && r.date.startsWith(currentYear.toString()))
            .reduce((sum, r) => sum + r.hours, 0);
        
        const totalBaseHours = (settings.annualLeaveBase || 0) * 8;
        const remainingHours = totalBaseHours - annualLeaveUsed;

        // 更新特休統計卡片
        document.getElementById('leave-info-display').innerHTML = `
            <div><strong>今年額度：</strong> ${settings.annualLeaveBase || 0} 天 (${totalBaseHours} 小時)</div>
            <div><strong>已使用：</strong> ${(annualLeaveUsed / 8).toFixed(2)} 天 (${annualLeaveUsed} 小時)</div>
            <div class="${remainingHours < 0 ? 'text-danger' : 'text-success'}">
                <strong>剩餘：</strong> ${(remainingHours / 8).toFixed(2)} 天 (${remainingHours} 小時)
            </div>
        `;

        // 渲染特休清單
        leaveListBody.innerHTML = '';
        const sortedLeaves = [...leaveRecords].sort((a, b) => b.date.localeCompare(a.date));
        
        sortedLeaves.forEach(l => {
            const tr = document.createElement('tr');
            const typeLabel = l.leaveType === 'annual' ? '特休' : l.leaveType === 'compensatory' ? '補休' : '其他';
            tr.innerHTML = `
                <td>${l.date}</td>
                <td>${typeLabel}</td>
                <td>${l.hours} 小時</td>
                <td>${l.note || '-'}</td>
                <td class="action-btns">
                    <button class="btn-icon" onclick="app.editLeave(${l.id})" title="編輯">✏️</button>
                    <button class="btn-icon" onclick="app.deleteLeave(${l.id})" title="刪除">🗑️</button>
                </td>
            `;
            leaveListBody.appendChild(tr);
        });
    }

    // --- 頁面跳轉與初始化 ---
    function switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(tabId).classList.add('active');
        document.querySelector(`.tab-btn[onclick*="${tabId}"]`).classList.add('active');
        
        if (tabId === 'leave') renderLeave();
    }

    function getDefaultMonthValue() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    // --- 事件監聽 ---
    function setupEventListeners() {
        document.getElementById('save-settings').addEventListener('click', saveSettings);
        addRecordBtn.addEventListener('click', addRecord);
        addLeaveBtn.addEventListener('click', addLeaveRecord);
        monthFilter.addEventListener('change', render);

        // 分頁切換全域化
        window.switchTab = switchTab;
    }

    function checkSyncStatus() {
        const lastMod = localStorage.getItem(STORAGE_KEYS.LAST_MODIFIED);
        const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
        const alertBar = document.getElementById('unsynced-alert');
        
        if (lastMod && (!lastSync || Number(lastMod) > Number(lastSync))) {
            alertBar.style.display = 'flex';
        } else {
            alertBar.style.display = 'none';
        }
    }

    function init() {
        loadSettings();
        loadRecords();
        monthFilter.value = getDefaultMonthValue();
        
        setupEventListeners();
        render();

        if (settings.salary > 0) {
            switchTab('punch');
        } else {
            switchTab('settings');
        }
    }

    // --- 全域 API ---
    window.app = {
        deleteRecord,
        editRecord,
        editLeave,
        deleteLeave
    };

    init();

})();
