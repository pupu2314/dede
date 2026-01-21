/**
 * 加班費計算機 v2.8.4 - JavaScript
 * - 新增特休計算功能 (曆年制)
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
    const recordsBody = document.getElementById('records-body');
    const totalOvertimePayEl = document.getElementById('total-overtime-pay');
    const summaryTitleEl = document.getElementById('summary-title');
    const summaryPeriodEl = document.getElementById('summary-period');
    const monthFilter = document.getElementById('month-filter');
    const formError = document.getElementById('form-error');
    const editIdInput = document.getElementById('edit-id');
    const punchStartBtn = document.getElementById('punch-start');
    const punchEndBtn = document.getElementById('punch-end');
    const forceFullCalcToggle = document.getElementById('force-full-calc-toggle');
    const onboardDateInput = document.getElementById('onboard-date'); // 新增到職日輸入
    
    // GAS Sync DOM
    const gasUrlInput = document.getElementById('gas-url-input');
    const saveGasUrlBtn = document.getElementById('save-gas-url');
    const resetGasUrlBtn = document.getElementById('reset-gas-url');
    const gasConfigContainer = document.getElementById('gas-config-container');
    const gasSyncActions = document.getElementById('gas-sync-actions');
    const syncUploadBtn = document.getElementById('sync-upload-btn');
    const syncDownloadBtn = document.getElementById('sync-download-btn');
    const syncStatusEl = document.getElementById('sync-status');
    const unsyncedAlert = document.getElementById('unsynced-alert');
    const quickSyncBtn = document.getElementById('quick-sync-btn');
    const toastEl = document.getElementById('toast');
    
    // Tabs DOM
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // --- 應用程式狀態 ---
    let settings = {};
    let records = [];
    let punchTimerInterval = null;
    let gasAppUrl = '';

    // --- 工具函式 ---
    const escapeHtml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const formatDateTimeLocal = (date) => {
        return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
            .toISOString().slice(0, 16);
    };

    const formatTime = (date) => {
        return new Intl.DateTimeFormat('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    };

    const showError = (message) => {
        formError.textContent = message;
        formError.style.display = 'block';
        setTimeout(() => hideError(), 5000);
    };

    const hideError = () => {
        formError.style.display = 'none';
    };

    const isValidNumber = (value) => {
        return typeof value === 'number' && !isNaN(value) && isFinite(value) && value >= 0;
    };

    const isValidDate = (dateString) => {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    };
    
    const throttle = (func, delay) => {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return func.apply(this, args);
            }
        };
    };

    function updateLastModified() {
        const now = Date.now().toString();
        localStorage.setItem(STORAGE_KEYS.LAST_MODIFIED, now);
        checkSyncStatus();
    }

    function showToast(message, type = 'info') {
        toastEl.textContent = message;
        toastEl.className = 'toast show ' + type;
        setTimeout(() => {
            toastEl.className = toastEl.className.replace('show', '');
        }, 3000);
    }

    // --- 特休計算邏輯 (核心) ---
function getLeaveEntitlementByTenure(years) {
        if (years < 0.5) return 0;
        if (years < 1) return 3;
        if (years < 2) return 7;
        if (years < 3) return 10;
        if (years < 5) return 14;
        if (years < 10) return 15;      
        let days = 16 + Math.floor(years - 10);
        return Math.min(days, 30);
    }

    // 計算曆年制特休天數
    function calculateCalendarYearLeave(onboardDateStr, targetYear) {
        if (!onboardDateStr) return 0;
        const onboard = new Date(onboardDateStr);
        const yearStart = new Date(targetYear, 0, 1);
        const yearEnd = new Date(targetYear, 11, 31);
        
        // 如果今年還沒入職，天數為0
        if (onboard > yearEnd) return 0;
    
        // 週年日 (今年的週年日)
        let anniversary = new Date(onboard);
        anniversary.setFullYear(targetYear);
    
        // --- 計算區段比例 (改用 Month + Day/30 邏輯) ---
        
        // 定義計算月份比例的工具函式
        function getMonthProportion(startDate, endDate) {
            // 計算總相差天數
            const msPerDay = 24 * 60 * 60 * 1000;
            const totalDays = (endDate - startDate) / msPerDay + 1; // 含頭尾
            
            // 換算成 "月 + 日/30"
            // 這裡採取簡化邏輯：直接用天數 / 30 來模擬您的公式 (日/30)
            // 若要嚴格對齊 "6個月 + 0天"，通常是看月份差。
            // 但為了通用性，將該年度的比例視為： (該區段天數 / 30) / 12 ? 
            // 您的公式是： (6 + 0/30)/12。代表上半年剛好佔 0.5。
            
            // 實作您公式的邏輯：
            // 1. 先算出 Anniversary 在一年中的落點月份
            // Anniversary 是 7/1。 1/1~6/30 是 Period 1。
            // Period 1 的月數 = (AnniversaryMonth - 1) + (AnniversaryDay - 1)/30
            // 例如 7/1: (7-1) + (1-1)/30 = 6 個月
            return totalDays; 
        }
    
        // 依照您的公式邏輯，我們重新計算 "Period 1 的權重" (prop1)
        let prop1 = 0;
        
        if (anniversary > yearEnd) {
            prop1 = 1; // 整年都是舊年資
        } else if (anniversary <= yearStart) {
            prop1 = 0; // 整年都是新年資
        } else {
            // 核心修改：使用 (月 + 日/30) / 12 的公式
            // 假設到職日是 M月 D日
            const month = onboard.getMonth(); // 0-based (0=Jan, 6=July)
            const day = onboard.getDate();
            
            // 公式： (經過的月數 + 經過的零頭天數/30) / 12
            // 因為 Anniversary 是到職月日，所以 Period 1 (1/1 ~ Anniversary前一日) 的長度剛好就是到職日的月份數
            // 例如 7月1日到職：
            // 1月~6月 = 6個月。 7/1 當天算下個年度。
            // 零頭天數 = day - 1。
            
            const fullMonths = month; // 7月是 index 6，剛好代表前6個月滿
            const days = day - 1;     // 1號代表沒有多餘天數
            
            // 您的公式部分： (6 + 0/30) / 12
            prop1 = (fullMonths + (days / 30)) / 12;
        }
    
        const prop2 = 1 - prop1; // 剩下就是下個年度的比例
    
        // --- 取得天數權益 ---
        // 注意：這裡依舊使用原本的年資計算邏輯來查表
        // 若您的 18/19 天是優於勞基法的，請記得修改 getLeaveEntitlementByTenure 函式
        const yearsServedAtAnniversary = targetYear - onboard.getFullYear();
        
        // Period 1 (週年日前): 滿 (Years-1) 年的權益
        const entitlement1 = getLeaveEntitlementByTenure(Math.max(0, yearsServedAtAnniversary - 1 + 0.01));
        
        // Period 2 (週年日後): 滿 Years 年的權益
        const entitlement2 = getLeaveEntitlementByTenure(yearsServedAtAnniversary);
    
        // 依您的公式加總
        let total = (entitlement1 * prop1) + (entitlement2 * prop2);
        
        return Math.round(total * 100) / 100; // 取小數點後兩位
    }

    function renderLeaveTab() {
        const onboardDate = settings.onboardDate;
        if (!onboardDate) {
            document.getElementById('leave-setup-hint').style.display = 'block';
            document.getElementById('leave-dashboard').style.display = 'none';
            return;
        }
        
        document.getElementById('leave-setup-hint').style.display = 'none';
        document.getElementById('leave-dashboard').style.display = 'block';
        
        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;
        
        // 1. 計算應給天數
        const leaveThisYear = calculateCalendarYearLeave(onboardDate, currentYear);
        const leaveLastYear = calculateCalendarYearLeave(onboardDate, lastYear);
        
        // 2. 計算已使用天數 (從 records 中篩選)
        // 篩選今年的特休紀錄
        const usedThisYear = records
            .filter(r => r.type === 'special_leave' && new Date(r.start).getFullYear() === currentYear)
            .reduce((sum, r) => {
                const hours = parseFloat(r.reason.match(/(\d+(\.\d+)?)h/)?.[1] || 8); // 從備註解析時數，預設8
                return sum + (hours / 8); // 換算成天
            }, 0);

        // 篩選去年的特休紀錄 (用於計算遞延剩餘)
        const usedLastYear = records
            .filter(r => r.type === 'special_leave' && new Date(r.start).getFullYear() === lastYear)
            .reduce((sum, r) => sum + (parseFloat(r.reason.match(/(\d+(\.\d+)?)h/)?.[1] || 8) / 8), 0);
            
        // 3. 計算餘額
        // 去年剩餘 = 去年應給 - 去年已休 (若 < 0 則為 0)
        let remainLastYear = Math.max(0, leaveLastYear - usedLastYear);
        // 四捨五入到小數點2位
        remainLastYear = Math.round(remainLastYear * 100) / 100;
        
        // 今年總餘額 = 今年應給 + 去年遞延 - 今年已休
        const balance = (leaveThisYear + remainLastYear) - usedThisYear;
        
        // 4. 更新 UI
        document.getElementById('leave-current-year').textContent = currentYear;
        document.getElementById('leave-current-total').textContent = leaveThisYear.toFixed(2);
        document.getElementById('leave-last-remain').textContent = remainLastYear.toFixed(2);
        document.getElementById('leave-balance').textContent = balance.toFixed(2);
        
        if (balance < 0) {
            document.getElementById('leave-balance').style.color = 'var(--danger-color)';
        } else {
            document.getElementById('leave-balance').style.color = 'var(--success-color)';
        }

        // 5. 渲染列表
        const tbody = document.getElementById('leave-history-body');
        tbody.innerHTML = '';
        const leaveRecords = records.filter(r => r.type === 'special_leave' && new Date(r.start).getFullYear() === currentYear);
        
        // 排序
        leaveRecords.sort((a, b) => new Date(b.start) - new Date(a.start));
        
        if (leaveRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">今年尚無特休紀錄</td></tr>';
        } else {
            leaveRecords.forEach(rec => {
                const row = tbody.insertRow();
                const dateStr = new Date(rec.start).toLocaleDateString();
                const hours = rec.reason.match(/(\d+(\.\d+)?)h/)?.[1] || '8';
                // 移除備註中的時數標記，只顯示純文字
                const cleanReason = rec.reason.replace(/\(\d+(\.\d+)?h\)/, '').trim();
                
                row.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${hours}h</td>
                    <td>${escapeHtml(cleanReason)}</td>
                    <td><button class="btn-small btn-danger" onclick="app.deleteRecord('${rec.id}')">刪除</button></td>
                `;
            });
        }
    }

    function addLeaveRecord() {
        const dateVal = document.getElementById('leave-date').value;
        const hoursVal = document.getElementById('leave-hours').value;
        const reasonVal = document.getElementById('leave-reason').value;
        
        if (!dateVal) {
            alert('請選擇日期');
            return;
        }
        if (!hoursVal || parseFloat(hoursVal) <= 0) {
            alert('請輸入有效時數');
            return;
        }
        
        // 構造一個 record 物件
        // 特休的格式： start = 日期T00:00, end = 日期T00:00 (不重要，主要是日期)
        // type = 'special_leave'
        // reason = '事由 (8h)' -> 把時數存在 reason 方便解析，或利用 reason 欄位
        
        const fullReason = `${reasonVal} (${hoursVal}h)`;
        const newRecord = {
            id: `leave_${Date.now()}`,
            start: `${dateVal}T09:00`, // 預設 9:00
            end: `${dateVal}T18:00`,
            type: 'special_leave',
            reason: fullReason,
            forceFullCalculation: false
        };
        
        records.push(newRecord);
        saveRecords();
        renderLeaveTab(); // 重新計算並顯示
        render(); // 更新主畫面 (雖然切換 Tab 才會看到)
        
        // 清空表單
        document.getElementById('leave-reason').value = '';
        showToast('特休紀錄已新增');
    }

    // --- 核心邏輯函式 (原有) ---
    function loadSettings() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
            settings = {
                userName: '',
                salaryType: 'monthly',
                salary: 0,
                onboardDate: '', // 新增
                workStart: "09:00",
                workEnd: "18:00",
                breakStart: "12:00",
                breakEnd: "13:00",
                payday: 1,
                ...savedSettings
            };

            if (!isValidNumber(settings.salary)) {
                settings.salary = 0;
            }

            document.getElementById('user-name').value = settings.userName || '';
            salaryInput.value = settings.salary || '';
            document.querySelector(`input[name="salaryType"][value="${settings.salaryType}"]`).checked = true;
            document.getElementById('payday').value = settings.payday || 1;
            document.getElementById('work-start').value = settings.workStart;
            document.getElementById('work-end').value = settings.workEnd;
            document.getElementById('break-start').value = settings.breakStart;
            document.getElementById('break-end').value = settings.breakEnd;
            
            // 載入到職日
            if (settings.onboardDate) {
                onboardDateInput.value = settings.onboardDate;
            }
            
            calculateHourlyRate();
        } catch (error) {
            console.error('載入設定時發生錯誤:', error);
            showError('載入設定時發生錯誤,已使用預設值。');
        }
    }

    function saveSettings() {
        try {
            const salary = parseFloat(salaryInput.value) || 0;
            if (salary < 0) {
                showError('錯誤:薪資不能為負數。');
                return;
            }
            if (salary > 0 && salary < 1000) {
                if (!confirm('您輸入的薪資似乎偏低,確定要儲存嗎?')) return;
            }

            settings = {
                userName: escapeHtml(document.getElementById('user-name').value.trim()),
                salaryType: document.querySelector('input[name="salaryType"]:checked').value,
                salary: salary,
                onboardDate: onboardDateInput.value, // 儲存到職日
                payday: parseInt(document.getElementById('payday').value) || 1,
                workStart: document.getElementById('work-start').value,
                workEnd: document.getElementById('work-end').value,
                breakStart: document.getElementById('break-start').value,
                breakEnd: document.getElementById('break-end').value,
            };
            
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
            updateLastModified();
            calculateHourlyRate();
            updatePayPeriodHint();
            
            alert('設定已儲存! 您現在可以開始記錄加班了。');
            
            // 如果有設定到職日，嘗試重新渲染特休頁
            if (settings.onboardDate) {
                renderLeaveTab();
            }
            
            switchTab('punch');
            render();
            
        } catch (error) {
            console.error('儲存設定時發生錯誤:', error);
            showError('儲存設定時發生錯誤,請重試。');
        }
    }

    function calculateHourlyRate() {
        if (settings.salaryType === 'monthly') {
            if (!isValidNumber(settings.salary) || settings.salary <= 0) {
                settings.hourlyRate = 0;
            } else {
                settings.hourlyRate = Math.round((settings.salary / LABOR_STANDARDS.MONTHLY_WORK_HOURS) * 100) / 100;
            }
        } else {
            settings.hourlyRate = parseFloat(settings.salary) || 0;
        }
        hourlyRateInput.value = settings.hourlyRate || 0;
    }

    function loadRecords() {
        try {
            const savedRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS)) || [];
            records = savedRecords.filter(rec => {
                return rec.id && isValidDate(rec.start) && isValidDate(rec.end) && rec.type;
            });
            records.sort((a, b) => new Date(b.start) - new Date(a.start));
        } catch (error) {
            console.error('載入記錄時發生錯誤:', error);
            records = [];
            showError('載入記錄時發生錯誤,已重置為空。');
        }
    }

    const saveRecords = throttle(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
            updateLastModified();
        } catch (error) {
            console.error('儲存記錄時發生錯誤:', error);
            showError('儲存記錄時發生錯誤,可能是儲存空間不足。');
        }
    }, 500);

    function addRecord() {
        hideError();
        
        const startTime = document.getElementById('start-time').value;
        const endTime = document.getElementById('end-time').value;
        const type = document.querySelector('input[name="overtimeType"]:checked').value;
        const reason = document.getElementById('overtime-reason').value;
        const editId = editIdInput.value;

        if (!startTime || !endTime) {
            showError('錯誤:請填寫開始與結束時間。');
            return;
        }
        
        if (!isValidDate(startTime) || !isValidDate(endTime)) {
            showError('錯誤:日期格式不正確。');
            return;
        }
        
        if (new Date(endTime) <= new Date(startTime)) {
            showError('錯誤:結束時間必須晚於開始時間。');
            return;
        }
        
        if (!settings.hourlyRate || settings.hourlyRate <= 0) {
            showError('錯誤:請先完成有效薪資設定。');
            return;
        }
        
        const newRecord = {
            id: editId || `rec_${Date.now()}`,
            start: startTime,
            end: endTime,
            type,
            reason: escapeHtml(reason),
            forceFullCalculation: forceFullCalcToggle.checked
        };
        
        const netHours = calculateNetOvertimeHours(newRecord);
        if (netHours <= 0) {
            if (!confirm("此筆紀錄計算出的加班時數為0,確定要新增嗎?")) return;
        }

        if (isOverlapping(newRecord)) return;
        
        if (editId) {
            const index = records.findIndex(rec => rec.id === editId);
            if (index > -1) records[index] = newRecord;
        } else {
            records.push(newRecord);
        }
        
        saveRecords();
        localStorage.removeItem(STORAGE_KEYS.TEMP_RECORD);
        loadRecords();
        render();
        clearForm();
        
        if (confirm('紀錄已儲存！是否前往「紀錄」分頁查看？')) {
            switchTab('records');
        }
    }

    function deleteRecord(id) {
        if (confirm('確定要刪除這筆紀錄嗎?')) {
            records = records.filter(record => record.id !== id);
            saveRecords();
            render();
            // 如果是在特休分頁刪除，也要更新特休分頁
            if (document.getElementById('tab-leave').classList.contains('active')) {
                renderLeaveTab();
            }
        }
    }

    function editRecord(id) {
        const record = records.find(rec => rec.id === id);
        if (record) {
            // 如果是特休紀錄，不支援在加班分頁編輯 (簡單起見，建議刪除重建立)
            if (record.type === 'special_leave') {
                alert('特休紀錄請至「特休」分頁管理 (目前僅支援刪除後重新新增)');
                switchTab('leave');
                return;
            }

            switchTab('punch');
            switchMode('manual', false);
            document.getElementById('start-time').value = record.start;
            document.getElementById('end-time').value = record.end;
            document.getElementById('overtime-reason').value = record.reason || '';
            document.querySelector(`input[name="overtimeType"][value="${record.type}"]`).checked = true;
            editIdInput.value = record.id;
            forceFullCalcToggle.checked = !!record.forceFullCalculation;
            addRecordBtn.textContent = '更新紀錄';
            window.scrollTo(0, 0);
        }
    }

    function clearForm() {
        ['start-time', 'end-time', 'overtime-reason', 'edit-id'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.querySelector('input[name="overtimeType"][value="weekday"]').checked = true;
        forceFullCalcToggle.checked = false;
        addRecordBtn.textContent = '新增紀錄';
        hideError();
        
        if (!punchTimerInterval) {
             localStorage.removeItem(STORAGE_KEYS.TEMP_RECORD);
             updatePunchUI(false);
        }
        
        const restoreMsgEl = document.getElementById('restore-message');
        restoreMsgEl.style.display = 'none';
        restoreMsgEl.textContent = '';
    }

    function isOverlapping(newRecord) {
        const newStart = new Date(newRecord.start).getTime();
        const newEnd = new Date(newRecord.end).getTime();
        
        const conflicts = records.filter(rec => {
            if (rec.id === newRecord.id) return false;
            // 忽略特休紀錄的重疊檢查 (因為特休可能只請半天，但系統紀錄是全天區間，需更細緻處理)
            // 這裡簡單處理：如果是加班紀錄，才檢查重疊
            if (rec.type === 'special_leave') return false; 
            
            const recStart = new Date(rec.start).getTime();
            const recEnd = new Date(rec.end).getTime();
            return newStart < recEnd && newEnd > recStart;
        });
        
        if (conflicts.length > 0) {
            const conflictInfo = conflicts.map(rec => {
                const start = new Date(rec.start);
                const end = new Date(rec.end);
                return `• ${start.toLocaleDateString()} ${formatTime(start)} - ${formatTime(end)}`;
            }).join('\n');
            showError(`錯誤:時間段與以下記錄重疊:\n${conflictInfo}`);
            return true;
        }
        return false;
    }
    
    // --- 打卡模式 ---
    function startTimer(startTime) {
        if (punchTimerInterval) clearInterval(punchTimerInterval);
        const startTimeDisplay = document.getElementById('punch-start-time-display');
        const elapsedTimeDisplay = document.getElementById('punch-elapsed-time-display');
        const statusContainer = document.getElementById('punch-status');
        startTimeDisplay.textContent = startTime.toLocaleString('zh-TW', { hour12: false });
        statusContainer.style.display = 'block';
        punchTimerInterval = setInterval(() => {
            const now = new Date();
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            const hours = Math.floor(elapsedSeconds / 3600).toString().padStart(2, '0');
            const minutes = Math.floor((elapsedSeconds % 3600) / 60).toString().padStart(2, '0');
            const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
            elapsedTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
        }, 1000);
    }
    function stopTimer() {
        if (punchTimerInterval) clearInterval(punchTimerInterval);
        punchTimerInterval = null;
        document.getElementById('punch-status').style.display = 'none';
    }
    function switchMode(mode, fromUserInteraction) {
        document.getElementById('punch-mode-content').style.display = mode === 'punch' ? 'block' : 'none';
        document.getElementById('manual-mode-content').style.display = mode === 'manual' ? 'block' : 'none';
        const punchBtn = document.getElementById('mode-punch');
        const manualBtn = document.getElementById('mode-manual');
        punchBtn.classList.toggle('active', mode === 'punch');
        manualBtn.classList.toggle('active', mode === 'manual');
        punchBtn.setAttribute('aria-pressed', mode === 'punch');
        manualBtn.setAttribute('aria-pressed', mode === 'manual');
        if (fromUserInteraction) clearForm();
    }
    function startPunch() {
        const tempRecord = {
            start: new Date().toISOString(),
            end: null,
            reason: document.getElementById('overtime-reason').value,
            type: document.querySelector('input[name="overtimeType"]:checked').value,
            forceFullCalculation: forceFullCalcToggle.checked
        };
        localStorage.setItem(STORAGE_KEYS.TEMP_RECORD, JSON.stringify(tempRecord));
        updatePunchUI(true);
        startTimer(new Date(tempRecord.start));
    }
    
    function endPunch() {
        const tempRecordJSON = localStorage.getItem(STORAGE_KEYS.TEMP_RECORD);
        if (!tempRecordJSON) return;
        
        const tempRecord = JSON.parse(tempRecordJSON);
        if (tempRecord.start && !tempRecord.end) {
            stopTimer();
            
            const endTime = new Date();
            tempRecord.end = endTime.toISOString();
            tempRecord.reason = document.getElementById('overtime-reason').value || tempRecord.reason;
            tempRecord.type = document.querySelector('input[name="overtimeType"]:checked').value || tempRecord.type;
            
            localStorage.setItem(STORAGE_KEYS.TEMP_RECORD, JSON.stringify(tempRecord));
            
            updatePunchUI(false);
            restoreState(); 
            
            const restoreMsgEl = document.getElementById('restore-message');
            restoreMsgEl.textContent = '打卡已結束，時間已填入下方表單。請確認無誤後按下「新增紀錄」儲存。';
            restoreMsgEl.style.display = 'block';
            restoreMsgEl.style.backgroundColor = '#d4edda';
            restoreMsgEl.style.borderColor = '#c3e6cb';
            restoreMsgEl.style.color = '#155724';
        }
    }

    function updatePunchUI(isPunchedIn) {
        punchStartBtn.disabled = isPunchedIn;
        punchEndBtn.disabled = !isPunchedIn;
        punchStartBtn.setAttribute('aria-pressed', isPunchedIn);
        punchEndBtn.setAttribute('aria-pressed', !isPunchedIn);
        document.getElementById('mode-manual').disabled = isPunchedIn;
        document.getElementById('mode-punch').disabled = isPunchedIn;
    }

    // 計算相關函式 (保持不變)
    function calculateNetOvertimeHours(record) {
        let recordStart = new Date(record.start).getTime();
        let recordEnd = new Date(record.end).getTime();
        let totalMillis = recordEnd - recordStart;
        if (record.type === 'weekday' && !record.forceFullCalculation) {
            const d = new Date(record.start);
            const [workStartH, workStartM] = settings.workStart.split(':').map(Number);
            const [workEndH, workEndM] = settings.workEnd.split(':').map(Number);
            const [breakStartH, breakStartM] = settings.breakStart.split(':').map(Number);
            const [breakEndH, breakEndM] = settings.breakEnd.split(':').map(Number);
            const workStart = new Date(d).setHours(workStartH, workStartM, 0, 0);
            const workEnd = new Date(d).setHours(workEndH, workEndM, 0, 0);
            const breakStart = new Date(d).setHours(breakStartH, breakStartM, 0, 0);
            const breakEnd = new Date(d).setHours(breakEndH, breakEndM, 0, 0);
            let workOverlap = Math.max(0, Math.min(recordEnd, workEnd) - Math.max(recordStart, workStart));
            let breakOverlap = Math.max(0, Math.min(recordEnd, breakEnd) - Math.max(recordStart, breakStart));
            totalMillis -= (workOverlap - breakOverlap);
        }
        return Math.max(0, totalMillis / 3600000);
    }
    function getDailyPayAndFormula(totalHours, type) {
        let pay = 0;
        let formula = "";
        const rate = settings.hourlyRate;
        const h = (val) => val.toFixed(2);
        const f_rate = (val) => val.toFixed(2);
        const { WEEKDAY_RATE_1, WEEKDAY_RATE_2, RESTDAY_RATE_1, RESTDAY_RATE_2, RESTDAY_RATE_3, RESTDAY_TIER_1, RESTDAY_TIER_2, HOLIDAY_RATE } = LABOR_STANDARDS;
        switch (type) {
            case 'weekday':
                if (totalHours <= RESTDAY_TIER_1) {
                    pay = totalHours * rate * WEEKDAY_RATE_1;
                    formula = `(${h(totalHours)}H × ${f_rate(rate)} × ${WEEKDAY_RATE_1})`;
                } else {
                    pay = (RESTDAY_TIER_1 * rate * WEEKDAY_RATE_1) + ((totalHours - RESTDAY_TIER_1) * rate * WEEKDAY_RATE_2);
                    formula = `(${RESTDAY_TIER_1}H × ${f_rate(rate)} × ${WEEKDAY_RATE_1}) + (${h(totalHours - RESTDAY_TIER_1)}H × ${f_rate(rate)} × ${WEEKDAY_RATE_2})`;
                }
                break;
            case 'restday':
                if (totalHours <= RESTDAY_TIER_1) {
                    pay = totalHours * rate * RESTDAY_RATE_1;
                    formula = `(${h(totalHours)}H × ${f_rate(rate)} × ${RESTDAY_RATE_1})`;
                } else if (totalHours <= RESTDAY_TIER_2) {
                    pay = (RESTDAY_TIER_1 * rate * RESTDAY_RATE_1) + ((totalHours - RESTDAY_TIER_1) * rate * RESTDAY_RATE_2);
                    formula = `(${RESTDAY_TIER_1}H × ${f_rate(rate)} × ${RESTDAY_RATE_1}) + (${h(totalHours - RESTDAY_TIER_1)}H × ${f_rate(rate)} × ${RESTDAY_RATE_2})`;
                } else {
                    pay = (RESTDAY_TIER_1 * rate * RESTDAY_RATE_1) + ((RESTDAY_TIER_2 - RESTDAY_TIER_1) * rate * RESTDAY_RATE_2) + ((totalHours - RESTDAY_TIER_2) * rate * RESTDAY_RATE_3);
                    formula = `(${RESTDAY_TIER_1}H × ${f_rate(rate)} × ${RESTDAY_RATE_1}) + (${RESTDAY_TIER_2 - RESTDAY_TIER_1}H × ${f_rate(rate)} × ${RESTDAY_RATE_2}) + (${h(totalHours - RESTDAY_TIER_2)}H × ${f_rate(rate)} × ${RESTDAY_RATE_3})`;
                }
                break;
            case 'holiday':
                pay = totalHours * rate * HOLIDAY_RATE;
                formula = `(${h(totalHours)}H × ${f_rate(rate)} × ${HOLIDAY_RATE})`;
                break;
        }
        return { pay: Math.ceil(pay), formula: `${formula} = ${Math.ceil(pay)} 元` };
    }
    const getPayPeriod = (monthValue) => {
        const payday = settings.payday || 1;
        const [year, month] = monthValue.split('-').map(Number);
        let periodStart, periodEnd;
        if (payday === 1) {
            periodStart = new Date(year, month - 1, 1, 0, 0, 0);
            periodEnd = new Date(year, month, 0, 23, 59, 59);
        } else {
            periodStart = new Date(year, month - 2, payday, 0, 0, 0);
            periodEnd = new Date(year, month - 1, payday - 1, 23, 59, 59);
        }
        const formatDate = (date) => `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
        return { start: periodStart, end: periodEnd, displayText: `${formatDate(periodStart)} ~ ${formatDate(periodEnd)}` };
    };

    // --- 預設月份邏輯 ---
    function getDefaultMonthValue() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-11
        const currentDay = today.getDate();
        const payday = settings.payday || 1;

        if (payday === 1) {
            return today.toISOString().substring(0, 7);
        }

        if (currentDay >= payday) {
            const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
            return nextMonthDate.toISOString().substring(0, 7);
        } else {
            return today.toISOString().substring(0, 7);
        }
    }

    // --- 檢查同步狀態 ---
    function checkSyncStatus() {
        const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC) || 0;
        const lastMod = localStorage.getItem(STORAGE_KEYS.LAST_MODIFIED) || 0;
        
        if (parseInt(lastMod) > parseInt(lastSync) && gasAppUrl) {
            unsyncedAlert.style.display = 'flex';
        } else {
            unsyncedAlert.style.display = 'none';
        }
    }

    // 渲染相關函式
    function render() {
        const filteredRecords = filterRecords(monthFilter.value);
        // 過濾掉特休紀錄，以免混在加班列表中
        const overtimeRecords = filteredRecords.filter(r => r.type !== 'special_leave');
        const dailyGroups = groupRecordsByDay(overtimeRecords);
        renderTable(recordsBody, dailyGroups);
        renderSummary(dailyGroups, monthFilter.value);
        updatePayPeriodHint();
        checkSyncStatus();
        
        // 如果當前是特休分頁，也更新特休UI
        if (document.getElementById('tab-leave').classList.contains('active')) {
            renderLeaveTab();
        }
    }
    
    function filterRecords(filterValue) {
        if (!filterValue) return records;
        const period = getPayPeriod(filterValue);
        return records.filter(rec => {
            const recDate = new Date(rec.start);
            return recDate >= period.start && recDate <= period.end;
        });
    }
    function groupRecordsByDay(records) {
        const groups = {};
        records.forEach(rec => {
            const dateKey = new Date(rec.start).toLocaleDateString();
            if (!groups[dateKey]) {
                groups[dateKey] = { date: new Date(rec.start), type: rec.type, records: [] };
            }
            groups[dateKey].records.push(rec);
        });
        return Object.values(groups).map(group => {
            const totalHours = group.records.reduce((sum, rec) => sum + calculateNetOvertimeHours(rec), 0);
            const { pay, formula } = getDailyPayAndFormula(totalHours, group.type);
            return { ...group, totalHours, pay, formula };
        }).sort((a, b) => b.date - a.date);
    }
    function renderTable(tbody, dailyGroups) {
        tbody.innerHTML = '';
        if (dailyGroups.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">該期間尚無紀錄</td></tr>`;
            return;
        }
        dailyGroups.forEach(group => {
            const dateStr = group.date.toLocaleDateString();
            const typeText = { weekday: '平日', restday: '休息日', holiday: '國定假日' }[group.type];
            const headerRow = tbody.insertRow();
            headerRow.className = 'daily-group-header';
            headerRow.innerHTML = `<td data-label="日期">${escapeHtml(dateStr)}</td><td data-label="類型">${escapeHtml(typeText)}</td><td data-label="總時長(H)">${group.totalHours.toFixed(2)}</td><td data-label="加班費($)">${group.pay}</td><td data-label="操作"><div class="actions-container"><button class="btn-small btn-secondary" onclick="app.toggleDetails(this)">展開</button></div></td>`;
            group.records.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach(rec => {
                const detailRow = tbody.insertRow();
                detailRow.className = 'record-detail-row';
                detailRow.style.display = 'none';
                detailRow.setAttribute('data-group-date', dateStr);
                const startTime = formatTime(new Date(rec.start));
                const endTime = formatTime(new Date(rec.end));
                let reasonText = `${escapeHtml(rec.reason) || '-'}`;
                if (rec.forceFullCalculation) reasonText += ' <strong style="color:var(--danger-color);">(強制計算)</strong>';
                detailRow.innerHTML = `<td data-label="時間" colspan="3">${startTime} - ${endTime} (${reasonText})</td><td data-label="時長">${calculateNetOvertimeHours(rec).toFixed(2)} H</td><td data-label="操作"><div class="actions-container"><button class="btn-small" onclick="app.editRecord('${rec.id}')">編輯</button> <button class="btn-small btn-danger" onclick="app.deleteRecord('${rec.id}')">刪除</button></div></td>`;
            });
            const formulaRow = tbody.insertRow();
            formulaRow.className = 'formula-detail-row';
            formulaRow.style.display = 'none';
            formulaRow.setAttribute('data-group-date', dateStr);
            formulaRow.innerHTML = `<td colspan="5"><strong>計算式:</strong> ${group.formula}</td>`;
        });
    }
    function renderSummary(dailyGroups, filterValue) {
        const totalPay = dailyGroups.reduce((sum, group) => sum + group.pay, 0);
        totalOvertimePayEl.textContent = totalPay;
        if (filterValue) {
            const [year, month] = filterValue.split('-');
            const period = getPayPeriod(filterValue);
            summaryTitleEl.textContent = `${year}年${month}月發薪 - 加班費總計`;
            summaryPeriodEl.textContent = `計薪週期: ${period.displayText} | 共 ${dailyGroups.length} 個加班日`;
        } else {
            summaryTitleEl.textContent = '所有記錄總計';
            summaryPeriodEl.textContent = `共 ${dailyGroups.length} 個加班日`;
        }
    }
    function updatePayPeriodHint() {
        const monthValue = monthFilter.value;
        if (!monthValue) return;
        const period = getPayPeriod(monthValue);
        const hintEl = document.getElementById('pay-period-hint');
        hintEl.textContent = `📅 計薪週期: ${period.displayText}`;
    };
    function toggleDetails(button) {
        const date = button.closest('tr').querySelector('[data-label="日期"]').textContent;
        const isExpanding = button.textContent === '展開';
        button.textContent = isExpanding ? '收合' : '展開';
        document.querySelectorAll(`tr[data-group-date="${date}"]`).forEach(row => {
            row.style.display = isExpanding ? '' : 'none';
        });
    }
    function generateExportHTML(dailyGroups, title) {
        const userName = settings.userName ? `<p><strong>姓名:</strong> ${escapeHtml(settings.userName)}</p>` : '';
        let tableHTML = `<h2>${escapeHtml(title)}</h2>${userName}<table><thead><tr><th>日期</th><th>類型</th><th>總時長(H)</th><th>加班費($)</th><th>詳細資料</th></tr></thead><tbody>`;
        if (dailyGroups.length === 0) {
            tableHTML += `<tr><td colspan="5" style="text-align:center;">該期間尚無紀錄</td></tr>`;
        } else {
            dailyGroups.forEach(group => {
                const typeText = { weekday: '平日', restday: '休息日', holiday: '國定假日' }[group.type];
                const recordDetails = group.records.sort((a, b) => new Date(a.start) - new Date(b.start)).map(rec => {
                    const startTime = formatTime(new Date(rec.start));
                    const endTime = formatTime(new Date(rec.end));
                    let reasonText = `${escapeHtml(rec.reason) || '-'}`;
                    if (rec.forceFullCalculation) reasonText += ' <strong style="color:var(--danger-color);">(強制計算)</strong>';
                    return `${startTime} - ${endTime}: ${calculateNetOvertimeHours(rec).toFixed(2)}H (${reasonText})`;
                }).join('<br>');
                tableHTML += `<tr><td>${escapeHtml(group.date.toLocaleDateString())}</td><td>${escapeHtml(typeText)}</td><td>${group.totalHours.toFixed(2)}</td><td>${group.pay}</td><td style="font-size: 0.9em;">${recordDetails}<br><hr style="border-top: 1px dotted #ccc; margin: 4px 0;"><strong>計算式:</strong> ${group.formula}</td></tr>`;
            });
        }
        tableHTML += `</tbody></table>`;
        return tableHTML;
    }
    async function exportResultsAsImage() {
        const monthValue = monthFilter.value || new Date().toISOString().substring(0, 7);
        const [year, month] = monthValue.split('-');
        const period = getPayPeriod(monthValue);
        const dailyGroups = groupRecordsByDay(filterRecords(monthValue));
        const totalPay = dailyGroups.reduce((sum, group) => sum + group.pay, 0);
        const exportContainer = document.createElement('div');
        exportContainer.id = 'export-container';
        const title = `${year}年 ${month}月發薪 加班記錄 (${period.displayText})`;
        const tableHTML = generateExportHTML(dailyGroups, title);
        const summaryHTML = `<div class="summary"><h3>總金額: <span class="summary-value">${totalPay}</span> 元</h3></div>`;
        exportContainer.innerHTML = tableHTML + summaryHTML;
        document.body.appendChild(exportContainer);
        try {
            const canvas = await html2canvas(exportContainer, { scale: 2, useCORS: true, windowWidth: 1000 });
            const link = document.createElement('a');
            const fileName = settings.userName ? `加班記錄-${settings.userName}-${year}-${month}.png` : `加班記錄-${year}-${month}.png`;
            link.download = fileName;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch (error) {
            console.error('匯出圖片失敗:', error);
            alert('匯出圖片時發生錯誤。');
        } finally {
            document.body.removeChild(exportContainer);
        }
    }
    function exportCSV() {
        const monthValue = monthFilter.value || new Date().toISOString().substring(0, 7);
        const [year, month] = monthValue.split('-');
        const period = getPayPeriod(monthValue);
        const dailyGroups = groupRecordsByDay(filterRecords(monthValue));
        let csv = '\uFEFF';
        csv += `${year}年${month}月發薪加班記錄,計薪週期: ${period.displayText}\n`;
        if (settings.userName) csv += `姓名:,${settings.userName}\n`;
        csv += '\n';
        csv += '日期,類型,開始時間,結束時間,加班事由,時長(小時),加班費(元)\n';
        dailyGroups.forEach(group => {
            const typeText = { weekday: '平日', restday: '休息日', holiday: '國定假日' }[group.type];
            group.records.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach(rec => {
                const date = new Date(rec.start).toLocaleDateString();
                const startTime = formatTime(new Date(rec.start));
                const endTime = formatTime(new Date(rec.end));
                const reason = (rec.reason || '-').replace(/,/g, '，');
                const hours = calculateNetOvertimeHours(rec).toFixed(2);
                csv += `${date},${typeText},${startTime},${endTime},${reason},${hours},\n`;
            });
        });
        const totalPay = dailyGroups.reduce((sum, group) => sum + group.pay, 0);
        csv += `\n總計,,,,,,${totalPay}\n`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const fileName = settings.userName ? `加班記錄-${settings.userName}-${year}-${month}.csv` : `加班記錄-${year}-${month}.csv`;
        link.download = fileName;
        link.click();
    }

    // --- Google Apps Script 同步邏輯 ---
    function loadGasUrl() {
        gasAppUrl = localStorage.getItem(STORAGE_KEYS.GAS_APP_URL) || '';
        gasUrlInput.value = gasAppUrl;
        updateGasUiState();
        checkSyncStatus();
    }

    function saveGasUrl() {
        const url = gasUrlInput.value.trim();
        if (!url) {
            alert('請輸入有效的 Google Apps Script URL');
            return;
        }
        if (!url.includes('script.google.com')) {
            alert('這看起來不像是正確的 Google Apps Script 網址');
            return;
        }
        gasAppUrl = url;
        localStorage.setItem(STORAGE_KEYS.GAS_APP_URL, gasAppUrl);
        updateGasUiState();
        checkSyncStatus();
        alert('網址已儲存！您可以開始同步資料了。');
    }

    function resetGasUrl() {
        if(confirm('確定要移除連結嗎？')) {
            gasAppUrl = '';
            localStorage.removeItem(STORAGE_KEYS.GAS_APP_URL);
            gasUrlInput.value = '';
            updateGasUiState();
            checkSyncStatus();
        }
    }

    function updateGasUiState() {
        if (gasAppUrl) {
            gasConfigContainer.style.display = 'none';
            gasSyncActions.style.display = 'block';
        } else {
            gasConfigContainer.style.display = 'block';
            gasSyncActions.style.display = 'none';
        }
    }

    function updateSyncStatus(msg, type = 'info') {
        syncStatusEl.style.display = 'block';
        syncStatusEl.textContent = msg;
        syncStatusEl.className = 'sync-status-msg ' + type;
        if(type === 'success') syncStatusEl.style.color = 'var(--success-color)';
        else if (type === 'error') syncStatusEl.style.color = 'var(--danger-color)';
        else syncStatusEl.style.color = 'var(--text-color)';
        
        showToast(msg, type);
    }

    // 上傳資料 (Overwrite)
    async function syncToCloud() {
        if (!gasAppUrl) {
            switchTab('backup');
            return;
        }
        try {
            updateSyncStatus('正在上傳資料至 Google Sheets...', 'info');
            const payload = { action: 'save', data: { settings: settings, records: records } };
            const response = await fetch(gasAppUrl, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            if (result.status === 'success') {
                const now = Date.now().toString();
                localStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);
                document.getElementById('backup-reminder').style.display = 'none';
                updateSyncStatus(`✅ 上傳成功！(時間: ${new Date().toLocaleTimeString()})`, 'success');
                checkSyncStatus();
            } else {
                throw new Error(result.message || 'Unknown error from server');
            }
        } catch (e) {
            console.error('Sync failed:', e);
            updateSyncStatus('❌ 上傳失敗: ' + (e.message || '請檢查網址是否正確'), 'error');
        }
    }

    // 下載資料 (Merge)
    async function syncFromCloud() {
        if (!gasAppUrl) return;
        if (!confirm('確定要從雲端下載資料嗎？\n這將會與您現有的本地資料合併。')) return;
        try {
            updateSyncStatus('正在讀取雲端資料...', 'info');
            const response = await fetch(`${gasAppUrl}?action=load`);
            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'Server error');
            const cloudData = result.data;
            if (!cloudData || !cloudData.records) throw new Error('雲端沒有有效資料');
            
            const newSettings = { ...settings, ...cloudData.settings };
            let addedCount = 0;
            let updatedCount = 0;
            cloudData.records.forEach(remoteRec => {
                if (!remoteRec.id) return;
                const localIdx = records.findIndex(localRec => localRec.id === remoteRec.id);
                if (localIdx > -1) {
                    records[localIdx] = remoteRec;
                    updatedCount++;
                } else {
                    records.push(remoteRec);
                    addedCount++;
                }
            });

            settings = newSettings;
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
            saveRecords();
            
            localStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());

            loadSettings();
            loadRecords();
            render();
            checkSyncStatus();
            
            updateSyncStatus(`✅ 下載完成！(新增: ${addedCount}, 更新: ${updatedCount})`, 'success');
        } catch (e) {
            console.error('Download failed:', e);
            updateSyncStatus('❌ 下載失敗: ' + (e.message || '請檢查網址是否正確'), 'error');
        }
    }

    // --- Tab 切換功能 ---
    function switchTab(tabId) {
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        tabContents.forEach(content => {
            if (content.id === `tab-${tabId}`) {
                content.classList.add('active');
                content.style.display = 'block';
            } else {
                content.classList.remove('active');
                content.style.display = 'none';
            }
        });
        
        if (tabId === 'records') {
            render();
        } else if (tabId === 'leave') {
            renderLeaveTab();
        }
    }

    // --- UI/UX 相關函式 (續) ---
    function showWelcomeMessage() {
        const welcomeShown = localStorage.getItem(STORAGE_KEYS.WELCOME_SHOWN);
        const hasSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (!welcomeShown && !hasSettings) {
            const welcomeEl = document.getElementById('welcome-message');
            welcomeEl.style.display = 'block';
            setTimeout(() => {
                welcomeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }
    }

    function closeWelcomeMessage() {
        document.getElementById('welcome-message').style.display = 'none';
        localStorage.setItem(STORAGE_KEYS.WELCOME_SHOWN, 'true');
    }

    function checkBackupReminder() {
        const lastBackup = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
        const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
        const lastActionTime = Math.max(lastBackup ? parseInt(lastBackup) : 0, lastSync ? parseInt(lastSync) : 0);
        const now = Date.now();
        
        if (lastActionTime === 0) {
            localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, now.toString());
            return;
        }
        
        const daysSince = Math.floor((now - lastActionTime) / (1000 * 60 * 60 * 24));
        if (daysSince >= BACKUP_REMINDER_DAYS && records.length > 0) {
            showBackupReminder(daysSince);
        }
    }

    function showBackupReminder(days) {
        const reminderEl = document.getElementById('backup-reminder');
        const reminderText = document.getElementById('backup-reminder-text');
        reminderText.textContent = `您已經有 ${days} 天沒有備份或同步資料了！為避免資料遺失，建議立即操作。`;
        reminderEl.style.display = 'block';
        if (days >= 3) {
            const modal = document.getElementById('backup-modal');
            document.getElementById('backup-days-count').textContent = days;
            modal.classList.add('show');
        }
    }

    function performSyncOrBackup() {
        document.getElementById('backup-reminder').style.display = 'none';
        document.getElementById('backup-modal').classList.remove('show');
        switchTab('backup');
    }

    function remindLater() {
        const delayTime = Date.now() - ((BACKUP_REMINDER_DAYS - 0.5) * 24 * 60 * 60 * 1000);
        localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, delayTime.toString());
        document.getElementById('backup-reminder').style.display = 'none';
        document.getElementById('backup-modal').classList.remove('show');
    }

    function restoreState() {
        const tempRecordJSON = localStorage.getItem(STORAGE_KEYS.TEMP_RECORD);
        if (!tempRecordJSON) {
            updatePunchUI(false);
            return;
        }
        
        const tempRecord = JSON.parse(tempRecordJSON);
        const restoreMsgEl = document.getElementById('restore-message');

        const restoreFormFields = () => {
            document.getElementById('overtime-reason').value = tempRecord.reason || '';
            document.querySelector(`input[name="overtimeType"][value="${tempRecord.type}"]`).checked = true;
            forceFullCalcToggle.checked = !!tempRecord.forceFullCalculation;
        };

        if (tempRecord.start && !tempRecord.end) {
            switchTab('punch');
            switchMode('punch', false);
            updatePunchUI(true);
            restoreFormFields();
            startTimer(new Date(tempRecord.start));
            restoreMsgEl.textContent = '已為您還原上次的打卡上班狀態。';
            restoreMsgEl.style.display = 'block';
        } else if (tempRecord.start && tempRecord.end) {
            switchTab('punch');
            switchMode('manual', false);
            updatePunchUI(false);
            document.getElementById('start-time').value = formatDateTimeLocal(new Date(tempRecord.start));
            document.getElementById('end-time').value = formatDateTimeLocal(new Date(tempRecord.end));
            restoreFormFields();
            
            restoreMsgEl.textContent = '您有已打卡但未儲存的紀錄，已自動填入表單。請確認後按下新增。';
            restoreMsgEl.style.display = 'block';
        }
    }

    function handleUrlHash() {
        const hash = window.location.hash;
        if (hash === '#punch') switchTab('punch');
        else if (hash === '#records') switchTab('records');
        else if (hash === '#settings') switchTab('settings');
        else if (hash === '#leave') switchTab('leave');
        
        if (hash) {
            setTimeout(() => { history.replaceState(null, null, ' '); }, 1000);
        }
    }

    // importData (保持不變)
    function importData(jsonString) {
        if (!jsonString) {
            showError('請先提供要匯入的資料。');
            return;
        }
        if (!confirm('警告：匯入將會覆蓋所有現存資料，確定要繼續嗎？')) return;
        try {
            const data = JSON.parse(jsonString);
            if (!data.settings || !Array.isArray(data.records)) {
                showError('匯入失敗：資料格式不正確。');
                return;
            }
            if (!isValidNumber(data.settings.salary) || data.settings.salary < 0) {
                showError('匯入失敗：薪資設定無效。');
                return;
            }
            const validRecords = data.records.filter(rec => {
                return rec.id && isValidDate(rec.start) && isValidDate(rec.end) && rec.type;
            });
            
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
            localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(validRecords));
            localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, Date.now().toString());
            updateLastModified();
            
            loadSettings();
            loadRecords();
            render();

            alert(`資料匯入成功！共匯入 ${validRecords.length} 筆記錄。`);
            document.getElementById('import-textarea').value = '';
        } catch (error) {
            console.error('匯入錯誤:', error);
            showError('匯入失敗：無效的 JSON 格式。');
        }
    }

    // --- 事件監聽器設定 ---
    function setupEventListeners() {
        document.getElementById('save-settings').addEventListener('click', saveSettings);
        addRecordBtn.addEventListener('click', addRecord);
        document.getElementById('clear-form').addEventListener('click', clearForm);
        monthFilter.addEventListener('change', render);
        
        document.getElementById('mode-punch').addEventListener('click', () => switchMode('punch', true));
        document.getElementById('mode-manual').addEventListener('click', () => switchMode('manual', true));
        
        punchStartBtn.addEventListener('click', startPunch);
        punchEndBtn.addEventListener('click', endPunch);
        
        document.getElementById('export-image').addEventListener('click', exportResultsAsImage);
        document.getElementById('export-csv').addEventListener('click', exportCSV);
        
        document.getElementById('close-welcome').addEventListener('click', closeWelcomeMessage);
        
        // 特休按鈕事件
        document.getElementById('add-leave-record').addEventListener('click', addLeaveRecord);
        document.getElementById('leave-btn-4h').addEventListener('click', () => document.getElementById('leave-hours').value = 4);
        document.getElementById('leave-btn-8h').addEventListener('click', () => document.getElementById('leave-hours').value = 8);
        document.getElementById('leave-date').valueAsDate = new Date(); // 預設今天
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => { switchTab(btn.dataset.tab); });
        });

        // 快捷同步按鈕
        quickSyncBtn.addEventListener('click', () => {
            if (!gasAppUrl) {
                switchTab('backup');
            } else {
                syncToCloud();
            }
        });

        // 匯出/匯入/備份相關事件 (保持不變)
        document.getElementById('export-text').addEventListener('click', () => {
            const outputArea = document.getElementById('export-output');
            const textarea = document.getElementById('export-textarea');
            textarea.value = JSON.stringify({ settings, records }, null, 2);
            outputArea.style.display = 'block';
            localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, Date.now().toString());
        });
        document.getElementById('copy-json').addEventListener('click', async () => {
            const textarea = document.getElementById('export-textarea');
            try {
                await navigator.clipboard.writeText(textarea.value);
                const successMsg = document.getElementById('copy-success');
                successMsg.style.display = 'block';
                setTimeout(() => { successMsg.style.display = 'none'; }, 2000);
            } catch (err) {
                textarea.select();
                document.execCommand('copy');
                alert('已複製到剪貼簿！');
            }
        });
        document.getElementById('download-json').addEventListener('click', () => {
            const textarea = document.getElementById('export-textarea');
            const blob = new Blob([textarea.value], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().slice(0, 10);
            const fileName = settings.userName ? `加班記錄備份-${settings.userName}-${timestamp}.json` : `加班記錄備份-${timestamp}.json`;
            link.download = fileName;
            link.click();
        });
        document.getElementById('import-text').addEventListener('click', () => {
            const importText = document.getElementById('import-textarea').value;
            importData(importText);
        });
        document.getElementById('import-file-btn').addEventListener('click', () => {
            document.getElementById('import-file-input').click();
        });
        document.getElementById('import-file-input').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.type !== 'application/json') {
                showError('錯誤：請選擇一個 .json 檔案。');
                event.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => { importData(e.target.result); };
            reader.onerror = () => { showError('讀取檔案時發生錯誤。'); };
            reader.readAsText(file);
            event.target.value = '';
        });
        
        document.getElementById('backup-reminder-action').addEventListener('click', performSyncOrBackup);
        document.getElementById('backup-remind-later').addEventListener('click', remindLater);
        document.getElementById('modal-backup-now').addEventListener('click', performSyncOrBackup);
        document.getElementById('modal-remind-later').addEventListener('click', remindLater);
        document.getElementById('backup-modal').addEventListener('click', (e) => {
            if (e.target.id === 'backup-modal') remindLater();
        });

        // GAS Sync Event Listeners
        saveGasUrlBtn.addEventListener('click', saveGasUrl);
        resetGasUrlBtn.addEventListener('click', resetGasUrl);
        syncUploadBtn.addEventListener('click', syncToCloud);
        syncDownloadBtn.addEventListener('click', syncFromCloud);
    }

    // --- 應用程式初始化 ---
    function init() {
        loadSettings();
        loadRecords();
        loadGasUrl();
        
        // 1. 設定預設月份 (使用新的邏輯)
        monthFilter.value = getDefaultMonthValue();
        
        render();
        setupEventListeners();
        restoreState();
        showWelcomeMessage();
        
        // 2. 決定初始 Tab
        if (settings && settings.salary > 0 && settings.hourlyRate > 0) {
            switchTab('punch');
        } else {
            switchTab('settings');
        }
        
        setTimeout(() => checkBackupReminder(), 2000);
        checkSyncStatus(); // 初始檢查同步狀態
        handleUrlHash();
    }

    // --- 全域 API ---
    window.app = {
        deleteRecord,
        editRecord,
        toggleDetails
    };

    // --- 啟動 ---
    init();

})();

// --- Service Worker 註冊 ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
            // console.log('ServiceWorker registration successful');
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
