/**
 * 加班費計算機 v2.8.6 - JavaScript
 * - 增加 DOM 元素存在檢查，防止 null 錯誤
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

    // --- DOM 元素快取 (加上防錯處理) ---
    const getEl = (id) => document.getElementById(id);
    
    const salaryInput = getEl('salary');
    const hourlyRateInput = getEl('hourly-rate');
    const addRecordBtn = getEl('add-record');
    const recordTableBody = document.querySelector('#record-table tbody');
    const monthFilter = getEl('month-filter');
    const totalOvertimeDisplay = getEl('total-overtime');
    const totalPayDisplay = getEl('total-pay');
    
    // 特休相關 DOM
    const leaveDateInput = getEl('leave-date');
    const leaveHoursInput = getEl('leave-hours');
    const leaveTypeInput = getEl('leave-type');
    const leaveNoteInput = getEl('leave-note');
    const addLeaveBtn = getEl('add-leave');
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
    let editingLeaveId = null;

    // --- 輔助函式 ---
    function showToast(message, type = 'success') {
        const toast = getEl('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => toast.className = 'toast', 3000);
    }

    function calculateDiffInHours(start, end) {
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60; 
        return diff / 60;
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()} (${['日','一','二','三','四','五','六'][d.getDay()]})`;
    }

    function getYearMonth(dateStr) {
        return dateStr.substring(0, 7);
    }

    // --- 資料存取 ---
    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (saved) settings = JSON.parse(saved);
        
        // 增加安全檢查，避免 ID 不存在時報錯
        if (salaryInput) salaryInput.value = settings.salary || '';
        if (hourlyRateInput) hourlyRateInput.value = settings.hourlyRate || '';
        if (getEl('join-date')) getEl('join-date').value = settings.joinDate || '';
        if (getEl('annual-leave-base')) getEl('annual-leave-base').value = settings.annualLeaveBase || 0;
    }

    function saveSettings() {
        settings.salary = Number(salaryInput.value);
        settings.hourlyRate = Number(hourlyRateInput.value);
        settings.joinDate = getEl('join-date')?.value || '';
        settings.annualLeaveBase = Number(getEl('annual-leave-base')?.value || 0);
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        render();
        showToast('設定已儲存');
    }

    function loadRecords() {
        const saved = localStorage.getItem(STORAGE_KEYS.RECORDS);
        if (saved) records = JSON.parse(saved);
    }

    function saveRecords() {
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
        localStorage.setItem(STORAGE_KEYS.LAST_MODIFIED, Date.now().toString());
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
            details.push(`前2時: ${h1}h×1.34`);
            if (h2 > 0) details.push(`後續: ${h2}h×1.67`);
        } else if (type === 'restday') {
            const h1 = Math.min(hours, 2);
            const h2 = Math.min(Math.max(0, hours - 2), 6);
            const h3 = Math.max(0, hours - 8);
            pay = Math.round(h1 * rate * 1.34 + h2 * rate * 1.67 + h3 * rate * 2.67);
        } else if (type === 'holiday') {
            pay = Math.round(hours * rate * 1.0);
        }
        return { pay, details };
    }

    // --- 操作函式 ---
    function addRecord() {
        const date = getEl('work-date').value;
        const start = getEl('time-start').value;
        const end = getEl('time-end').value;
        const type = getEl('day-type').value;

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
        } else {
            records.push({ id: Date.now(), date, start, end, type, hours, pay, details });
        }

        saveRecords();
        render();
        showToast('紀錄已儲存');
    }

    function editRecord(id) {
        const record = records.find(r => r.id === id);
        if (!record) return;

        getEl('work-date').value = record.date;
        getEl('time-start').value = record.start;
        getEl('time-end').value = record.end;
        getEl('day-type').value = record.type;

        editingId = id;
        if (addRecordBtn) addRecordBtn.textContent = '更新紀錄';
        switchTab('punch');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function deleteRecord(id) {
        if (!confirm('確定刪除？')) return;
        records = records.filter(r => r.id !== id);
        saveRecords();
        render();
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
        } else {
            records.push({ id: Date.now(), isLeave: true, date, hours, leaveType: type, note });
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function deleteLeave(id) {
        if (!confirm('確定刪除？')) return;
        records = records.filter(r => r.id !== id);
        saveRecords();
        render();
    }

    // --- 渲染 UI ---
    function render() {
        const selectedMonth = monthFilter?.value || '';
        const filteredRecords = records.filter(r => !r.isLeave && getYearMonth(r.date) === selectedMonth);
        filteredRecords.sort((a, b) => a.date.localeCompare(b.date));

        if (recordTableBody) {
            recordTableBody.innerHTML = '';
            let totalH = 0, totalP = 0;
            filteredRecords.forEach(r => {
                totalH += r.hours; totalP += r.pay;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDate(r.date)}</td>
                    <td>${r.start}-${r.end}</td>
                    <td>${r.hours.toFixed(1)}</td>
                    <td>$${r.pay.toLocaleString()}</td>
                    <td>
                        <button onclick="app.editRecord(${r.id})">✏️</button>
                        <button onclick="app.deleteRecord(${r.id})">🗑️</button>
                    </td>
                `;
                recordTableBody.appendChild(tr);
            });
            if (totalOvertimeDisplay) totalOvertimeDisplay.textContent = totalH.toFixed(1);
            if (totalPayDisplay) totalPayDisplay.textContent = totalP.toLocaleString();
        }
        renderLeave();
    }

    function renderLeave() {
        if (!leaveListBody) return;
        const currentYear = new Date().getFullYear().toString();
        const leaveRecords = records.filter(r => r.isLeave);
        const annualUsed = leaveRecords
            .filter(r => r.leaveType === 'annual' && r.date.startsWith(currentYear))
            .reduce((sum, r) => sum + r.hours, 0);
        
        const infoDisp = getEl('leave-info-display');
        if (infoDisp) {
            const base = settings.annualLeaveBase || 0;
            infoDisp.innerHTML = `已用: ${annualUsed}小時 (${(annualUsed/8).toFixed(1)}天) / 剩餘: ${base*8 - annualUsed}小時`;
        }

        leaveListBody.innerHTML = '';
        leaveRecords.sort((a, b) => b.date.localeCompare(a.date)).forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${l.date}</td>
                <td>${l.hours}h</td>
                <td>${l.note || ''}</td>
                <td>
                    <button onclick="app.editLeave(${l.id})">✏️</button>
                    <button onclick="app.deleteLeave(${l.id})">🗑️</button>
                </td>
            `;
            leaveListBody.appendChild(tr);
        });
    }

    function switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        getEl(tabId)?.classList.add('active');
        if (tabId === 'leave') renderLeave();
    }

    function init() {
        loadSettings();
        loadRecords();
        if (monthFilter) {
            const now = new Date();
            monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        getEl('save-settings')?.addEventListener('click', saveSettings);
        addRecordBtn?.addEventListener('click', addRecord);
        addLeaveBtn?.addEventListener('click', addLeaveRecord);
        monthFilter?.addEventListener('change', render);

        window.switchTab = switchTab;
        render();

        if (settings.salary > 0) switchTab('punch');
        else switchTab('settings');
    }

    window.app = { deleteRecord, editRecord, editLeave, deleteLeave };
    init();
})();
