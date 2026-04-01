// ==========================================
// 全域變數與狀態管理
// ==========================================
let serviceData = null;
let allServices = new Map();
let selectedItems = new Set();
let currentIdentity = 'general'; 
let currentReceiptData = null; 
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
    if (!DOM.serviceList) {
        // 如果 HTML 沒有這個容器，我們動態建立一個以避免報錯
        DOM.serviceList = document.createElement('div');
        DOM.serviceList.id = 'service-list';
        document.querySelector('main').insertBefore(DOM.serviceList, document.querySelector('fieldset'));
    }
    DOM.searchInput = document.getElementById('search-input');
    DOM.loadingIndicator = document.getElementById('loading-indicator');
    DOM.originalTotalP = document.getElementById('original-total-p');
    DOM.floatingOriginalTotal = document.getElementById('floating-original-total');
    DOM.floatingDiscountedTotal = document.getElementById('floating-discounted-total');
    DOM.floatingPoints = document.getElementById('floating-points');
    DOM.pointsContainer = document.getElementById('points-container');
    DOM.floatingSelectedItemsListUl = document.querySelector('#floating-selected-items-list ul');
}

async function loadServiceData() {
    try {
        const response = await fetch('services.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

function initializePage() {
    // 建立所有服務的 Map，方便快速查詢
    if (serviceData.categories) {
        serviceData.categories.forEach(category => {
            category.items.forEach(item => {
                allServices.set(item.id, item);
            });
        });
    }

    setupEventListeners();
    readUrlParams(); // 讀取分享的參數
    renderAllServices();
    updateSummary();
}

// ==========================================
// 2. 核心計算邏輯
// ==========================================
function getActivePromotion(item) {
    if (!item.promotions || item.promotions.length === 0) return null;
    const now = new Date();
    // 尋找當下符合時間區間的促銷
    const active = item.promotions.find(promo => {
        if (!promo.start || !promo.end) return false;
        const start = new Date(promo.start);
        const end = new Date(promo.end);
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
    });
    return active || null;
}

function findBestCombos(selectedItemObjects, combos) {
    if (!combos || combos.length === 0) return { matchedCombos: [], uncombinedItems: selectedItemObjects };
    
    let remainingItems = [...selectedItemObjects];
    let matchedCombos = [];

    // 優先配對需要項目較多的組合
    let sortedCombos = [...combos].sort((a, b) => b.itemIds.length - a.itemIds.length);

    for (let combo of sortedCombos) {
        let canForm = true;
        for (let reqId of combo.itemIds) {
            if (!remainingItems.some(item => item.id === reqId)) {
                canForm = false;
                break;
            }
        }

        if (canForm) {
            let comboItems = [];
            for (let reqId of combo.itemIds) {
                const idx = remainingItems.findIndex(item => item.id === reqId);
                comboItems.push(remainingItems[idx]);
                remainingItems.splice(idx, 1);
            }
            matchedCombos.push({
                combo: combo,
                items: comboItems
            });
        }
    }

    return { matchedCombos, uncombinedItems: remainingItems };
}

// ==========================================
// 3. UI 渲染與更新
// ==========================================
function renderAllServices(filterText = '') {
    DOM.serviceList.innerHTML = '';
    
    // 渲染組合套餐 (如果有)
    if (serviceData.combos && serviceData.combos.length > 0) {
        const comboSection = document.createElement('div');
        comboSection.innerHTML = `<h3 style="margin-bottom: 10px; color: var(--primary-color);">✨ 本月超值套餐</h3>`;
        const comboContainer = document.createElement('div');
        comboContainer.style.display = 'grid';
        comboContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
        comboContainer.style.gap = '10px';
        comboContainer.style.marginBottom = '20px';

        serviceData.combos.forEach(combo => {
            if (filterText && !combo.name.includes(filterText)) return;
            
            const div = document.createElement('div');
            // 檢查是否該套餐的所有項目都被選中了
            const isAllSelected = combo.itemIds.every(id => selectedItems.has(id));
            div.className = `service-item ${isAllSelected ? 'selected' : ''}`;
            div.style.padding = '15px';
            div.style.border = '1px solid var(--border-color)';
            div.style.borderRadius = '8px';
            div.style.cursor = 'pointer';
            div.style.backgroundColor = isAllSelected ? '#e7f1ff' : '#fff';
            
            const activePromo = getActivePromotion(combo);
            const price = activePromo ? activePromo.price : (combo.price || 0);

            div.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">${combo.name}</div>
                <div style="font-size: 0.85em; color: var(--text-muted); margin-bottom: 5px;">包含: ${combo.itemIds.map(id => allServices.get(id)?.name || id).join(', ')}</div>
                <div style="color: var(--danger-color); font-weight: bold;">${price > 0 ? price + ' 元' : '查看詳情'}</div>
            `;
            
            div.onclick = () => {
                if (isAllSelected) {
                    combo.itemIds.forEach(id => selectedItems.delete(id));
                } else {
                    combo.itemIds.forEach(id => selectedItems.add(id));
                }
                updateSummary();
                renderAllServices(filterText); // 重新渲染以更新選取狀態
            };
            comboContainer.appendChild(div);
        });
        
        if(comboContainer.children.length > 0) {
            comboSection.appendChild(comboContainer);
            DOM.serviceList.appendChild(comboSection);
        }
    }

    // 渲染一般分類
    serviceData.categories.forEach(category => {
        const filteredItems = category.items.filter(item => item.name.includes(filterText));
        if (filteredItems.length === 0) return;

        const categoryDiv = document.createElement('div');
        categoryDiv.innerHTML = `<h3 style="margin-top: 15px; margin-bottom: 10px; border-bottom: 2px solid var(--border-color); padding-bottom: 5px;">${category.name}</h3>`;
        
        const itemsContainer = document.createElement('div');
        itemsContainer.style.display = 'grid';
        itemsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
        itemsContainer.style.gap = '10px';

        filteredItems.forEach(item => {
            const div = document.createElement('div');
            const isSelected = selectedItems.has(item.id);
            div.className = `service-item ${isSelected ? 'selected' : ''}`;
            div.style.padding = '15px';
            div.style.border = '1px solid var(--border-color)';
            div.style.borderRadius = '8px';
            div.style.cursor = 'pointer';
            div.style.backgroundColor = isSelected ? '#e7f1ff' : '#fff';

            // --- 價格顯示邏輯 (包含需求1) ---
            let currentPrice = item.price;
            let hasDiscount = false;
            let promoBadge = '';

            if (currentIdentity === 'birthday') {
                currentPrice = Math.round(item.price * 0.5);
                hasDiscount = true;
            } else if (currentIdentity === 'student') {
                currentPrice = Math.round(item.price * 0.7);
                hasDiscount = true;
            } else {
                const activePromo = getActivePromotion(item);
                if (activePromo) {
                    currentPrice = activePromo.price;
                    hasDiscount = true;
                    promoBadge = `<span style="background: var(--danger-color); color: #fff; font-size: 0.7em; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">${activePromo.label}</span>`;
                }
            }

            let priceDisplayHtml = `${currentPrice} 元`;
            // 需求 1：壽星與學生價格會將原價已刪除線標示，並於左方顯示優惠後價格。
            if (hasDiscount && currentPrice !== item.price) {
                priceDisplayHtml = `<span style="color: var(--danger-color); font-weight: bold; font-size: 1.1em;">${currentPrice}</span> 元 <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85em; margin-left: 5px;">${item.price}</span>`;
            }

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: bold;">${item.name} ${promoBadge}</div>
                </div>
                <div style="margin-top: 5px;">${priceDisplayHtml}</div>
            `;

            div.onclick = () => {
                if (selectedItems.has(item.id)) {
                    selectedItems.delete(item.id);
                } else {
                    selectedItems.add(item.id);
                }
                updateSummary();
                renderAllServices(filterText);
            };
            itemsContainer.appendChild(div);
        });

        categoryDiv.appendChild(itemsContainer);
        DOM.serviceList.appendChild(categoryDiv);
    });
}

function updateSummary() {
    let totalOriginal = 0;
    let totalDiscounted = 0;
    let totalPoints = 0;
    let detailsHTML = '';

    const selectedItemObjects = Array.from(selectedItems).map(id => allServices.get(id)).filter(Boolean);
    const comboResult = findBestCombos(selectedItemObjects, serviceData.combos || []);

    let activeCombos = [];
    let singleItems = [];

    // --- 需求 2：壽星與學生若勾選本月超值套餐，則不將項目合併顯示 ---
    if (currentIdentity === 'birthday' || currentIdentity === 'student') {
        activeCombos = []; 
        singleItems = [...selectedItemObjects];

        // 找出原本會組成套餐的項目，為了後續標示提示語
        const itemsInCombos = new Set();
        comboResult.matchedCombos.forEach(c => c.items.forEach(i => itemsInCombos.add(i.id)));
        
        singleItems.forEach(item => {
            item.wasInCombo = itemsInCombos.has(item.id);
        });
    } else {
        activeCombos = comboResult.matchedCombos;
        singleItems = comboResult.uncombinedItems;
        singleItems.forEach(item => item.wasInCombo = false);
    }

    // 處理合併的 Combo (只有一般身份會有)
    activeCombos.forEach(comboObj => {
        const combo = comboObj.combo;
        const activePromo = getActivePromotion(combo);
        
        const originalTotal = comboObj.items.reduce((sum, i) => sum + i.price, 0);
        let comboPrice = originalTotal;
        if (activePromo) {
            comboPrice = activePromo.price;
        } else if (combo.price !== undefined) {
            comboPrice = combo.price;
        }

        totalOriginal += originalTotal;
        totalDiscounted += comboPrice;
        totalPoints += Math.floor(comboPrice / 100);

        detailsHTML += `
            <li style="padding: 8px 0; border-bottom: 1px dashed #eee;">
                <div style="font-weight:bold; color:var(--primary-color);">【套餐組合】${combo.name}</div>
                <div style="display:flex; justify-content:space-between; margin-top:3px;">
                    <span style="font-size:0.85em; color:var(--text-muted);">包含: ${comboObj.items.map(i=>i.name).join(', ')}</span>
                    <span>
                        <span style="color:var(--danger-color); font-weight:bold;">${comboPrice}</span> 元
                        ${originalTotal !== comboPrice ? `<span style="text-decoration:line-through; font-size:0.8em; color:var(--text-muted); margin-left:4px;">${originalTotal}</span>` : ''}
                    </span>
                </div>
            </li>
        `;
    });

    // 處理獨立項目 (包含被拆解的項目)
    singleItems.forEach(item => {
        let basePrice = item.price;
        let finalPrice = basePrice;
        let identityDiscountLabel = '';

        if (currentIdentity === 'birthday') {
            finalPrice = Math.round(basePrice * 0.5);
            identityDiscountLabel = '<span style="color: #17a2b8; font-size: 0.85em; margin-left: 5px;">(壽星5折)</span>';
        } else if (currentIdentity === 'student') {
            finalPrice = Math.round(basePrice * 0.7);
            identityDiscountLabel = '<span style="color: #28a745; font-size: 0.85em; margin-left: 5px;">(學生7折)</span>';
        } else {
            const activePromo = getActivePromotion(item);
            if (activePromo) {
                finalPrice = activePromo.price;
                identityDiscountLabel = `<span style="color: var(--danger-color); font-size: 0.85em; margin-left: 5px;">(${activePromo.label})</span>`;
            }
        }

        totalOriginal += basePrice;
        totalDiscounted += finalPrice;
        totalPoints += Math.floor(finalPrice / 100);

        // 需求 1: 左方顯示優惠後價格，原價已刪除線標示
        let priceHtml = `${finalPrice} 元`;
        if (basePrice !== finalPrice) {
            priceHtml = `<span style="color:var(--danger-color); font-weight:bold;">${finalPrice}</span> 元 <span style="text-decoration:line-through; font-size:0.85em; color:var(--text-muted); margin-left:5px;">${basePrice}</span> 元`;
        }

        // 需求 2: 壽星與學生若勾選本月超值套餐，於下方顯示無套餐優惠提示
        let noticeHtml = '';
        if ((currentIdentity === 'birthday' || currentIdentity === 'student') && item.wasInCombo) {
            let discountStr = currentIdentity === 'birthday' ? '5' : '7';
            noticeHtml = `<div style="font-size: 0.85em; color: var(--danger-color); margin-top: 4px; font-weight: 500;">【${item.name}無套餐優惠，以原價${discountStr}折計算】</div>`;
        }

        detailsHTML += `
            <li style="padding: 8px 0; border-bottom: 1px dashed #eee;">
                <div style="display:flex; justify-content:space-between; align-items: flex-start;">
                    <span style="flex: 1;">${item.name} ${identityDiscountLabel}</span>
                    <span style="white-space: nowrap; margin-left: 10px;">${priceHtml}</span>
                </div>
                ${noticeHtml}
            </li>
        `;
    });

    // 儲存資料供截圖使用
    currentReceiptData = {
        totalOriginal, totalDiscounted, totalPoints, activeCombos, singleItems
    };

    // 更新 DOM
    if (DOM.floatingOriginalTotal) DOM.floatingOriginalTotal.textContent = totalOriginal;
    if (DOM.floatingDiscountedTotal) DOM.floatingDiscountedTotal.textContent = totalDiscounted;
    if (DOM.floatingPoints) DOM.floatingPoints.textContent = totalPoints;
    
    if (DOM.floatingSelectedItemsListUl) {
        DOM.floatingSelectedItemsListUl.innerHTML = detailsHTML || '<li style="color:var(--text-muted); text-align:center; padding: 10px;">尚未選擇任何項目</li>';
    }

    if (DOM.originalTotalP) {
        DOM.originalTotalP.style.display = (totalOriginal !== totalDiscounted) ? 'block' : 'none';
    }
    if (DOM.pointsContainer) {
        DOM.pointsContainer.style.display = totalPoints > 0 ? 'block' : 'none';
    }
}

// ==========================================
// 4. 事件監聽與功能操作
// ==========================================
function setupEventListeners() {
    // 搜尋功能
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => {
            renderAllServices(e.target.value.trim());
        });
    }

    // 身份切換 (檢查網頁上是否有 name="identity" 的 radio)
    const identityRadios = document.querySelectorAll('input[name="identity"]');
    identityRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentIdentity = e.target.value;
            updateSummary();
            renderAllServices(DOM.searchInput ? DOM.searchInput.value.trim() : '');
        });
    });

    // 按鈕功能
    const btnSave = document.getElementById('save-btn');
    if (btnSave) btnSave.addEventListener('click', saveSelection);

    const btnLoad = document.getElementById('load-btn');
    if (btnLoad) btnLoad.addEventListener('click', loadSelection);

    const btnClear = document.getElementById('clear-btn');
    if (btnClear) btnClear.addEventListener('click', () => {
        selectedItems.clear();
        updateSummary();
        renderAllServices();
        showNotice('🗑️ 已清除所有選項');
    });

    const btnShare = document.getElementById('share-link-btn');
    if (btnShare) btnShare.addEventListener('click', generateShareLink);

    const btnScreenshot = document.getElementById('screenshot-btn');
    if (btnScreenshot) btnScreenshot.addEventListener('click', generateReceiptImage);
}

function saveSelection() {
    if (selectedItems.size === 0) {
        showNotice('沒有選擇任何項目可以儲存喔！');
        return;
    }
    const data = {
        items: Array.from(selectedItems),
        identity: currentIdentity
    };
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
    showNotice('💾 選擇已儲存！');
}

function loadSelection() {
    const saved = localStorage.getItem(DATA_CACHE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            selectedItems = new Set(data.items || []);
            if (data.identity) {
                currentIdentity = data.identity;
                const radio = document.querySelector(`input[name="identity"][value="${currentIdentity}"]`);
                if (radio) radio.checked = true;
            }
            updateSummary();
            renderAllServices();
            showNotice('📂 已載入上次的選擇');
        } catch (e) {
            console.error('讀取失敗', e);
            showNotice('❌ 讀取失敗，資料可能已損壞');
        }
    } else {
        showNotice('沒有找到儲存的紀錄。');
    }
}

function generateShareLink() {
    if (selectedItems.size === 0) {
        showNotice('請先選擇服務項目再分享喔！');
        return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('items', Array.from(selectedItems).join(','));
    url.searchParams.set('id', currentIdentity);
    
    // 使用新版 Clipboard API 或 fallback
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url.toString()).then(() => {
            showNotice('🔗 分享網址已複製到剪貼簿！');
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = url.toString();
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotice('🔗 分享網址已複製到剪貼簿！');
        } catch (err) {
            showNotice('❌ 複製失敗，請手動複製網址');
        }
        document.body.removeChild(textArea);
    }
}

function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const itemsParam = params.get('items');
    const idParam = params.get('id');

    if (itemsParam) {
        const items = itemsParam.split(',');
        items.forEach(id => {
            if (allServices.has(id)) selectedItems.add(id);
        });
    }
    if (idParam) {
        currentIdentity = idParam;
        const radio = document.querySelector(`input[name="identity"][value="${currentIdentity}"]`);
        if (radio) radio.checked = true;
    }
}

// ==========================================
// 5. 截圖功能 (報價單產生)
// ==========================================
function generateReceiptImage() {
    if (!currentReceiptData || selectedItems.size === 0) {
        showNotice('請先選擇服務項目喔！');
        return;
    }

    const btn = document.getElementById('screenshot-btn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ 產生中...';
    btn.disabled = true;

    // 建立一個暫時的 div 來繪製報價單
    const receiptDiv = document.createElement('div');
    receiptDiv.style.cssText = `
        position: absolute; left: -9999px; top: 0;
        width: 400px; padding: 30px; background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #333; border: 2px solid #007bff; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    `;

    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
    
    let identityText = '一般會員';
    if (currentIdentity === 'birthday') identityText = '🎂 本月壽星';
    if (currentIdentity === 'student') identityText = '🎓 學生專案';

    let listHtml = '';
    
    // 渲染套餐
    currentReceiptData.activeCombos.forEach(comboObj => {
        const combo = comboObj.combo;
        const activePromo = getActivePromotion(combo);
        const originalTotal = comboObj.items.reduce((sum, i) => sum + i.price, 0);
        const comboPrice = activePromo ? activePromo.price : (combo.price || originalTotal);

        listHtml += `
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #ddd;">
                <div style="font-weight: bold; color: #0056b3;">【套餐組合】${combo.name}</div>
                <div style="font-size: 0.85em; color: #666; margin-top: 4px;">包含: ${comboObj.items.map(i=>i.name).join(', ')}</div>
                <div style="text-align: right; margin-top: 5px;">
                    ${originalTotal !== comboPrice ? `<span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-right: 8px;">${originalTotal}元</span>` : ''}
                    <span style="color: #dc3545; font-weight: bold; font-size: 1.1em;">${comboPrice} 元</span>
                </div>
            </div>
        `;
    });

    // 渲染單項
    currentReceiptData.singleItems.forEach(item => {
        let basePrice = item.price;
        let finalPrice = basePrice;
        let identityDiscountLabel = '';

        if (currentIdentity === 'birthday') {
            finalPrice = Math.round(basePrice * 0.5);
            identityDiscountLabel = '(壽星5折)';
        } else if (currentIdentity === 'student') {
            finalPrice = Math.round(basePrice * 0.7);
            identityDiscountLabel = '(學生7折)';
        } else {
            const activePromo = getActivePromotion(item);
            if (activePromo) {
                finalPrice = activePromo.price;
                identityDiscountLabel = `(${activePromo.label})`;
            }
        }

        // 需求 1 & 2 套用在截圖中
        let priceHtml = `<span style="color: #dc3545; font-weight: bold; font-size: 1.1em;">${finalPrice} 元</span>`;
        if (basePrice !== finalPrice) {
            priceHtml = `<span style="color: #dc3545; font-weight: bold; font-size: 1.1em;">${finalPrice}</span> 元 <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 8px;">${basePrice} 元</span>`;
        }

        let noticeHtml = '';
        if ((currentIdentity === 'birthday' || currentIdentity === 'student') && item.wasInCombo) {
            let discountStr = currentIdentity === 'birthday' ? '5' : '7';
            noticeHtml = `<div style="font-size: 0.85em; color: #dc3545; margin-top: 4px;">【${item.name}無套餐優惠，以原價${discountStr}折計算】</div>`;
        }

        listHtml += `
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #ddd;">
                <div style="font-weight: bold;">${item.name} <span style="color: #666; font-size: 0.9em; font-weight: normal;">${identityDiscountLabel}</span></div>
                ${noticeHtml}
                <div style="text-align: right; margin-top: 5px;">${priceHtml}</div>
            </div>
        `;
    });

    receiptDiv.innerHTML = `
        <h2 style="text-align: center; color: #0056b3; margin: 0 0 5px 0;">德德美體美容中心</h2>
        <div style="text-align: center; color: #666; font-size: 0.9em; margin-bottom: 20px;">專屬服務估價單</div>
        
        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 15px; background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <span>📅 日期：${dateStr}</span>
            <span>👤 身份：${identityText}</span>
        </div>

        <div style="margin-bottom: 20px; min-height: 100px;">
            ${listHtml}
        </div>

        <div style="background: #e9ecef; padding: 15px; border-radius: 8px; text-align: right;">
            ${currentReceiptData.totalOriginal !== currentReceiptData.totalDiscounted ? `<div style="color: #666; font-size: 0.9em; margin-bottom: 5px;">原價總計：<span style="text-decoration: line-through;">${currentReceiptData.totalOriginal}</span> 元</div>` : ''}
            <div style="font-size: 1.3em; font-weight: bold; color: #333;">
                優惠總金額：<span style="color: #007bff; font-size: 1.2em;">${currentReceiptData.totalDiscounted}</span> 元
            </div>
            ${currentReceiptData.totalPoints > 0 ? `<div style="color: #28a745; font-size: 0.9em; margin-top: 5px; font-weight: bold;">🎁 本次可獲得點數：${currentReceiptData.totalPoints} 點</div>` : ''}
        </div>
        <div style="text-align: center; font-size: 0.8em; color: #999; margin-top: 20px;">
            * 實際價格以現場確認為主 *<br>截圖由 Dede PWA 系統產生
        </div>
    `;

    document.body.appendChild(receiptDiv);

    if (typeof html2canvas === 'undefined') {
        showNotice('❌ 缺少截圖套件，無法產生圖片');
        document.body.removeChild(receiptDiv);
        btn.textContent = originalText;
        btn.disabled = false;
        return;
    }

    html2canvas(receiptDiv, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.download = `德德美容估價單_${new Date().getTime()}.png`;
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
    
    // Fallback if toast container is missing
    let noticeDiv = document.getElementById('sw-notice');
    if (noticeDiv) noticeDiv.remove();
    noticeDiv = document.createElement('div'); 
    noticeDiv.id = 'sw-notice'; 
    noticeDiv.className = 'sw-notice slide-up-animation';
    noticeDiv.style.cssText = 'position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 12px 24px; border-radius: 30px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 15px; white-space: nowrap; transition: opacity 0.3s;';
    noticeDiv.innerHTML = `<span>${msg}</span><button style="background:none; border:none; color:#007bff; cursor:pointer; font-weight:bold;" onclick="this.parentElement.remove()">關閉</button>`;
    document.body.appendChild(noticeDiv);
    setTimeout(() => { if (document.getElementById('sw-notice')) document.getElementById('sw-notice').style.opacity = '0'; setTimeout(()=> { if (document.getElementById('sw-notice')) document.getElementById('sw-notice').remove(); }, 300); }, 3000);
}
