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
    DOM.appliedPromoContainer = document.getElementById('applied-promo-container'); // 新增：優惠容器
    DOM.appliedPromo = document.getElementById('floating-applied-promo');         // 新增：優惠文字
    DOM.discountedTotal = document.getElementById('floating-discounted-total');
    DOM.savings = document.getElementById('floating-savings');
    DOM.savingsContainer = document.getElementById('savings-container');
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

    const checkUpdateInBackground = async () => {
        try {
            const response = await fetch(`services.json?t=${new Date().getTime()}`, { cache: 'no-store' });
            if (response.ok) {
                const latestData = await response.json();
                const latestDataString = JSON.stringify(latestData);

                if (localDataString !== latestDataString) {
                    setTimeout(() => {
                        const userAgreed = confirm('📢 系統通知\n\n發現新的服務項目或價格已更新！\n是否立即載入最新版本？\n\n(若選擇取消，您將繼續使用當前版本直到下次開啟)');
                        if (userAgreed) {
                            localStorage.setItem(DATA_CACHE_KEY, latestDataString);
                            window.location.reload(); 
                        }
                    }, 800);
                }
            }
        } catch (error) {
            console.log('背景檢查更新失敗:', error);
        }
    };

    if (cachedData) {
        setTimeout(checkUpdateInBackground, 1000);
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
            <label><input type="radio" name="identity" value="birthday"> 當月壽星 (原價 5 折)</label>
            <label><input type="radio" name="identity" value="student"> 學生 (原價 8 折)</label>
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
                updateTotals();
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'item-name';
            nameSpan.textContent = item.name;

            const priceSpan = document.createElement('span');
            priceSpan.className = 'item-price-detail';
            
            const activePromo = getActivePromotion(item.promotions);
            if (activePromo) {
                priceSpan.innerHTML = `<span style="text-decoration: line-through; color: #999; margin-right: 5px;">$${item.price}</span> <span style="color: var(--danger-color);">$${activePromo.price}</span> <span class="discount-note">${activePromo.label}</span>`;
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
function getActivePromotion(promotions) {
    if (!promotions || !Array.isArray(promotions) || promotions.length === 0) return null;
    const now = new Date();
    for (const promo of promotions) {
        const start = new Date(promo.start);
        const end = new Date(promo.end);
        end.setHours(23, 59, 59, 999); 
        if (now >= start && now <= end) return promo;
    }
    return null;
}

function updateTotals() {
    if (!DOM.discountedTotal || !DOM.selectedItemsList) return;

    let originalTotal = 0;
    let finalTotal = 0;
    let receiptItems = []; // 收集計算後的獨立單品供渲染使用
    let remainingItems = new Set(selectedItems);

    // 1. 處理組合優惠
    if (serviceData.combos && Array.isArray(serviceData.combos)) {
        serviceData.combos.forEach(combo => {
            if (!combo.items || !Array.isArray(combo.items)) return;

            const activeComboPromo = getActivePromotion([combo]); 
            const hasValidDate = (!combo.start && !combo.end) || activeComboPromo !== null;

            if (hasValidDate) {
                const isMatch = combo.items.every(id => remainingItems.has(id));
                if (isMatch) {
                    let comboOriginalPrice = 0;
                    combo.items.forEach(id => {
                        const item = allServices.get(id);
                        if(item) comboOriginalPrice += item.price;
                        remainingItems.delete(id); 
                    });
                    
                    originalTotal += comboOriginalPrice;
                    finalTotal += combo.price;
                    
                    receiptItems.push({
                        name: combo.name,
                        originalPrice: comboOriginalPrice,
                        finalPrice: combo.price,
                        hasPromo: combo.price < comboOriginalPrice,
                        promoName: combo.price < comboOriginalPrice ? combo.name : null, // 新增：紀錄組合優惠名稱
                        isCombo: true
                    });
                }
            }
        });
    }

    // 2. 處理剩餘單品
    remainingItems.forEach(id => {
        const item = allServices.get(id);
        if (!item) return;

        originalTotal += item.price;
        const activePromo = getActivePromotion(item.promotions);
        let itemFinalPrice = activePromo ? activePromo.price : item.price;

        finalTotal += itemFinalPrice;
        
        receiptItems.push({
            name: item.name,
            originalPrice: item.price,
            finalPrice: itemFinalPrice,
            hasPromo: activePromo !== null,
            promoName: activePromo ? activePromo.label : null, // 新增：紀錄單品優惠名稱
            isCombo: false
        });
    });

    // 3. 身分比價邏輯
    let identityDiscountPrice = originalTotal;
    let identityLabel = '';
    let usedIdentity = false;
    
    if (currentIdentity === 'birthday') {
        identityDiscountPrice = originalTotal * 0.5;
        identityLabel = '壽星5折優惠'; // 更新：精確顯示優惠名稱
    } else if (currentIdentity === 'student') {
        identityDiscountPrice = originalTotal * 0.8;
        identityLabel = '學生8折優惠'; // 更新：精確顯示優惠名稱
    }

    if (currentIdentity !== 'general' && selectedItems.size > 0) {
        if (identityDiscountPrice < finalTotal) {
            finalTotal = identityDiscountPrice;
            usedIdentity = true;
        }
    }

    const savings = originalTotal - finalTotal;
    const points = Math.floor(finalTotal / 1500); // 新增：修改為消費滿 1500 給予 1 點
    let appliedPromoText = '無';
    let detailsHtml = '';

    // 4. 產生 UI 明細列表 (縮小間距排版)
    receiptItems.forEach(item => {
        let priceHtml = `$${item.originalPrice}`;
        if (item.hasPromo) {
            if (usedIdentity) {
                priceHtml = `<span style="color: #999; text-decoration: line-through; margin-right: 5px;">$${item.originalPrice}</span> <span style="color: #dc3545; font-size: 0.85em;">【使用優惠則免】</span>`;
            } else {
                priceHtml = `<span style="color: var(--danger-color); font-weight: bold; margin-right: 5px;">$${item.finalPrice}</span> <span style="text-decoration: line-through; color: #999; font-size: 0.8em;">$${item.originalPrice}</span>`;
            }
        }
        
        detailsHtml += `
            <li style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dotted #e0e0e0; padding-bottom: 4px;">
                <span class="item-name" style="flex: 1; padding-right: 10px;">${item.isCombo ? '🎁 ' : ''}${item.name}</span>
                <span class="item-price-detail" style="text-align: right; white-space: nowrap;">${priceHtml}</span>
            </li>
        `;
    });

    // 更新：抓取並組合所有套用的優惠名稱
    if (usedIdentity) {
        appliedPromoText = identityLabel;
    } else {
        let promoNames = new Set();
        receiptItems.forEach(i => {
            if (i.hasPromo && i.promoName) promoNames.add(i.promoName);
        });
        if (promoNames.size > 0) {
            appliedPromoText = Array.from(promoNames).join('、'); // 將多個優惠名稱用頓號連接，如「3月優惠、春季組合優惠」
        }
    }

    if (selectedItems.size === 0) {
        detailsHtml = '<li style="color: #999; padding: 5px 0;">尚未選擇任何服務</li>';
    }

    // 更新 DOM
    DOM.selectedItemsList.innerHTML = detailsHtml;
    if (DOM.originalTotal) DOM.originalTotal.textContent = originalTotal.toLocaleString();
    if (DOM.discountedTotal) DOM.discountedTotal.textContent = finalTotal.toLocaleString();

    if (appliedPromoText !== '無' && DOM.appliedPromoContainer) {
        DOM.appliedPromoContainer.style.display = 'block';
        if (DOM.appliedPromo) DOM.appliedPromo.textContent = appliedPromoText;
    } else if (DOM.appliedPromoContainer) {
        DOM.appliedPromoContainer.style.display = 'none';
    }

    // 更新：如果有節省到金額(套用優惠)，才顯示原價與節省金額；否則隱藏
    if (savings > 0) {
        if (DOM.originalTotalP) DOM.originalTotalP.style.display = 'block'; 
        if (DOM.savingsContainer) DOM.savingsContainer.style.display = 'block';
        if (DOM.savings) DOM.savings.textContent = savings.toLocaleString();
    } else {
        if (DOM.originalTotalP) DOM.originalTotalP.style.display = 'none';
        if (DOM.savingsContainer) DOM.savingsContainer.style.display = 'none';
    }

    if (points > 0 && DOM.pointsContainer) {
        DOM.pointsContainer.style.display = 'block';
        if (DOM.points) DOM.points.textContent = points.toLocaleString();
    } else if (DOM.pointsContainer) {
        DOM.pointsContainer.style.display = 'none';
    }

    // 儲存資料供「截圖」功能取用
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

function updateCheckboxes() {
    document.querySelectorAll('.service-item input[type="checkbox"]').forEach(cb => {
        cb.checked = selectedItems.has(cb.value);
    });
}

// ==========================================
// 4. 快速操作與截圖生成邏輯
// ==========================================
// (保存、讀取、分享功能保持不變)
function saveSelections() { /* ... existing code logic ... */ 
    if (selectedItems.size === 0) { showNotice('尚未選擇任何項目，無法儲存'); return; }
    localStorage.setItem('dede_saved_selections', JSON.stringify(Array.from(selectedItems)));
    showNotice('✅ 已成功儲存目前選擇！');
}
function loadSelections() { /* ... existing code logic ... */ 
    const saved = localStorage.getItem('dede_saved_selections');
    if (saved) {
        try { selectedItems = new Set(JSON.parse(saved)); updateCheckboxes(); updateTotals(); showNotice('📂 已載入上次的選擇'); } 
        catch (e) { showNotice('❌ 讀取失敗'); }
    }
}
function clearSelections() { /* ... existing code logic ... */ 
    if (selectedItems.size === 0) return;
    if (confirm('確定要清除所有已選項目嗎？')) {
        selectedItems.clear(); updateCheckboxes(); updateTotals(); showNotice('🗑️ 已清除所有選項');
        const url = new URL(window.location); url.searchParams.delete('items'); url.searchParams.delete('identity'); window.history.replaceState({}, '', url);
    }
}
function generateShareableLink() { /* ... existing code logic ... */ 
    if (selectedItems.size === 0) { showNotice('請先選擇項目後再產生分享連結'); return; }
    const url = new URL(window.location); url.searchParams.set('items', btoa(Array.from(selectedItems).join(','))); url.searchParams.set('identity', currentIdentity); 
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(url.toString()).then(() => showNotice('🔗 連結已複製！')).catch(() => copyFallback(url.toString())); } 
    else { copyFallback(url.toString()); }
}
function copyFallback(text) { /* ... existing code logic ... */ 
    const input = document.createElement('input'); input.value = text; document.body.appendChild(input); input.select();
    try { document.execCommand('copy'); showNotice('🔗 連結已複製！'); } catch (err) { showNotice('無法複製'); } document.body.removeChild(input);
}
function loadFromUrl() { /* ... existing code logic ... */ 
    const urlParams = new URLSearchParams(window.location.search);
    const identity = urlParams.get('identity'); 
    if (identity && ['general', 'birthday', 'student'].includes(identity)) {
        currentIdentity = identity;
        const radio = document.querySelector(`input[name="identity"][value="${identity}"]`);
        if (radio) radio.checked = true;
    }
    const encodedItems = urlParams.get('items');
    if (encodedItems) {
        try {
            selectedItems = new Set(atob(encodedItems).split(',').filter(id => allServices.has(id)));
            updateCheckboxes(); showNotice('已載入分享的服務項目');
        } catch (e) { showNotice('無法解析分享連結'); }
    }
}

// 新增：動態生成排版精美的截圖估價單
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

    // 建立一個隱藏的動態畫布，專門用來排版截圖內容
    const receiptDiv = document.createElement('div');
    Object.assign(receiptDiv.style, {
        position: 'absolute',
        left: '-9999px', // 藏在畫面外
        top: '0',
        width: '450px', // 固定寬度確保截圖比例完美
        backgroundColor: '#ffffff',
        padding: '25px',
        fontFamily: 'sans-serif',
        color: '#333',
        boxSizing: 'border-box'
    });

    // 標題區
    let html = `<h2 style="text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 10px; color: #0056b3; margin-top: 0;">德德美體美容中心 估價單</h2>`;

    // 1. 若為壽星或學生顯示在最上方
    if (currentReceiptData.identity !== 'general') {
         html += `<div style="background-color: #ffeeba; color: #856404; padding: 10px; border-radius: 5px; text-align: center; font-weight: bold; margin-bottom: 15px;">
             👤 客戶身分：${currentReceiptData.identityLabel}
         </div>`;
    }

    // 2. 下方顯示目前勾選服務及金額
    html += `<h3 style="margin-bottom: 10px; font-size: 1.1em; border-bottom: 1px solid #eee; padding-bottom: 5px;">目前勾選服務</h3>`;
    html += `<ul style="list-style: none; padding: 0; margin: 0 0 20px 0;">`;

    currentReceiptData.items.forEach(item => {
        let priceText = `$${item.originalPrice}`;
        if (item.hasPromo) {
            // 若為優惠服務且使用了身分折扣，加上【使用學生或壽星優惠則免】
            if (currentReceiptData.usedIdentity) {
                priceText = `<span style="color: #999; text-decoration: line-through;">$${item.originalPrice}</span> <br><span style="color: #dc3545; font-size: 0.85em;">【使用學生或壽星優惠則免】</span>`;
            } else {
                priceText = `<span style="color: #dc3545; font-weight: bold;">$${item.finalPrice}</span> <br><span style="color: #999; text-decoration: line-through; font-size: 0.85em;">$${item.originalPrice}</span>`;
            }
        }
        html += `<li style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; line-height: 1.4;">
            <span style="flex: 1; padding-right: 10px;">${item.isCombo ? '🎁 ' : ''}${item.name}</span>
            <span style="text-align: right; white-space: nowrap;">${priceText}</span>
        </li>`;
    });
    html += `</ul>`;

    // 3. 最後顯示總原價、套用優惠、節省金額、折扣後總金額及可獲得點數
    html += `<div style="border-top: 2px dashed #ccc; padding-top: 15px; text-align: right; font-size: 1em; line-height: 1.6;">`;
    
    // 更新：截圖中如果沒有優惠，就不印出總原價跟節省金額
    if (currentReceiptData.savings > 0) {
        html += `<p style="margin: 0;">總原價：$${currentReceiptData.originalTotal.toLocaleString()}</p>
        <p style="margin: 0; color: #dc3545;">套用優惠：${currentReceiptData.appliedPromoName}</p>
        <p style="margin: 0; color: #28a745;">節省金額：$${currentReceiptData.savings.toLocaleString()}</p>`;
    }
    
    html += `<p style="margin: 8px 0 0 0; font-size: 1.3em; font-weight: bold;">折扣後總金額：$${currentReceiptData.finalTotal.toLocaleString()}</p>`;
    
    if (currentReceiptData.points > 0) {
        html += `<p style="margin: 5px 0 0 0; color: #007bff; font-weight: bold;">🎁 可獲得點數：${currentReceiptData.points.toLocaleString()} 點</p>`;
    }
    html += `</div>`;

    receiptDiv.innerHTML = html;
    document.body.appendChild(receiptDiv);

    // 執行截圖動作
    html2canvas(receiptDiv, {
        scale: 2, 
        backgroundColor: '#ffffff',
        useCORS: true
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
