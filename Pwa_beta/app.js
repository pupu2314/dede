// ==========================================
// 全域變數與狀態管理
// ==========================================
let serviceData = null;
let allServices = new Map();
let selectedItems = new Set();
let currentIdentity = 'general'; 
let currentReceiptData = null; // 儲存當下所有的結帳與明細資訊，供截圖時使用
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
    
    // 【重要相容】：自動抓取身分下拉選單 (支援 id="role" 或 id="identity-select")
    DOM.identitySelect = document.getElementById('role') || document.getElementById('identity-select');
    
    DOM.originalTotal = document.getElementById('original-total');
    DOM.discountedTotal = document.getElementById('discounted-total');
    DOM.floatingDiscountedTotal = document.getElementById('floating-discounted-total');
    DOM.selectedItemsList = document.getElementById('selected-items-list');
    DOM.floatingSelectedItemsList = document.getElementById('floating-selected-items-list');
    DOM.versionSpan = document.getElementById('price-version');
    
    // 綁定事件 (加入 ?. 避免元素不存在時報錯當機)
    DOM.identitySelect?.addEventListener('change', (e) => {
        currentIdentity = e.target.value;
        renderServiceList(serviceData);
        updateTotals();
    });
    
    DOM.searchInput?.addEventListener('input', () => {
        renderServiceList(serviceData, DOM.searchInput.value.trim());
    });
    
    document.getElementById('clear-btn')?.addEventListener('click', () => {
        selectedItems.clear();
        if (DOM.searchInput) DOM.searchInput.value = '';
        currentIdentity = 'general';
        if (DOM.identitySelect) DOM.identitySelect.value = 'general';
        renderServiceList(serviceData);
        updateTotals();
        showNotice('已清除所有選項');
    });

    document.getElementById('save-btn')?.addEventListener('click', saveState);
    document.getElementById('load-btn')?.addEventListener('click', loadState);
    document.getElementById('share-link-btn')?.addEventListener('click', generateShareLink);
    document.getElementById('screenshot-btn')?.addEventListener('click', generateScreenshot);
}

async function loadServiceData() {
    try {
        const response = await fetch(`services.json?v=${new Date().getTime()}`, { cache: "no-cache" });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (!data || !data.categories) {
            throw new Error('Invalid JSON format');
        }
        localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
        return data;
    } catch (error) {
        console.warn('嘗試從網路載入 services.json 失敗，改用本地快取。', error);
        const cachedData = localStorage.getItem(DATA_CACHE_KEY);
        if (cachedData) {
            try {
                const data = JSON.parse(cachedData);
                showNotice('使用離線資料 (可能不是最新)');
                return data;
            } catch (e) {
                 console.error('解析本地快取資料失敗:', e);
            }
        }
        return null;
    }
}

function initializePage() {
    allServices.clear();
    serviceData.categories.forEach(cat => {
        cat.items.forEach(item => {
            item.isCombo = false;
            allServices.set(item.id, item);
        });
    });
    
    if (serviceData.combos) {
        serviceData.combos.forEach(combo => {
            combo.isCombo = true;
            let total = 0;
            if (combo.itemIds) {
                combo.itemIds.forEach(id => {
                    const svc = allServices.get(id);
                    if (svc) total += svc.price;
                });
            } else if (combo.price) {
                total = combo.price;
            }
            combo.price = total; // 紀錄套餐原始總價
            allServices.set(combo.id, combo);
        });
    }

    renderServiceList(serviceData);
    
    if (DOM.identitySelect) DOM.identitySelect.value = 'general';
    currentIdentity = 'general';
    
    if(serviceData.version && DOM.versionSpan) {
        DOM.versionSpan.textContent = `(v${serviceData.version})`;
    }

    processUrlParams();
    updateTotals();
}

// 【新增】：計算最終價格與折扣標籤 (負責刪除線與標記)
function getFinalPrice(item) {
    if (currentIdentity === 'student') {
        return { price: Math.round(item.price * 0.8), isPromo: true, label: '學生8折', originalPrice: item.price };
    } else if (currentIdentity === 'birthday') {
        return { price: Math.round(item.price * 0.5), isPromo: true, label: '壽星5折', originalPrice: item.price };
    }
    
    // 一般身分，檢查檔期促銷
    const activePromo = getActivePromotion(item.promotions);
    if (activePromo) {
        return { price: activePromo.price, isPromo: true, label: activePromo.label, originalPrice: item.price };
    }
    
    return { price: item.price, isPromo: false, label: '', originalPrice: item.price };
}

function getActivePromotion(promotions) {
    if (!promotions || promotions.length === 0) return null;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    for (let promo of promotions) {
        if (!promo.start || !promo.end) continue;
        if (todayStr >= promo.start && todayStr <= promo.end) {
            return promo;
        }
    }
    return null;
}

// ==========================================
// 2. UI 渲染 (清單)
// ==========================================

function renderServiceList(data, filterText = '') {
    if (!DOM.serviceList) return;
    DOM.serviceList.innerHTML = '';
    filterText = filterText.toLowerCase();

    // 渲染一般項目
    data.categories.forEach(category => {
        let hasMatch = false;
        let html = `<h3>${category.name}</h3><div class="category-grid">`;
        
        category.items.forEach(item => {
            if (filterText && !item.name.toLowerCase().includes(filterText) && !category.name.toLowerCase().includes(filterText)) {
                return;
            }
            hasMatch = true;
            
            const isSelected = selectedItems.has(item.id) ? 'selected' : '';
            const finalPriceObj = getFinalPrice(item);
            const isPromo = finalPriceObj.isPromo;
            const finalPrice = finalPriceObj.price;
            
            html += `
                <div class="service-item ${isSelected}" onclick="toggleItem('${item.id}')" id="item-${item.id}">
                    <div class="name">${item.name}</div>
                    <div class="price-info">
                        ${isPromo ? 
                          `<span class="original-price" style="text-decoration: line-through; color: #888; font-size: 0.85em; margin-right: 5px;">$${item.price.toLocaleString()}</span>` 
                          : ''}
                        <span class="price">$${finalPrice.toLocaleString()}</span>
                    </div>
                    ${isPromo ? `<div class="promo-badge">${finalPriceObj.label}</div>` : ''}
                </div>
            `;
        });
        
        html += `</div>`;
        if (hasMatch) DOM.serviceList.innerHTML += html;
    });

    // 渲染套餐
    if (data.combos && data.combos.length > 0) {
        let comboHasMatch = false;
        let comboHtml = '';
        
        data.combos.forEach(combo => {
            if(filterText && !combo.name.toLowerCase().includes(filterText)) return;
            comboHasMatch = true;
            
            const comboOriginalPrice = combo.price;
            const finalPriceObj = getFinalPrice(combo);
            const isPromo = finalPriceObj.isPromo;
            const finalPrice = finalPriceObj.price;
            
            let comboItemsNames = '';
            if (combo.itemIds) {
                 comboItemsNames = combo.itemIds.map(id => {
                     const i = allServices.get(id);
                     return i ? i.name : '';
                 }).filter(Boolean).join(' + ');
            }

            const isSelected = selectedItems.has(combo.id) ? 'selected' : '';
            
            comboHtml += `
                <div class="service-item combo ${isSelected}" onclick="toggleItem('${combo.id}')" id="item-${combo.id}">
                    <div class="name">💎 ${combo.name}</div>
                    ${comboItemsNames ? `<div style="font-size:0.8em; color:#666; margin-bottom:5px;">包含: ${comboItemsNames}</div>` : ''}
                    <div class="price-info">
                        ${isPromo && finalPrice !== comboOriginalPrice ? 
                          `<span class="original-price" style="text-decoration: line-through; color: #888; font-size: 0.85em; margin-right: 5px;">$${comboOriginalPrice.toLocaleString()}</span>` 
                          : ''}
                        <span class="price">$${finalPrice.toLocaleString()}</span>
                    </div>
                    ${isPromo ? `<div class="promo-badge">${finalPriceObj.label}</div>` : ''}
                </div>
            `;
        });
        
        if(comboHasMatch) {
            DOM.serviceList.innerHTML += `<h3>🎉 超值套餐 (與其他身分優惠不併用)</h3><div class="category-grid">${comboHtml}</div>`;
        }
    }
}

function toggleItem(itemId) {
    const el = document.getElementById(`item-${itemId}`);
    if (!el) return;
    
    if (selectedItems.has(itemId)) {
        selectedItems.delete(itemId);
        el.classList.remove('selected');
    } else {
        selectedItems.add(itemId);
        el.classList.add('selected');
    }
    
    updateTotals();
}

// ==========================================
// 3. 計算與狀態更新 (包含套餐拆解邏輯)
// ==========================================

function updateTotals() {
    let originalTotal = 0;
    let discountedTotal = 0;
    
    if (DOM.selectedItemsList) DOM.selectedItemsList.innerHTML = '';
    
    let itemsToProcess = [];
    let hasExplodedCombo = false;

    // 【核心調整】：判斷是否為壽星/學生且選了套餐，若是則拆解套餐為單品
    selectedItems.forEach(itemId => {
        const item = allServices.get(itemId);
        if (!item) return;

        if (item.isCombo && (currentIdentity === 'student' || currentIdentity === 'birthday')) {
            hasExplodedCombo = true;
            if (item.itemIds && item.itemIds.length > 0) {
                item.itemIds.forEach(subItemId => {
                    const subItem = allServices.get(subItemId);
                    if (subItem) itemsToProcess.push(subItem);
                });
            } else {
                itemsToProcess.push(item);
            }
        } else {
            itemsToProcess.push(item);
        }
    });

    currentReceiptData = {
        items: [],
        originalTotal: 0,
        discountedTotal: 0,
        identity: currentIdentity,
        hasExplodedCombo: hasExplodedCombo
    };
    
    itemsToProcess.forEach(item => {
        const finalPriceObj = getFinalPrice(item);
        const currentPrice = finalPriceObj.price;
        
        originalTotal += item.price;
        discountedTotal += currentPrice;
        
        currentReceiptData.items.push({
            name: item.name,
            originalPrice: item.price,
            currentPrice: currentPrice,
            isPromo: finalPriceObj.isPromo,
            label: finalPriceObj.label
        });
        
        let itemText = item.name;
        if (finalPriceObj.isPromo) {
            itemText += ` <span style="font-size: 0.85em; color: var(--danger-color, #dc3545);">(${finalPriceObj.label})</span>`;
        }
        
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #ccc;';
        
        // 渲染結帳明細的刪除線
        if (finalPriceObj.isPromo && currentPrice !== item.price) {
            li.innerHTML = `
                <span>${itemText}</span>
                <span>
                    <span style="text-decoration: line-through; color: #888; font-size: 0.85em; margin-right: 5px;">$${item.price.toLocaleString()}</span>
                    <span>$${currentPrice.toLocaleString()}</span>
                </span>
            `;
        } else {
            li.innerHTML = `
                <span>${itemText}</span>
                <span>$${currentPrice.toLocaleString()}</span>
            `;
        }
        if (DOM.selectedItemsList) DOM.selectedItemsList.appendChild(li);
    });

    // 顯示「無套餐優惠」的警語
    if (hasExplodedCombo && DOM.selectedItemsList) {
        const labelStr = currentIdentity === 'student' ? '學生無套餐優惠，以原價8折計算' : '壽星無套餐優惠，以原價5折計算';
        const li = document.createElement('li');
        li.style.cssText = 'padding: 5px 0; color: var(--danger-color, #dc3545); font-weight: bold; font-size: 0.9em; text-align: center;';
        li.textContent = `【${labelStr}】`;
        DOM.selectedItemsList.appendChild(li);
    }
    
    currentReceiptData.originalTotal = originalTotal;
    currentReceiptData.discountedTotal = discountedTotal;

    // 更新總計顯示
    if (DOM.originalTotal) DOM.originalTotal.textContent = originalTotal.toLocaleString();
    if (DOM.discountedTotal) DOM.discountedTotal.textContent = discountedTotal.toLocaleString();
    if (DOM.floatingDiscountedTotal) DOM.floatingDiscountedTotal.textContent = discountedTotal.toLocaleString();
    
    if (DOM.floatingSelectedItemsList && DOM.selectedItemsList) {
        const ul = DOM.floatingSelectedItemsList.querySelector('ul');
        if(ul) ul.innerHTML = DOM.selectedItemsList.innerHTML;
    }

    // 點數計算
    const pointsContainer = document.getElementById('points-container');
    const floatingPoints = document.getElementById('floating-points');
    const ratio = serviceData.pointsRatio || 10;
    
    if (pointsContainer && floatingPoints) {
        if (currentIdentity === 'general' && discountedTotal > 0 && selectedItems.size > 0) {
            const points = Math.floor(discountedTotal / ratio);
            pointsContainer.style.display = 'block';
            floatingPoints.textContent = points;
            currentReceiptData.points = points;
        } else {
             pointsContainer.style.display = 'none';
             currentReceiptData.points = 0;
        }
    }
}

// 產生截圖收據的 HTML (同步包含拆解與警語)
function generateReceiptHtml() {
    if (!currentReceiptData || currentReceiptData.items.length === 0) return '';
    
    const d = new Date();
    const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    
    let itemsHtml = currentReceiptData.items.map(item => {
        let nameHtml = item.name;
        if (item.isPromo) {
             nameHtml += ` <span style="font-size: 0.85em; color: #dc3545;">(${item.label})</span>`;
        }
        
        return `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 4px;">
                <div style="flex: 1; text-align: left; padding-right: 10px;">${nameHtml}</div>
                <div style="white-space: nowrap;">
                    ${item.isPromo && item.currentPrice !== item.originalPrice ? 
                      `<span style="text-decoration: line-through; color: #999; font-size: 0.85em; margin-right: 5px;">$${item.originalPrice.toLocaleString()}</span>` 
                      : ''}
                    <span style="font-weight: 500;">$${item.currentPrice.toLocaleString()}</span>
                </div>
            </div>
        `;
    }).join('');

    if (currentReceiptData.hasExplodedCombo) {
        const labelStr = currentReceiptData.identity === 'student' ? '學生無套餐優惠，以原價8折計算' : '壽星無套餐優惠，以原價5折計算';
        itemsHtml += `
            <div style="margin-top: 10px; color: #dc3545; font-weight: bold; font-size: 0.9em; text-align: center; border-bottom: 1px dashed #eee; padding-bottom: 8px;">
                【${labelStr}】
            </div>
        `;
    }

    const ratio = serviceData.pointsRatio || 10;
    const pointsHtml = (currentReceiptData.identity === 'general' && currentReceiptData.discountedTotal > 0) ? 
        `<div style="color: #007bff; font-weight: bold; margin-top: 10px; text-align: right;">🎁 預計可獲得點數：${Math.floor(currentReceiptData.discountedTotal / ratio)} 點</div>` : '';

    return `
        <div style="font-family: sans-serif; background: #fff; padding: 25px; width: 350px; color: #333; box-sizing: border-box;">
            <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
                <h2 style="margin: 0; color: #0056b3; font-size: 1.4em;">德德美體美容中心</h2>
                <div style="font-size: 0.9em; color: #666; margin-top: 5px;">專屬估價單</div>
                <div style="font-size: 0.8em; color: #999; margin-top: 5px;">日期: ${dateStr}</div>
            </div>
            
            <div style="margin-bottom: 15px; font-size: 0.95em;">
                ${itemsHtml}
            </div>
            
            <div style="border-top: 2px solid #333; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                    <span>原價總計</span>
                    <span>$${currentReceiptData.originalTotal.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 1.2em; font-weight: bold; color: #dc3545;">
                    <span>折扣後總金額</span>
                    <span>$${currentReceiptData.discountedTotal.toLocaleString()}</span>
                </div>
                ${pointsHtml}
            </div>
            <div style="text-align: center; font-size: 0.8em; color: #999; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
                實際收費依現場公告與狀況為主
            </div>
        </div>
    `;
}

// ==========================================
// 4. 進階功能：儲存、讀取、分享、截圖
// ==========================================

function saveState() {
    if (selectedItems.size === 0) {
        showNotice('⚠️ 目前沒有選擇任何項目喔！');
        return;
    }
    const state = {
        items: Array.from(selectedItems),
        identity: currentIdentity,
        timestamp: new Date().getTime()
    };
    localStorage.setItem('dede_saved_state', JSON.stringify(state));
    showNotice('✅ 選擇狀態已儲存！(僅限此設備)');
}

function loadState() {
    const saved = localStorage.getItem('dede_saved_state');
    if (!saved) {
        showNotice('沒有找到儲存的紀錄。');
        return;
    }
    try {
        const state = JSON.parse(saved);
        selectedItems.clear();
        state.items.forEach(id => selectedItems.add(id));
        
        currentIdentity = state.identity || 'general';
        if (DOM.identitySelect) DOM.identitySelect.value = currentIdentity;
        
        renderServiceList(serviceData);
        updateTotals();
        showNotice('📂 已載入上次的選擇');
    } catch (e) {
        showNotice('❌ 讀取失敗，資料可能已損壞。');
    }
}

function generateShareLink() {
    if (selectedItems.size === 0) {
        showNotice('⚠️ 請先選擇項目再分享');
        return;
    }
    const ids = Array.from(selectedItems).join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('items', ids);
    url.searchParams.set('role', currentIdentity);
    
    const tempInput = document.createElement('input');
    tempInput.value = url.toString();
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
        document.execCommand('copy');
        showNotice('🔗 分享網址已複製到剪貼簿！');
    } catch (err) {
        prompt('請手動複製以下網址分享：', url.toString());
    } finally {
        document.body.removeChild(tempInput);
    }
}

function processUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const itemsParam = params.get('items');
    const roleParam = params.get('role');
    
    if (itemsParam) {
        const ids = itemsParam.split(',');
        ids.forEach(id => {
            if (allServices.has(id)) selectedItems.add(id);
        });
        if (roleParam && ['general', 'student', 'birthday'].includes(roleParam)) {
            currentIdentity = roleParam;
            if (DOM.identitySelect) DOM.identitySelect.value = currentIdentity;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        showNotice('📥 已載入分享的選擇清單');
        renderServiceList(serviceData);
    }
}

function generateScreenshot() {
    if (selectedItems.size === 0) {
        showNotice('⚠️ 請先選擇至少一個項目再截圖！');
        return;
    }

    if (typeof html2canvas === 'undefined') {
        showNotice('❌ 截圖工具尚未載入完成，請稍後再試。');
        return;
    }

    const btn = document.getElementById('screenshot-btn');
    const originalText = btn ? btn.textContent : '截圖';
    if (btn) {
        btn.textContent = '處理中...';
        btn.disabled = true;
    }

    const receiptDiv = document.createElement('div');
    receiptDiv.style.position = 'absolute';
    receiptDiv.style.left = '-9999px';
    receiptDiv.style.top = '0';
    receiptDiv.innerHTML = generateReceiptHtml();
    document.body.appendChild(receiptDiv);

    setTimeout(() => {
        html2canvas(receiptDiv, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `德德估價單_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showNotice('📷 專屬估價單截圖已下載！');
        }).catch(err => {
            console.error('截圖失敗:', err);
            showNotice('❌ 截圖發生錯誤');
        }).finally(() => {
            document.body.removeChild(receiptDiv);
            if (btn) {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }, 100);
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
    setTimeout(() => { if (document.getElementById('sw-notice')) noticeDiv.remove(); }, 3500);
}
