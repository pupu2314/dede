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
    DOM.originalTotal = document.getElementById('original-total');
    DOM.discountedTotal = document.getElementById('discounted-total');
    DOM.floatingDiscountedTotal = document.getElementById('floating-discounted-total');
    DOM.floatingPoints = document.getElementById('floating-points');
    DOM.pointsContainer = document.getElementById('points-container');
    DOM.priceVersion = document.getElementById('price-version');
}

async function loadServiceData() {
    try {
        const response = await fetch('services.json');
        if (!response.ok) throw new Error('網路回應錯誤');
        const data = await response.json();
        // 存入快取供離線使用 (PWA支援)
        localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
        return data;
    } catch (error) {
        console.warn('從網路載入失敗，嘗試使用快取...', error);
        const cached = localStorage.getItem(DATA_CACHE_KEY);
        if (cached) {
            showNotice('目前處於離線狀態，使用先前快取的資料。');
            return JSON.parse(cached);
        }
        return null;
    }
}

// ==========================================
// 2. 頁面初始化與事件綁定
// ==========================================
function initializePage() {
    // 顯示版本號
    if (serviceData.version && DOM.priceVersion) {
        DOM.priceVersion.textContent = `(版本: ${serviceData.version})`;
    }

    // 建立所有服務的 Map 方便快速查找
    serviceData.categories.forEach(category => {
        category.items.forEach(item => {
            allServices.set(item.id, item);
        });
    });

    // 渲染分類列表
    renderAllCategories();

    // 綁定身分切換事件
    document.querySelectorAll('input[name="identity"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentIdentity = e.target.value;
            updatePricesUI(); // 【新功能 1】切換身分時，即時更新列表上的金額顯示
            updateTotals();
        });
    });

    // 綁定搜尋事件 (加入防抖 Debounce)
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', debounce((e) => {
            const keyword = e.target.value.toLowerCase().trim();
            handleSearch(keyword);
        }, 300));
    }

    // 綁定快速操作按鈕
    document.getElementById('save-btn')?.addEventListener('click', saveSelection);
    document.getElementById('load-btn')?.addEventListener('click', loadSelectionLocal);
    document.getElementById('clear-btn')?.addEventListener('click', clearSelection);
    document.getElementById('share-link-btn')?.addEventListener('click', generateShareLink);
    document.getElementById('screenshot-btn')?.addEventListener('click', generateScreenshot);

    // 檢查是否有網址分享參數
    loadFromUrl();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==========================================
// 3. UI 渲染邏輯
// ==========================================
function renderAllCategories() {
    if (!DOM.serviceList) return;
    DOM.serviceList.innerHTML = '';
    
    serviceData.categories.forEach(category => {
        const details = document.createElement('details');
        details.className = 'category-details';
        details.open = true; // 預設展開

        const summary = document.createElement('summary');
        summary.innerHTML = `<h3 style="display:inline; margin:0;">${category.name}</h3>`;
        
        const itemList = document.createElement('div');
        itemList.className = 'item-list';
        itemList.style.marginTop = '10px';
        
        renderServiceList(category.items, itemList);
        
        details.appendChild(summary);
        details.appendChild(itemList);
        DOM.serviceList.appendChild(details);
    });
}

function handleSearch(keyword) {
    if (!keyword) {
        renderAllCategories();
        return;
    }

    DOM.serviceList.innerHTML = '';
    const resultsContainer = document.createElement('div');
    
    let matchedItems = [];
    serviceData.categories.forEach(cat => {
        cat.items.forEach(item => {
            if (item.name.toLowerCase().includes(keyword) || 
                (item.description && item.description.toLowerCase().includes(keyword))) {
                matchedItems.push(item);
            }
        });
    });

    if (matchedItems.length > 0) {
        renderServiceList(matchedItems, resultsContainer);
        DOM.serviceList.appendChild(resultsContainer);
    } else {
        DOM.serviceList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">找不到符合的項目</p>';
    }
}

function renderServiceList(items, container) {
    container.innerHTML = '';
    items.forEach(item => {
        const label = document.createElement('label');
        label.className = 'service-item-label';
        label.style.display = 'block';
        label.style.padding = '12px';
        label.style.marginBottom = '8px';
        label.style.border = '1px solid var(--border-color)';
        label.style.borderRadius = '8px';
        label.style.cursor = 'pointer';
        label.style.transition = 'all 0.2s';

        const isChecked = selectedItems.has(item.id) ? 'checked' : '';
        if (isChecked) {
            label.style.backgroundColor = '#e7f1ff';
            label.style.borderColor = 'var(--primary-color)';
        }

        const descHtml = item.description ? `<div style="font-size: 0.85em; color: var(--text-muted); margin-top: 5px; margin-left: 28px;">${item.description}</div>` : '';

        // 【新功能 1 預備】 加入 class="price-display" 讓 updatePricesUI 可以精準替換價格
        label.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%;">
                <input type="checkbox" value="${item.id}" ${isChecked} style="margin-right: 12px; transform: scale(1.3);">
                <div style="flex-grow: 1; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; font-size: 1.05em;">${item.name}</span>
                    <span class="price-display"></span>
                </div>
            </div>
            ${descHtml}
        `;

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            toggleSelection(item.id, e.target.checked);
            if (e.target.checked) {
                label.style.backgroundColor = '#e7f1ff';
                label.style.borderColor = 'var(--primary-color)';
            } else {
                label.style.backgroundColor = 'transparent';
                label.style.borderColor = 'var(--border-color)';
            }
        });

        container.appendChild(label);
    });

    // 列表渲染完畢後，執行一次價格UI更新
    updatePricesUI();
}

// 【新功能 1】動態更新列表上的價格顯示 (原價刪除線 + 左方折後價)
function updatePricesUI() {
    document.querySelectorAll('.service-item-label').forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        
        const itemId = checkbox.value;
        const item = allServices.get(itemId);
        if (!item) return;

        const priceSpan = label.querySelector('.price-display');
        if (!priceSpan) return;

        // 當身分為學生或壽星時
        if (currentIdentity === 'student' || currentIdentity === 'birthday') {
            if (item.type === 'combo') {
                // 套餐顯示為紅字提示拆解
                priceSpan.innerHTML = `<span style="text-decoration: line-through; color: #999; margin-right: 6px; font-size: 0.9em;">$${item.price}</span><span style="color: var(--danger-color); font-weight: bold; font-size: 0.9em;">(採單品計價)</span>`;
            } else if (item.price > 0) {
                // 單品顯示刪除線與折後價
                let discountRate = currentIdentity === 'student' ? 0.8 : 0.75;
                let newPrice = Math.round(item.price * discountRate);
                priceSpan.innerHTML = `<span style="text-decoration: line-through; color: #999; margin-right: 6px; font-size: 0.9em;">$${item.price}</span><span style="color: var(--danger-color); font-weight: bold;">$${newPrice}</span>`;
            } else {
                priceSpan.textContent = '免費';
            }
        } else {
            // 一般身分恢復原狀
            priceSpan.innerHTML = item.price > 0 ? `<span style="font-weight: bold;">$${item.price}</span>` : '免費';
        }
    });
}

// ==========================================
// 4. 核心計價邏輯
// ==========================================
function toggleSelection(itemId, isChecked) {
    if (isChecked) {
        selectedItems.add(itemId);
    } else {
        selectedItems.delete(itemId);
    }
    updateTotals();
}

function updateTotals() {
    let originalTotal = 0;
    let finalTotal = 0;
    let points = 0;
    let receiptDetails = [];
    
    // 【新功能 2 核心】套餐拆解狀態追蹤
    let processingItems = new Map(); 
    let isComboBroken = false;
    let appliedDiscountName = '';

    // 第一階段：決定要參與計算的項目 (執行套餐拆解)
    selectedItems.forEach(itemId => {
        const item = allServices.get(itemId);
        if (!item) return;

        // 如果是學生或壽星，且選到了套餐，則自動拆解為單品
        if ((currentIdentity === 'student' || currentIdentity === 'birthday') && item.type === 'combo') {
            isComboBroken = true;
            if (item.items && Array.isArray(item.items)) {
                item.items.forEach(subId => {
                    if (!processingItems.has(subId)) {
                        // 紀錄該單品是來自哪個套餐，供明細顯示
                        processingItems.set(subId, { item: allServices.get(subId), fromCombo: item.name });
                    }
                });
            }
        } else {
            // 一般情況或一般單品，直接加入計算
            if (!processingItems.has(itemId)) {
                processingItems.set(itemId, { item: item, fromCombo: null });
            }
        }
    });

    // 第二階段：根據 processingItems 計算總額
    processingItems.forEach((meta, id) => {
        const item = meta.item;
        if (!item) return;

        originalTotal += item.price;
        let itemFinalPrice = item.price;
        let itemNameDisplay = item.name;

        // 如果是被拆解出來的單品，在名稱後方加上標示
        if (meta.fromCombo) {
            itemNameDisplay += ` <span style="font-size:0.8em; color:#888;">(拆自 ${meta.fromCombo})</span>`;
        }

        // 身分折扣計算
        if (currentIdentity === 'student') {
            itemFinalPrice = Math.round(item.price * 0.8);
            appliedDiscountName = '學生專案 8 折';
        } else if (currentIdentity === 'birthday') {
            itemFinalPrice = Math.round(item.price * 0.75);
            appliedDiscountName = '當月壽星 75 折';
        }

        finalTotal += itemFinalPrice;
        points += (item.points || 0);

        receiptDetails.push({
            id: id,
            name: itemNameDisplay,
            originalPrice: item.price,
            finalPrice: itemFinalPrice
        });
    });

    // 更新畫面總計
    if (DOM.originalTotal) DOM.originalTotal.textContent = originalTotal;
    if (DOM.discountedTotal) DOM.discountedTotal.textContent = finalTotal;
    if (DOM.floatingDiscountedTotal) DOM.floatingDiscountedTotal.textContent = finalTotal;
    if (DOM.floatingPoints) DOM.floatingPoints.textContent = points;
    
    if (DOM.pointsContainer) {
        DOM.pointsContainer.style.display = points > 0 ? 'block' : 'none';
    }

    // 更新浮動購物車明細與紅字備註
    updateFloatingCart(receiptDetails, isComboBroken);

    // 儲存當前狀態供截圖使用
    currentReceiptData = {
        originalTotal,
        finalTotal,
        points,
        details: receiptDetails,
        isComboBroken,
        discountName: appliedDiscountName
    };
}

function updateFloatingCart(receiptDetails, isComboBroken) {
    const listContainer = document.querySelector('#floating-selected-items-list ul');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    if (receiptDetails.length === 0) {
        listContainer.innerHTML = '<li style="color: var(--text-muted); text-align: center; padding: 10px 0;">尚未選擇任何項目</li>';
        return;
    }

    receiptDetails.forEach(detail => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.marginBottom = '6px';
        li.style.borderBottom = '1px dashed var(--border-color)';
        li.style.paddingBottom = '4px';
        
        let priceHtml = '';
        if (detail.originalPrice !== detail.finalPrice) {
            priceHtml = `<span style="color: var(--danger-color); font-weight: bold;">$${detail.finalPrice}</span>`;
        } else {
            priceHtml = `<span>$${detail.finalPrice}</span>`;
        }

        li.innerHTML = `<span>${detail.name}</span>${priceHtml}`;
        listContainer.appendChild(li);
    });

    // 【新功能 2】如果觸發了套餐拆解，在明細最下方加上紅字備註
    if (isComboBroken) {
        const noteLi = document.createElement('li');
        noteLi.style.marginTop = '12px';
        noteLi.style.color = 'var(--danger-color, #dc3545)';
        noteLi.style.fontSize = '0.9em';
        noteLi.style.fontWeight = 'bold';
        noteLi.style.lineHeight = '1.4';
        noteLi.innerHTML = '⚠️ 備註：學生 / 壽星優惠不適用於套餐，已為您自動拆解為單品計算，以確保您享有最優惠的價格。';
        listContainer.appendChild(noteLi);
    }
}

// ==========================================
// 5. 快速操作 (儲存、讀取、分享、截圖)
// ==========================================
function saveSelection() {
    if (selectedItems.size === 0) {
        showNotice('目前沒有選擇任何項目喔！');
        return;
    }
    const dataToSave = {
        items: Array.from(selectedItems),
        identity: currentIdentity
    };
    localStorage.setItem('dede_saved_selection', JSON.stringify(dataToSave));
    showNotice('💾 選擇已儲存！下次進來可點擊「讀取」恢復。');
}

function loadSelectionLocal() {
    const saved = localStorage.getItem('dede_saved_selection');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            applySelectionData(data.items, data.identity);
            showNotice('📂 已成功讀取上次的選擇！');
        } catch (e) {
            showNotice('❌ 讀取失敗，資料可能已損毀。');
        }
    } else {
        showNotice('沒有找到儲存的紀錄。');
    }
}

function clearSelection() {
    selectedItems.clear();
    document.querySelectorAll('.service-item-label input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        const label = cb.closest('label');
        if(label) {
            label.style.backgroundColor = 'transparent';
            label.style.borderColor = 'var(--border-color)';
        }
    });
    
    // 將身分切換回一般
    currentIdentity = 'general';
    const generalRadio = document.querySelector('input[name="identity"][value="general"]');
    if(generalRadio) generalRadio.checked = true;
    
    updatePricesUI();
    updateTotals();
    showNotice('🗑️ 所有選項已清除');
}

function generateShareLink() {
    if (selectedItems.size === 0) {
        showNotice('請先選擇項目才能分享喔！');
        return;
    }
    const ids = Array.from(selectedItems).join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('items', ids);
    url.searchParams.set('identity', currentIdentity);

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url.href).then(() => {
            showNotice('🔗 分享網址已複製到剪貼簿！');
        }).catch(() => fallbackCopyTextToClipboard(url.href));
    } else {
        fallbackCopyTextToClipboard(url.href);
    }
}

function fallbackCopyTextToClipboard(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand('copy');
        showNotice('🔗 分享網址已複製到剪貼簿！');
    } catch (err) {
        showNotice('❌ 複製失敗，請手動複製網址');
    }
    document.body.removeChild(input);
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const items = params.get('items');
    const identity = params.get('identity');

    if (items || identity) {
        applySelectionData(items ? items.split(',') : [], identity || 'general');
        showNotice('📥 已載入網址分享的內容！');
        // 清除網址參數保持乾淨
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function applySelectionData(itemsArray, identityValue) {
    currentIdentity = identityValue;
    const radio = document.querySelector(`input[name="identity"][value="${identityValue}"]`);
    if (radio) radio.checked = true;

    selectedItems.clear();
    itemsArray.forEach(id => {
        if (allServices.has(id)) {
            selectedItems.add(id);
            const checkbox = document.querySelector(`input[value="${id}"]`);
            if (checkbox) {
                checkbox.checked = true;
                const label = checkbox.closest('label');
                if(label) {
                    label.style.backgroundColor = '#e7f1ff';
                    label.style.borderColor = 'var(--primary-color)';
                }
            }
        }
    });
    updatePricesUI();
    updateTotals();
}

function generateScreenshot() {
    const captureArea = document.getElementById('capture-area');
    if (!captureArea || typeof html2canvas === 'undefined') {
        showNotice('載入截圖套件中或不支援此功能');
        return;
    }

    const btn = document.getElementById('screenshot-btn');
    const originalText = btn.textContent;
    btn.textContent = '產生中...';
    btn.disabled = true;

    // 截圖前隱藏不必要的元素 (操作按鈕、浮動列)
    const actions = document.querySelector('.header-actions');
    const floatingBar = document.querySelector('.floating-total-bar');
    if (actions) actions.style.display = 'none';
    if (floatingBar) floatingBar.style.display = 'none';

    // 如果明細是摺疊的，截圖前暫時展開它
    const detailsTag = document.querySelector('.details-content');
    const wasOpen = detailsTag ? detailsTag.open : false;
    if (detailsTag) detailsTag.open = true;

    html2canvas(captureArea, {
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        backgroundColor: '#f4f4f9'
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
        // 恢復元素顯示狀態
        if (actions) actions.style.display = 'flex';
        if (floatingBar) floatingBar.style.display = 'block';
        if (detailsTag) detailsTag.open = wasOpen;
        btn.textContent = originalText;
        btn.disabled = false;
    });
}

// ==========================================
// 6. UI 通知系統
// ==========================================
function showNotice(msg) {
    let toast = document.getElementById('toast-notification');
    if (toast) {
        toast.textContent = msg; 
        toast.style.opacity = '1'; 
        toast.style.transform = 'translate(-50%, -20px)';
        if(toast.timeoutId) clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => { 
            toast.style.opacity = '0'; 
            toast.style.transform = 'translate(-50%, 0)'; 
        }, 3000);
        return;
    }
    
    // Fallback notice
    let noticeDiv = document.getElementById('sw-notice');
    if (noticeDiv) noticeDiv.remove();
    noticeDiv = document.createElement('div'); 
    noticeDiv.id = 'sw-notice'; 
    noticeDiv.className = 'sw-notice slide-up-animation';
    noticeDiv.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()" style="margin-left: 10px; background: none; border: 1px solid white; color: white; padding: 2px 8px; border-radius: 4px; cursor: pointer;">關閉</button>`;
    document.body.appendChild(noticeDiv);
    setTimeout(() => { 
        if (document.getElementById('sw-notice')) document.getElementById('sw-notice').remove(); 
    }, 4000);
}
