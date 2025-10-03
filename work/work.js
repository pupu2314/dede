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
        
        if (fromUserInteraction) {
            clearForm();
        }
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
            tempRecord.end = new Date().toISOString();
            tempRecord.reason = document.getElementById('overtime-reason').value;
            tempRecord.type = document.querySelector('input[name="overtimeType"]:checked').value;
            tempRecord.forceFullCalculation = forceFullCalcToggle.checked;
            localStorage.setItem(STORAGE_KEYS.TEMP_RECORD, JSON.stringify(tempRecord));
            updatePunchUI(false);
            restoreState();
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
        
        const {
            WEEKDAY_RATE_1, WEEKDAY_RATE_2,
            RESTDAY_RATE_1, RESTDAY_RATE_2, RESTDAY_RATE_3,
            RESTDAY_TIER_1, RESTDAY_TIER_2,
            HOLIDAY_RATE
        } = LABOR_STANDARDS;
        
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

    function render() {
        const filteredRecords = filterRecords(monthFilter.value);
        const dailyGroups = groupRecordsByDay(filteredRecords);
        renderTable(recordsBody, dailyGroups);
        renderSummary(dailyGroups, monthFilter.value);
        updatePayPeriodHint();
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
                groups[dateKey] = {
                    date: new Date(rec.start),
                    type: rec.type,
                    records: []
                };
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
                if (rec.forceFullCalculation) {
                    reasonText += ' <strong style="color:var(--danger-color);">(強制計算)</strong>';
                }
                
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
                    if (rec.forceFullCalculation) {
                        reasonText += ' <strong style="color:var(--danger-color);">(強制計算)</strong>';
                    }
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
            const fileName = settings.userName 
                ? `加班記錄-${settings.userName}-${year}-${month}.png`
                : `加班記錄-${year}-${month}.png`;
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
        if (settings.userName) {
            csv += `姓名:,${settings.userName}\n`;
        }
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
        const fileName = settings.userName 
            ? `加班記錄-${settings.userName}-${year}-${month}.csv`
            : `加班記錄-${year}-${month}.csv`;
        link.download = fileName;
        link.click();
    }

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
        const now = Date.now();
        
        if (!lastBackup) {
            localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, now.toString());
            return;
        }
        
        const daysSinceBackup = Math.floor((now - parseInt(lastBackup)) / (1000 * 60 * 60 * 24));
        
        if (daysSinceBackup >= BACKUP_REMINDER_DAYS && records.length > 0) {
            showBackupReminder(daysSinceBackup);
        }
    }

    function showBackupReminder(days) {
        const reminderEl = document.getElementById('backup-reminder');
        const reminderText = document.getElementById('backup-reminder-text');
        
        reminderText.textContent = `您已經有 ${days} 天沒有備份資料了！為避免資料遺失，建議立即匯出備份。`;
        reminderEl.style.display = 'block';
        
        if (days >= BACKUP_REMINDER_DAYS * 2) {
            const modal = document.getElementById('backup-modal');
            document.getElementById('backup-days-count').textContent = days;
            modal.classList.add('show');
        }
    }

    function performBackup() {
        const outputArea = document.getElementById('export-output');
        const textarea = document.getElementById('export-textarea');
        
        textarea.value = JSON.stringify({ settings, records }, null, 2);
        outputArea.style.display = 'block';
        
        localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, Date.now().toString());
        
        document.getElementById('backup-reminder').style.display = 'none';
        document.getElementById('backup-modal').classList.remove('show');
        
        outputArea.scrollIntoView({ behavior: 'smooth' });
        
        alert('已生成備份資料，請複製並保存到安全的地方！');
    }

    function remindLater() {
        const threeDaysLater = Date.now() - ((BACKUP_REMINDER_DAYS - 3) * 24 * 60 * 60 * 1000);
        localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, threeDaysLater.toString());
        
        document.getElementById('backup-reminder').style.display = 'none';
        document.getElementById('backup-modal').classList.remove('show');
    }

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
                setTimeout(() => {
                    successMsg.style.display = 'none';
                }, 2000);
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
            const fileName = settings.userName 
                ? `加班記錄備份-${settings.userName}-${timestamp}.json`
                : `加班記錄備份-${timestamp}.json`;
            link.download = fileName;
            link.click();
        });
        
        document.getElementById('import-text').addEventListener('click', () => {
            const importText = document.getElementById('import-textarea').value;
            
            if (!importText) {
                showError('請先貼上要匯入的資料。');
                return;
            }
            
            if (!confirm('警告：匯入將會覆蓋所有現存資料，確定要繼續嗎？')) return;
            
            try {
                const data = JSON.parse(importText);
                
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
                
                if (validRecords.length !== data.records.length) {
                    if (!confirm(`偵測到 ${data.records.length - validRecords.length} 筆無效記錄將被忽略，是否繼續匯入？`)) {
                        return;
                    }
                }
                
                localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
                localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(validRecords));
                localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, Date.now().toString());
                
                init();
                alert(`資料匯入成功！共匯入 ${validRecords.length} 筆記錄。`);
                document.getElementById('import-textarea').value = '';
            } catch (error) {
                console.error('匯入錯誤:', error);
                showError('匯入失敗：無效的 JSON 格式。');
            }
        });
        
        document.getElementById('backup-now').addEventListener('click', performBackup);
        document.getElementById('backup-remind-later').addEventListener('click', remindLater);
        document.getElementById('modal-backup-now').addEventListener('click', performBackup);
        document.getElementById('modal-remind-later').addEventListener('click', remindLater);
        
        document.getElementById('backup-modal').addEventListener('click', (e) => {
            if (e.target.id === 'backup-modal') {
                remindLater();
            }
        });
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
            switchMode('punch', false);
            updatePunchUI(true);
            restoreFormFields();
            startTimer(new Date(tempRecord.start));
            restoreMsgEl.textContent = '已為您還原上次的打卡上班狀態。';
            restoreMsgEl.style.display = 'block';
        } else if (tempRecord.start && tempRecord.end) {
            switchMode('manual', false);
            updatePunchUI(false);
            document.getElementById('start-time').value = formatDateTimeLocal(new Date(tempRecord.start));
            document.getElementById('end-time').value = formatDateTimeLocal(new Date(tempRecord.end));
            restoreFormFields();
            restoreMsgEl.textContent = '您有未儲存的打卡紀錄，已為您還原。';
            restoreMsgEl.style.display = 'block';
        }
    }

    function handleUrlHash() {
        const hash = window.location.hash;
        
        if (hash === '#punch') {
            switchMode('punch', false);
            document.getElementById('mode-punch').scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (hash === '#records') {
            document.getElementById('capture-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        if (hash) {
            setTimeout(() => {
                history.replaceState(null, null, ' ');
            }, 1000);
        }
    }

    function init() {
        loadSettings();
        loadRecords();
        
        monthFilter.value = new Date().toISOString().substring(0, 7);
        
        render();
        setupEventListeners();
        restoreState();
        showWelcomeMessage();
        
        setTimeout(() => checkBackupReminder(), 2000);
        handleUrlHash();
    }

    window.app = {
        deleteRecord,
        editRecord,
        toggleDetails
    };

    init();
})();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}/**
 * 加班費計算機 v2.0 - JavaScript
 */

(function() {
    'use strict';

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
        WELCOME_SHOWN: 'welcomeShownV10',
    };

    const BACKUP_REMINDER_DAYS = 7;
    
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

    let settings = {};
    let records = [];
    let punchTimerInterval = null;

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
        
        const formatDate = (date) => {
            return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
        };
        
        return {
            start: periodStart,
            end: periodEnd,
            displayText: `${formatDate(periodStart)} ~ ${formatDate(periodEnd)}`
        };
    };

    const updatePayPeriodHint = () => {
        const monthValue = monthFilter.value;
        if (!monthValue) return;
        
        const period = getPayPeriod(monthValue);
        const hintEl = document.getElementById('pay-period-hint');
        hintEl.textContent = `📅 計薪週期: ${period.displayText}`;
    };

    function loadSettings() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
            settings = {
                userName: '',
                salaryType: 'monthly',
                salary: 0,
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

            const settingsDetails = document.getElementById('settings-details');
            settingsDetails.open = !(savedSettings && settings.salary > 0);
            
            document.getElementById('user-name').value = settings.userName || '';
            salaryInput.value = settings.salary || '';
            document.querySelector(`input[name="salaryType"][value="${settings.salaryType}"]`).checked = true;
            document.getElementById('payday').value = settings.payday || 1;
            document.getElementById('work-start').value = settings.workStart;
            document.getElementById('work-end').value = settings.workEnd;
            document.getElementById('break-start').value = settings.breakStart;
            document.getElementById('break-end').value = settings.breakEnd;
            
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
                if (!confirm('您輸入的薪資似乎偏低,確定要儲存嗎?')) {
                    return;
                }
            }

            settings = {
                userName: escapeHtml(document.getElementById('user-name').value.trim()),
                salaryType: document.querySelector('input[name="salaryType"]:checked').value,
                salary: salary,
                payday: parseInt(document.getElementById('payday').value) || 1,
                workStart: document.getElementById('work-start').value,
                workEnd: document.getElementById('work-end').value,
                breakStart: document.getElementById('break-start').value,
                breakEnd: document.getElementById('break-end').value,
            };
            
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
            calculateHourlyRate();
            updatePayPeriodHint();
            render();
            alert('設定已儲存!');
            document.getElementById('settings-details').open = false;
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
        } catch (error) {
            console.error('儲存記錄時發生錯誤:', error);
            showError('儲存記錄時發生錯誤,可能是儲存空間不足。');
        }
    }, 500);

    function clearForm() {
        ['start-time', 'end-time', 'overtime-reason', 'edit-id'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.querySelector('input[name="overtimeType"][value="weekday"]').checked = true;
        forceFullCalcToggle.checked = false;
        addRecordBtn.textContent = '新增紀錄';
        hideError();
        localStorage.removeItem(STORAGE_KEYS.TEMP_RECORD);
        
        const restoreMsgEl = document.getElementById('restore-message');
        restoreMsgEl.style.display = 'none';
        restoreMsgEl.textContent = '';
        
        stopTimer();
        updatePunchUI(false);
    }

    function isOverlapping(newRecord) {
        const newStart = new Date(newRecord.start).getTime();
        const newEnd = new Date(newRecord.end).getTime();
        
        const conflicts = records.filter(rec => {
            if (rec.id === newRecord.id) return false;
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
        loadRecords();
        render();
        clearForm();
    }

    function deleteRecord(id) {
        if (confirm('確定要刪除這筆紀錄嗎?')) {
            records = records.filter(record => record.id !== id);
            saveRecords();
            render();
        }
    }

    function editRecord(id) {
        const record = records.find(rec => rec.id === id);
        if (record) {
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

    function
