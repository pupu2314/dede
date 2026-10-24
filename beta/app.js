
// ==========================================
// 全域變數與狀態管理
// ==========================================
let serviceData = null;
let allServices = new Map();
let selectedItems = new Set();
let currentIdentity = 'general'; 
let currentReceiptData = null; // 新增：儲存當下所有的結帳與明細資訊，供截圖時使用
const DOM = {};

const DATA_CACHE_KEY = 'dede_services_data_cache';

// ==========================================
// 1. 初始化與資料載入
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initDOMVariables();

    if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'block';

    try {
        serviceData = await loadServiceData();
        if (serviceData) {
            if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
            initializePage();
        } else {
            throw new Error('無法取得服務資料');
        }
    } catch (error) {
        console.error('初始化失敗:', error);
        if (DOM.loadingIndicator) {
            DOM.loadingIndicator.innerHTML = `<p style="color: var(--danger-color, #dc3545);">❌ 載入失敗：請檢查網路連線或重新整理頁面。</p>`;
        }
        showNotice('資料載入失敗，請稍後再試。');
    }
});

function initDOMVariables() {
    DOM.serviceList = document.getElementById('service-list');
    DOM.searchInput = document.getElementById('search-input');
    DOM.loadingIndicator = document.getElementById('loading-indicator');
    DOM.summarySection = document.getElementById('summary-details'); 
    
    DOM.originalTotal = document.getElementById('floating-original-total');
    DOM.originalTotalP = document.getElementById('original-total-p');
    DOM.promoSavingsContainer = document.getElementById('promo-savings-container');
    DOM.appliedPromo = document.getElementById('floating-applied-promo');         
    DOM.discountedTotal = document.getElementById('floating-discounted-total');
    DOM.savings = document.getElementById('floating-savings');
    DOM.points = document.getElementById('floating-points');
    DOM.pointsContainer = document.getElementById('points-container');
    DOM.selectedItemsList = document.querySelector('#floating-selected-items-list ul');
    
    DOM.saveBtn = document.getElementById('save-btn');
    DOM.loadBtn = document.getElementById('load-btn');
    DOM.clearBtn = document.getElementById('clear-btn');
    DOM.shareLinkBtn = document.getElementById('share-link-btn');
    DOM.screenshotBtn = document.getElementById('screenshot-btn');
}

async function loadServiceData() {
    let cachedData = null;
    const localDataString = localStorage.getItem(DATA_CACHE_KEY);
    if (localDataString) {
        try {
            cachedData = JSON.parse(localDataString);
        } catch (e) {
            console.warn('本機快取解析失敗', e);
        }
    }

    if (cachedData) {
        setTimeout(checkForDataUpdate, 1000);
        return cachedData;
    } else {
        try {
            const response = await fetch(`services.json?t=${new Date().getTime()}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`伺服器回應錯誤: ${response.status}`);
            const data = await response.json();
            localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
            return data;
        } catch (networkError) {
            throw networkError;
        }
    }
}

// ==========================================
// 價格資料自動更新（不擋畫面）
// 發現 services.json 有新版本時：頂部顯示提示列 → 自動下載並立即套用，
// 已勾選的項目會保留（若項目已下架則自動移除並告知），不需要使用者按任何按鈕。
// ==========================================
let lastDataCheck = 0;
let dataChecking = false;

function showUpdateBar(msg, kind, hideAfterMs) {
    let bar = document.getElementById('update-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'update-bar';
        bar.setAttribute('role', 'status');
        bar.setAttribute('aria-live', 'polite');
        Object.assign(bar.style, {
            position: 'fixed', top: '0', left: '0', right: '0', zIndex: '3000',
            padding: '10px 14px', textAlign: 'center', fontWeight: '700', fontSize: '15px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)', pointerEvents: 'none',
            transition: 'opacity .3s'
        });
        document.body.appendChild(bar);
    }
    const colors = {
        info: ['#e7f1ff', '#0b5ed7'],
        ok:   ['#d1e7dd', '#0f5132'],
        warn: ['#fff3cd', '#664d03']
    };
    const [bg, fg] = colors[kind] || colors.info;
    bar.style.backgroundColor = bg;
    bar.style.color = fg;
    bar.textContent = msg;
    bar.style.opacity = '1';
    clearTimeout(bar._hideTimer);
    if (hideAfterMs) bar._hideTimer = setTimeout(hideUpdateBar, hideAfterMs);
}

function hideUpdateBar() {
    const bar = document.getElementById('update-bar');
    if (bar) { clearTimeout(bar._hideTimer); bar.style.opacity = '0'; }
}

// 套用新資料：不重新載入頁面，保留已勾選項目與搜尋條件
function applyLatestData(latestData) {
    serviceData = latestData;
    allServices.clear();
    serviceData.categories.forEach(cat => {
        cat.items.forEach(item => allServices.set(item.id, item));
    });
    const removed = [...selectedItems].filter(id => !allServices.has(id));
    removed.forEach(id => selectedItems.delete(id));
    renderServiceList(DOM.searchInput ? DOM.searchInput.value : '');
    updateCheckboxes();
    updateTotals();
    return removed;
}

async function checkForDataUpdate() {
    if (dataChecking) return;
    dataChecking = true;
    lastDataCheck = Date.now();
    // 只有網路比較慢（超過 1.5 秒）才顯示「檢查中」，平常不打擾使用者
    const slowTimer = setTimeout(() => showUpdateBar('⏳ 正在檢查最新價格，請稍候…', 'info'), 1500);
    try {
        const response = await fetch(`services.json?t=${new Date().getTime()}`, { cache: 'no-store' });
        clearTimeout(slowTimer);
        if (!response.ok) { hideUpdateBar(); return; }
        const latestData = await response.json();
        const latestDataString = JSON.stringify(latestData);
        const currentString = localStorage.getItem(DATA_CACHE_KEY);
        if (currentString === latestDataString) { hideUpdateBar(); return; }

        showUpdateBar('⏳ 發現新價格，正在自動更新，請稍候…', 'info');
        await new Promise(resolve => setTimeout(resolve, 500)); // 讓提示列有時間被看見
        localStorage.setItem(DATA_CACHE_KEY, latestDataString);
        try {
            const removed = applyLatestData(latestData);
            showUpdateBar(
                '✅ 已更新為最新價格' + (removed.length ? `（有 ${removed.length} 個已勾選項目已下架，已自動移除）` : ''),
                removed.length ? 'warn' : 'ok',
                removed.length ? 8000 : 4000
            );
        } catch (applyError) {
            console.error('套用新資料失敗，改為重新載入頁面:', applyError);
            showUpdateBar('✅ 已下載新價格，正在重新載入…', 'info');
            setTimeout(() => window.location.reload(), 600);
        }
    } catch (error) {
        clearTimeout(slowTimer);
        hideUpdateBar();
        console.log('背景檢查更新失敗:', error);
    } finally {
        dataChecking = false;
    }
}

// 員工常把計算器開一整天：回到前景且距離上次檢查超過 10 分鐘，就再檢查一次
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && serviceData && Date.now() - lastDataCheck > 10 * 60 * 1000) {
        checkForDataUpdate();
    }
});

function initializePage() {
    allServices.clear();
    serviceData.categories.forEach(cat => {
        cat.items.forEach(item => {
            allServices.set(item.id, item);
        });
    });

    setupFloatingSummary();   
    renderIdentitySelector(); 
    renderServiceList();
    bindEvents();
    
    loadFromUrl();
    updateTotals();
}

function setupFloatingSummary() {
    if (DOM.summarySection) {
        Object.assign(DOM.summarySection.style, {
            position: 'fixed',
            bottom: '0',
            left: '0',
            width: '100%',
            backgroundColor: '#ffffff',
            boxShadow: '0 -4px 15px rgba(0,0,0,0.15)',
            zIndex: '1000',
            padding: '15px 20px',
            margin: '0',
            boxSizing: 'border-box',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            maxHeight: '40vh',
            overflowY: 'auto'
        });
        document.body.style.paddingBottom = '45vh'; 
    }
}

function renderIdentitySelector() {
    if (!DOM.serviceList) return;
    const container = document.createElement('fieldset');
    container.style.marginBottom = '20px';
    container.style.borderColor = '#007bff';
    container.style.backgroundColor = '#f8f9fa';
    container.innerHTML = `
        <legend style="color: #007bff; font-weight: bold;">👤 客戶身分 (折扣選擇)</legend>
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
            <label><input type="radio" name="identity" value="general" checked> 一般客戶</label>
            <label><input type="radio" name="identity" value="birthday"> 當月壽星 (原價 ${Math.round(DeDeUtils.RULES.identities.birthday.rate * 100) / 10} 折)</label>
            <label><input type="radio" name="identity" value="student"> 學生 (原價 ${Math.round(DeDeUtils.RULES.identities.student.rate * 100) / 10} 折)</label>
        </div>
    `;
    container.querySelectorAll('input[name="identity"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentIdentity = e.target.value;
            updateTotals(); 
        });
    });
    DOM.serviceList.parentNode.insertBefore(container, DOM.serviceList);
}

// ==========================================
// 2. 渲染與事件綁定
// ==========================================
function renderServiceList(filterText = '') {
    if (!DOM.serviceList) return;
    DOM.serviceList.innerHTML = '';
    
    const terms = filterText.toLowerCase().split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0);

    // 置頂套餐區 (只在沒有搜尋條件時顯示)
    if (serviceData.combos && Array.isArray(serviceData.combos) && terms.length === 0) {
        const activeCombos = serviceData.combos.map((combo, index) => ({combo, index}))
            .filter(item => getActivePromotion(item.combo.promotions) !== null);

        if (activeCombos.length > 0) {
            const comboFieldset = document.createElement('fieldset');
            comboFieldset.style.borderColor = '#ff9800';
            comboFieldset.style.backgroundColor = '#fff8e1';
            comboFieldset.style.marginBottom = '20px';
            
            const legend = document.createElement('legend');
            legend.style.color = '#e65100';
            legend.style.fontWeight = 'bold';
            legend.textContent = '🔥 本月超值套餐';
            comboFieldset.appendChild(legend);

            activeCombos.forEach(({combo, index}) => {
                const activePromo = getActivePromotion(combo.promotions);
                const itemNames = combo.itemIds.map(id => allServices.get(id)?.name).filter(Boolean).join(' + ');
                let originalPrice = combo.itemIds.reduce((sum, id) => sum + (allServices.get(id)?.price || 0), 0);

                const div = document.createElement('div');
                div.className = 'service-item';
                div.style.borderBottom = '1px solid #ffe0b2';
                
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'combo-checkbox'; 
                checkbox.dataset.comboIndex = index;
                checkbox.checked = combo.itemIds.every(id => selectedItems.has(id));
                
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        combo.itemIds.forEach(id => selectedItems.add(id));
                    } else {
                        combo.itemIds.forEach(id => selectedItems.delete(id));
                    }
                    updateCheckboxes();
                    updateTotals();
                });

                const nameSpan = document.createElement('span');
                nameSpan.className = 'item-name';
                nameSpan.innerHTML = `<span style="font-weight: bold; color: #d84315;">${combo.name}</span><br><span style="font-size: 0.85em; color: #666;">包含：${itemNames}</span>`;

                const priceSpan = document.createElement('span');
                priceSpan.className = 'item-price-detail';
                priceSpan.innerHTML = `
                    <span style="text-decoration: line-through; color: #999; font-size: 0.85em;">原價 $${originalPrice}</span><br>
                    <span style="color: #d84315; font-weight: bold; font-size: 1.05em;">套餐價 $${activePromo.price}</span>
                `;

                label.appendChild(checkbox);
                label.appendChild(nameSpan);
                label.appendChild(priceSpan);
                div.appendChild(label);
                comboFieldset.appendChild(div);
            });
            
            DOM.serviceList.appendChild(comboFieldset);
        }
    }

    // 一般分類與服務項目
    serviceData.categories.forEach(category => {
        const filteredItems = category.items.filter(item => {
            if (terms.length === 0) return true;
            return terms.some(term => 
                item.name.toLowerCase().includes(term) || 
                (item.tags && item.tags.some(tag => tag.toLowerCase().includes(term)))
            );
        });

        if (filteredItems.length === 0) return; 

        const fieldset = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = category.name;
        fieldset.appendChild(legend);

        const actionDiv = document.createElement('div');
        actionDiv.style.marginBottom = '10px';
        actionDiv.style.display = 'flex';
        actionDiv.style.gap = '10px';
        
        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'btn btn-sm';
        selectAllBtn.textContent = '全選';
        selectAllBtn.onclick = () => {
            filteredItems.forEach(item => selectedItems.add(item.id));
            updateCheckboxes();
            updateTotals();
        };

        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.className = 'btn btn-sm';
        deselectAllBtn.style.backgroundColor = 'var(--text-muted)';
        deselectAllBtn.textContent = '取消全選';
        deselectAllBtn.onclick = () => {
            filteredItems.forEach(item => selectedItems.delete(item.id));
            updateCheckboxes();
            updateTotals();
        };

        actionDiv.appendChild(selectAllBtn);
        actionDiv.appendChild(deselectAllBtn);
        fieldset.appendChild(actionDiv);

        filteredItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'service-item';
            
            const label = document.createElement('label');
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item.id;
            checkbox.checked = selectedItems.has(item.id);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) selectedItems.add(item.id);
                else selectedItems.delete(item.id);
                
                updateCheckboxes();
                updateTotals();
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'item-name';
            nameSpan.textContent = item.name;

            const priceSpan = document.createElement('span');
            priceSpan.className = 'item-price-detail';
            
            const activePromo = getActivePromotion(item.promotions);
            if (activePromo) {
                priceSpan.innerHTML = `
                    <span style="text-decoration: line-through; color: #999; font-size: 0.85em;">$${item.price}</span><br>
                    <span class="discount-note">${activePromo.label}</span>
                    <span style="color: var(--danger-color);">$${activePromo.price}</span>
                `;
            } else {
                priceSpan.textContent = `$${item.price}`;
            }

            label.appendChild(checkbox);
            label.appendChild(nameSpan);
            label.appendChild(priceSpan);
            div.appendChild(label);
            fieldset.appendChild(div);
        });

        DOM.serviceList.appendChild(fieldset);
    });
}

function bindEvents() {
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => renderServiceList(e.target.value));
    }
    if (DOM.saveBtn) DOM.saveBtn.addEventListener('click', saveSelections);
    if (DOM.loadBtn) DOM.loadBtn.addEventListener('click', loadSelections);
    if (DOM.clearBtn) DOM.clearBtn.addEventListener('click', clearSelections);
    if (DOM.shareLinkBtn) DOM.shareLinkBtn.addEventListener('click', generateShareableLink);
    if (DOM.screenshotBtn) DOM.screenshotBtn.addEventListener('click', exportAsPNG);
}

// ==========================================
// 3. 核心計算邏輯 (價格、優惠、組合)
// ==========================================
// 判斷優惠是否生效的邏輯已抽到 utils.js 的 DeDeUtils.getActivePromotion，
// 這裡建立一個別名，維持原本呼叫方式 getActivePromotion(...) 不用全部改名。
const getActivePromotion = window.DeDeUtils.getActivePromotion;

function updateTotals() {
    if (!DOM.discountedTotal || !DOM.selectedItemsList) return;

    // 計價規則集中在 utils.js 的 DeDeUtils.calcOrder()（整單擇優）：
    // 身分優惠（學生/壽星）與限時優惠/套餐不可併用，整張單取總額較低的一邊。
    const calc = DeDeUtils.calcOrder({
        itemIds: Array.from(selectedItems),
        itemsById: allServices,
        combos: serviceData.combos,
        identity: currentIdentity
    });
    const { originalTotal, finalTotal, usedIdentity, identityLabel } = calc;
    const receiptItems = calc.lines.map(line =>
        line.isCombo ? { ...line, name: line.itemNames.join('<br>') } : line
    );

    const savings = calc.savings;
    const points = calc.points;
    let appliedPromoText = '無';
    let detailsHtml = '';

    // 4. 產生 UI 明細列表 (加入自動換行與價格靠右)
    receiptItems.forEach(item => {
        let priceHtml = `$${item.originalPrice}`;
        if (item.hasPromo) {
            if (item.isIdentity) {
                priceHtml = `<span style="color: var(--danger-color); font-weight: bold; margin-right: 5px;">$${item.finalPrice}</span> <span style="text-decoration: line-through; color: #999; font-size: 0.8em;">$${item.originalPrice}</span> <br><span style="color: var(--primary-color, #007bff); font-size: 0.85em;">${item.identityMsg}</span>`;
            } else {
                let promoDateStr = (item.promoStart && item.promoEnd) ? `<br><span style="color: #6c757d; font-size: 0.75em;">(期限: ${item.promoStart} ~ ${item.promoEnd})</span>` : '';
                priceHtml = `<span style="color: var(--danger-color); font-weight: bold; margin-right: 5px;">$${item.finalPrice}</span> <span style="text-decoration: line-through; color: #999; font-size: 0.8em;">$${item.originalPrice}</span>${promoDateStr}`;
            }
        }
        
        detailsHtml += `
            <li style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dotted #e0e0e0; padding-bottom: 8px;">
                <div style="flex: 1; padding-right: 15px; word-break: break-word; line-height: 1.4;">
                    <span class="item-name">${item.isCombo ? '🎁 組合優惠<br>' : ''}${item.name}</span>
                    <div style="margin-top: 6px;">
                        <button class="cancel-item-btn" style="background-color: #dc3545; color: white; padding: 2px 8px; font-size: 0.8em; border-radius: 4px; border: none; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" data-ids="${item.ids.join(',')}" data-name="${item.name.replace(/<br>/g, ' + ')}">❌ 取消</button>
                    </div>
                </div>
                <span class="item-price-detail" style="text-align: right; white-space: nowrap; flex-shrink: 0;">${priceHtml}</span>
            </li>
        `;
    });

    if (usedIdentity) {
        appliedPromoText = identityLabel;
    } else {
        let promoNames = new Set();
        receiptItems.forEach(i => {
            if (i.hasPromo && i.promoName) promoNames.add(i.promoName);
        });
        if (promoNames.size > 0) {
            appliedPromoText = Array.from(promoNames).join('、'); 
        }
    }

    if (selectedItems.size === 0) {
        detailsHtml = '<li style="color: #999; padding: 5px 0;">尚未選擇任何服務</li>';
    }

    DOM.selectedItemsList.innerHTML = detailsHtml;

    // 綁定明細上的取消按鈕事件
    const cancelBtns = DOM.selectedItemsList.querySelectorAll('.cancel-item-btn');
    cancelBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idsToRemove = e.target.getAttribute('data-ids').split(',');
            const itemName = e.target.getAttribute('data-name');
            if (confirm(`確定要取消「${itemName}」嗎？`)) {
                idsToRemove.forEach(id => selectedItems.delete(id));
                updateCheckboxes();
                updateTotals();
                showNotice(`🗑️ 已取消：${itemName}`);
            }
        });
    });

    // 5. 動態更新總計區塊的文字與顯示狀態
    const discountedTotalPNode = document.getElementById('discounted-total-p');

    if (savings > 0) {
        if (DOM.originalTotalP) {
            DOM.originalTotalP.style.display = 'block';
            DOM.originalTotalP.innerHTML = `總原價：<span id="floating-original-total">${originalTotal.toLocaleString()}</span> 元`;
        }
        if (DOM.promoSavingsContainer) {
            DOM.promoSavingsContainer.style.display = 'block';
            if (DOM.appliedPromo) DOM.appliedPromo.textContent = appliedPromoText;
            if (DOM.savings) DOM.savings.textContent = savings.toLocaleString();
        }
        if (discountedTotalPNode) {
            discountedTotalPNode.innerHTML = `折扣後總金額：<span id="floating-discounted-total">${finalTotal.toLocaleString()}</span> 元`;
        }
    } else {
        if (DOM.originalTotalP) DOM.originalTotalP.style.display = 'none';
        if (DOM.promoSavingsContainer) DOM.promoSavingsContainer.style.display = 'none';
        if (discountedTotalPNode) {
            discountedTotalPNode.innerHTML = `總金額：<span id="floating-discounted-total">${finalTotal.toLocaleString()}</span> 元`;
        }
    }

    // 可獲得點數
    if (points > 0 && DOM.pointsContainer) {
        DOM.pointsContainer.style.display = 'block';
        if (DOM.points) DOM.points.textContent = points.toLocaleString();
    } else if (DOM.pointsContainer) {
        DOM.pointsContainer.style.display = 'none';
    }

    currentReceiptData = {
        identity: currentIdentity,
        identityLabel,
        usedIdentity,
        originalTotal,
        finalTotal,
        savings,
        points,
        appliedPromoName: appliedPromoText,
        items: receiptItems
    };
}

// ==========================================
// 4. 實用功能 (儲存、讀取、分享、清除)
// ==========================================
function saveSelections() {
    if (selectedItems.size === 0) {
        showNotice('沒有選擇任何項目可以儲存');
        return;
    }
    localStorage.setItem('dede_saved_selections', JSON.stringify(Array.from(selectedItems)));
    showNotice('✅ 選擇已儲存！下次開啟可直接載入');
}

function loadSelections() {
    const saved = localStorage.getItem('dede_saved_selections');
    if (saved) {
        try {
            const items = JSON.parse(saved);
            selectedItems = new Set(items);
            updateCheckboxes();
            updateTotals();
            showNotice('✅ 已載入您上次儲存的選擇');
        } catch (e) {
            showNotice('❌ 載入失敗，資料可能已損毀');
        }
    } else {
        showNotice('沒有找到儲存的紀錄');
    }
}

function clearSelections() {
    if (selectedItems.size === 0) return;
    if (confirm('確定要清除所有已勾選的項目嗎？')) {
        selectedItems.clear();
        updateCheckboxes();
        updateTotals();
        showNotice('🗑️ 已清除所有選擇');
    }
}

function generateShareableLink() {
    if (selectedItems.size === 0) {
        showNotice('請先勾選服務項目後再產生分享連結');
        return;
    }
    const ids = Array.from(selectedItems).join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('items', ids);
    
    // 複製到剪貼簿
    navigator.clipboard.writeText(url.toString()).then(() => {
        showNotice('🔗 分享連結已複製到剪貼簿！可直接貼給朋友');
    }).catch(() => {
        showNotice('❌ 複製失敗，請手動複製網址列的網址');
    });
}

function updateCheckboxes() {
    if (!DOM.serviceList) return;
    
    // 1. 更新一般單品的勾選狀態
    const checkboxes = DOM.serviceList.querySelectorAll('.service-item input[type="checkbox"]:not(.combo-checkbox)');
    checkboxes.forEach(cb => {
        cb.checked = selectedItems.has(cb.value);
    });

    // 2. 更新置頂套餐的勾選狀態
    const comboCheckboxes = DOM.serviceList.querySelectorAll('.combo-checkbox');
    comboCheckboxes.forEach(cb => {
        const comboIndex = cb.dataset.comboIndex;
        const combo = serviceData.combos[comboIndex];
        if (combo && combo.itemIds) {
            cb.checked = combo.itemIds.every(id => selectedItems.has(id));
        }
    });
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const itemsParam = params.get('items');
    if (itemsParam) {
        const ids = itemsParam.split(',');
        let loadedCount = 0;
        ids.forEach(id => {
            if (allServices.has(id)) {
                selectedItems.add(id);
                loadedCount++;
            }
        });
        if (loadedCount > 0) {
            updateCheckboxes();
            showNotice('✅ 已成功載入好友分享的服務清單');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function exportAsPNG() {
    if (selectedItems.size === 0 || !currentReceiptData) {
        showNotice('⚠️ 尚未選擇任何服務，無法截圖');
        return;
    }
    if (typeof html2canvas === 'undefined') {
        showNotice('截圖套件載入中，請稍後再試');
        return;
    }

    const btn = DOM.screenshotBtn;
    const originalText = btn.textContent;
    btn.textContent = '處理中...';
    btn.disabled = true;

    const receiptDiv = document.createElement('div');
    Object.assign(receiptDiv.style, {
        position: 'absolute',
        left: '-9999px',
        top: '0',
        width: '450px', 
        backgroundColor: '#ffffff',
        padding: '25px',
        fontFamily: 'sans-serif',
        color: '#333',
        boxSizing: 'border-box'
    });

    // 標題區
    let html = `<h2 style="text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 10px; color: #0056b3; margin-top: 0;"><img src="dede.png" crossorigin="anonymous" style="max-width: 100%; height: auto;"></h2>`;

    if (currentReceiptData.identity !== 'general') {
         html += `<div style="background-color: #ffeeba; color: #856404; padding: 10px; border-radius: 5px; text-align: center; font-weight: bold; margin-bottom: 15px;">
             👤 客戶身分：${currentReceiptData.identityLabel}
         </div>`;
    }

    // 服務明細區
    html += `<h3 style="margin-bottom: 10px; font-size: 1.1em; border-bottom: 1px solid #eee; padding-bottom: 5px;">服務明細</h3>`;
    html += `<ul style="list-style: none; padding: 0; margin: 0 0 20px 0;">`;

    currentReceiptData.items.forEach(item => {
        let priceText = `$${item.originalPrice}`;
        if (item.hasPromo) {
            if (item.isIdentity) {
                priceText = `<span style="color: #dc3545; font-weight: bold;">$${item.finalPrice}</span> <span style="color: #999; text-decoration: line-through; font-size: 0.85em;">$${item.originalPrice}</span> <br><span style="color: #007bff; font-size: 0.85em;">${item.identityMsg}</span>`;
            } else {
                let promoDateStr = (item.promoStart && item.promoEnd) ? `<br><span style="color: #6c757d; font-size: 0.75em;">(優惠期限: ${item.promoStart} ~ ${item.promoEnd})</span>` : '';
                priceText = `<span style="color: #dc3545; font-weight: bold;">$${item.finalPrice}</span> <span style="color: #999; text-decoration: line-through; font-size: 0.85em;">$${item.originalPrice}</span>${promoDateStr}`;
            }
        }
        
        html += `<li style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; line-height: 1.4;">
            <span style="flex: 1; padding-right: 15px; word-break: break-word;">${item.isCombo ? '🎁 組合優惠<br>' : ''}${item.name}</span>
            <span style="text-align: right; white-space: nowrap; flex-shrink: 0;">${priceText}</span>
        </li>`;
    });
    html += `</ul>`;

    html += `<div style="border-top: 2px dashed #ccc; padding-top: 15px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 1em; line-height: 1.6;">`;
    
    // 2. 左邊區塊
    html += `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <img src="img/LINE.png" crossorigin="anonymous" style="width: 80px; height: 80px; margin-bottom: 5px;">
            <span style="font-size: 0.8em; color: #555; font-weight: bold;">官方LINE帳號</span>
        </div>
    `;

    // 3. 右邊區塊
    html += `<div style="text-align: right;">`;
    
    if (currentReceiptData.savings > 0) {
        html += `<p style="margin: 0;">原價：$${currentReceiptData.originalTotal.toLocaleString()}</p>
        <p style="margin: 0;">
            <span style="color: #dc3545;">套用優惠：${currentReceiptData.appliedPromoName}</span>
            <span style="color: #28a745; margin-left: 8px;">(共省下：$${currentReceiptData.savings.toLocaleString()})</span>
        </p>
        <p style="margin: 8px 0 0 0; font-size: 1.3em; font-weight: bold;">折扣後金額：$${currentReceiptData.finalTotal.toLocaleString()}</p>`;
    } else {
        html += `<p style="margin: 8px 0 0 0; font-size: 1.3em; font-weight: bold;">總金額：$${currentReceiptData.finalTotal.toLocaleString()}</p>`;
    }
    
    if (currentReceiptData.points > 0) {
        html += `<p style="margin: 5px 0 0 0; color: #007bff; font-weight: bold;">🎁 可獲得點數：${currentReceiptData.points.toLocaleString()} 點</p>`;
    }
    
    html += `</div>`;
    html += `</div>`;

    receiptDiv.innerHTML = html;
    document.body.appendChild(receiptDiv);

    const takeScreenshot = () => {
        html2canvas(receiptDiv, {
            scale: 2, 
            backgroundColor: '#ffffff',
            useCORS: true // 允許載入跨域圖片
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `德德美體-估價單-${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showNotice('📷 專屬估價單截圖已下載！');
        }).catch(err => {
            console.error('截圖失敗:', err);
            showNotice('❌ 截圖發生錯誤');
        }).finally(() => {
            document.body.removeChild(receiptDiv);
            btn.textContent = originalText;
            btn.disabled = false;
        });
    };

    const imgInDiv = receiptDiv.querySelector('img');
    
    if (imgInDiv) {
        if (imgInDiv.complete) {
            // 如果圖片已經在瀏覽器快取裡，就直接截圖
            takeScreenshot();
        } else {
            // 等待圖片載入完成
            imgInDiv.onload = takeScreenshot;
            // 萬一圖片網址失效或網路斷線，為了不卡死，還是繼續產生沒有圖片的估價單
            imgInDiv.onerror = () => {
                console.warn('Logo 圖檔載入失敗');
                takeScreenshot(); 
            };
        }
    } else {
        takeScreenshot();
    }
}
// ==========================================
// 5. UI 通知系統
// ==========================================
function showNotice(msg) {
    let toast = document.getElementById('toast-notification');
    if (toast) {
        toast.textContent = msg; toast.style.opacity = '1'; toast.style.transform = 'translate(-50%, -20px)';
        if(toast.timeoutId) clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translate(-50%, 0)'; }, 3000);
        return;
    }
    let noticeDiv = document.getElementById('sw-notice');
    if (noticeDiv) noticeDiv.remove();
    noticeDiv = document.createElement('div'); noticeDiv.id = 'sw-notice'; noticeDiv.className = 'sw-notice slide-up-animation';
    noticeDiv.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">關閉</button>`;
    document.body.appendChild(noticeDiv);
    setTimeout(() => { if (document.getElementById('sw-notice') === noticeDiv) { noticeDiv.style.opacity = '0'; noticeDiv.style.transform = 'translate(-50%, 20px)'; setTimeout(() => noticeDiv.remove(), 500); } }, 4000);
}
