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
    DOM.identityRadios = document.querySelectorAll('input[name="identity"]');
    DOM.visitDate = document.getElementById('visit-date');
    DOM.floatingTotal = document.getElementById('floating-total');
    DOM.floatingDiscountedTotal = document.getElementById('floating-discounted-total');
    DOM.floatingPoints = document.getElementById('floating-points');
    DOM.saveBtn = document.getElementById('save-btn');
    DOM.loadBtn = document.getElementById('load-btn');
    DOM.clearBtn = document.getElementById('clear-btn');
    DOM.shareLinkBtn = document.getElementById('share-link-btn');
    DOM.screenshotBtn = document.getElementById('screenshot-btn');
}

async function loadServiceData() {
    try {
        const response = await fetch('services.json');
        if (!response.ok) throw new Error('網路回應錯誤');
        const data = await response.json();
        localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
        return data;
    } catch (error) {
        console.warn('從網路取得資料失敗，嘗試使用快取', error);
        const cached = localStorage.getItem(DATA_CACHE_KEY);
        if (cached) return JSON.parse(cached);
        return null;
    }
}

function initializePage() {
    if (DOM.visitDate) {
        const today = new Date().toISOString().split('T')[0];
        DOM.visitDate.value = today;
        DOM.visitDate.addEventListener('change', () => {
            renderServices();
            calculateTotal();
        });
    }

    // 建立所有服務的 Map 以便快速查找
    if (serviceData.categories) {
        serviceData.categories.forEach(cat => {
            if (cat.items) {
                cat.items.forEach(item => {
                    allServices.set(item.id, item);
                });
            }
        });
    }
    if (serviceData.combos) {
        serviceData.combos.forEach(combo => {
            allServices.set(combo.id, combo);
        });
    }

    renderServices();
    setupEventListeners();
    
    // 若網址有帶參數，則自動勾選並選擇身分
    handleUrlParameters();
    
    calculateTotal();
}

// ==========================================
// 2. 渲染與事件設定
// ==========================================
function renderServices(searchTerm = '') {
    if (!DOM.serviceList) return;
    DOM.serviceList.innerHTML = '';
    
    const visitDateStr = DOM.visitDate ? DOM.visitDate.value : new Date().toISOString().split('T')[0];

    // 渲染一般分類
    if (serviceData.categories) {
        serviceData.categories.forEach(cat => {
            const itemsToRender = cat.items.filter(item => 
                item.name.toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (itemsToRender.length > 0) {
                const catSection = document.createElement('div');
                catSection.className = 'category-section';
                catSection.innerHTML = `<h3>${cat.name}</h3>`;
                
                const itemsContainer = document.createElement('div');
                itemsContainer.className = 'items-container';
                
                itemsToRender.forEach(item => {
                    itemsContainer.appendChild(createItemElement(item, visitDateStr));
                });
                
                catSection.appendChild(itemsContainer);
                DOM.serviceList.appendChild(catSection);
            }
        });
    }

    // 渲染套餐
    if (serviceData.combos && serviceData.combos.length > 0) {
        const combosToRender = serviceData.combos.filter(combo => 
            combo.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (combosToRender.length > 0) {
            const catSection = document.createElement('div');
            catSection.className = 'category-section combo-section';
            catSection.innerHTML = `<h3>本月超值套餐</h3>`;
            
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'items-container';
            
            combosToRender.forEach(combo => {
                itemsContainer.appendChild(createItemElement(combo, visitDateStr));
            });
            
            catSection.appendChild(itemsContainer);
            DOM.serviceList.appendChild(catSection);
        }
    }
}

function createItemElement(item, dateStr) {
    const div = document.createElement('div');
    div.className = 'service-item';
    
    // 原價計算 (若為套餐則加總其包含的項目原價)
    const originalPrice = item.price || (item.itemIds ? item.itemIds.reduce((sum, id) => {
        const s = allServices.get(id);
        return sum + (s ? (s.price||0) : 0);
    }, 0) : 0);
    
    const currentPrice = getPrice(item, dateStr);
    const isPromo = currentPrice < originalPrice;
    
    let priceHtml = `<span class="price">${originalPrice} 元</span>`;
    if (isPromo) {
        priceHtml = `<span class="original-price" style="text-decoration:line-through; color:#999; margin-right:5px;">${originalPrice} 元</span><span class="promo-price" style="color:var(--danger-color,#dc3545); font-weight:bold;">${currentPrice} 元</span>`;
    }

    div.innerHTML = `
        <label>
            <input type="checkbox" value="${item.id}" ${selectedItems.has(item.id) ? 'checked' : ''}>
            <span class="name">${item.name}</span>
            ${priceHtml}
        </label>
    `;

    div.querySelector('input').addEventListener('change', handleCheckboxChange);
    return div;
}

function handleCheckboxChange(e) {
    if (e.target.checked) {
        selectedItems.add(e.target.value);
    } else {
        selectedItems.delete(e.target.value);
    }
    calculateTotal();
}

function setupEventListeners() {
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => {
            renderServices(e.target.value);
        });
    }

    if (DOM.identityRadios) {
        DOM.identityRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentIdentity = e.target.value;
                calculateTotal();
            });
        });
    }

    if (DOM.saveBtn) DOM.saveBtn.addEventListener('click', saveSelection);
    if (DOM.loadBtn) DOM.loadBtn.addEventListener('click', loadSelection);
    if (DOM.clearBtn) DOM.clearBtn.addEventListener('click', clearSelection);
    if (DOM.shareLinkBtn) DOM.shareLinkBtn.addEventListener('click', generateShareLink);
    if (DOM.screenshotBtn) DOM.screenshotBtn.addEventListener('click', takeScreenshot);
}

// ==========================================
// 3. 核心商業邏輯 (計算、優惠、套餐)
// ==========================================
function getPrice(service, dateStr) {
    if (!service) return 0;
    let price = service.price || 0;
    
    if (service.itemIds && !service.price) {
         price = service.itemIds.reduce((sum, id) => {
            const s = allServices.get(id);
            return sum + (s ? (s.price||0) : 0);
        }, 0);
    }

    if (service.promotions && service.promotions.length > 0) {
        const targetDate = new Date(dateStr);
        for (let promo of service.promotions) {
            const start = new Date(promo.start);
            const end = new Date(promo.end);
            end.setHours(23, 59, 59, 999);
            if (targetDate >= start && targetDate <= end) {
                return promo.price; // 取第一個符合的促銷價
            }
        }
    }
    return price;
}

function findBestCombosForItems(itemIds, visitDate) {
    let appliedCombos = [];
    let remainingItems = [...itemIds];
    
    if (!serviceData.combos) return { appliedCombos, remainingItems };

    let sortedCombos = [...serviceData.combos].sort((a, b) => b.itemIds.length - a.itemIds.length);

    for (let combo of sortedCombos) {
        let canApply = true;
        for (let requiredId of combo.itemIds) {
            if (!remainingItems.includes(requiredId)) {
                canApply = false;
                break;
            }
        }

        if (canApply) {
            appliedCombos.push(combo);
            for (let requiredId of combo.itemIds) {
                const index = remainingItems.indexOf(requiredId);
                if (index > -1) remainingItems.splice(index, 1);
            }
        }
    }

    return { appliedCombos, remainingItems };
}

function calculateTotal() {
    let totalOriginal = 0;
    let totalDiscounted = 0;
    let totalPoints = 0;
    let receiptItems = [];

    const visitDate = DOM.visitDate ? DOM.visitDate.value : new Date().toISOString().split('T')[0];

    // 處理壽星或學生
    if (currentIdentity === 'birthday' || currentIdentity === 'student') {
        const identityText = currentIdentity === 'birthday' ? '壽星' : '學生';
        const discountRate = currentIdentity === 'birthday' ? 0.5 : 0.8;
        const rateText = currentIdentity === 'birthday' ? '5' : '8';

        let expandedIds = new Set();
        let itemsFromCombo = new Set();

        selectedItems.forEach(id => {
            let service = allServices.get(id);
            if (!service) return;

            if (service.itemIds) {
                // 若勾選本月超值套餐，則不將項目合併顯示 (展開單品)
                service.itemIds.forEach(itemId => {
                    expandedIds.add(itemId);
                    itemsFromCombo.add(itemId); // 記錄此項目來自套餐，用於顯示提示
                });
            } else {
                expandedIds.add(id);
            }
        });

        expandedIds.forEach(id => {
            let service = allServices.get(id);
            if (!service) return;

            let originalPrice = service.price || 0;
            let finalPrice = Math.round(originalPrice * discountRate);

            receiptItems.push({
                id: id,
                name: service.name,
                originalPrice: originalPrice,
                finalPrice: finalPrice,
                discountNote: `${identityText}以原價${rateText}折計算`,
                // 若由套餐展開，加入專屬無優惠標註
                extraNote: itemsFromCombo.has(id) ? `【${identityText}無套餐優惠，以原價${rateText}折計算】` : null
            });

            totalOriginal += originalPrice;
            totalDiscounted += finalPrice;
        });

    } else {
        // 處理一般身分
        let rawSelected = [];
        selectedItems.forEach(id => rawSelected.push(id));

        let comboIdsSelected = rawSelected.filter(id => {
            let s = allServices.get(id);
            return s && s.itemIds;
        });
        let singleIdsSelected = rawSelected.filter(id => {
            let s = allServices.get(id);
            return s && !s.itemIds;
        });

        // 1. 處理直接勾選的套餐
        comboIdsSelected.forEach(comboId => {
            let combo = allServices.get(comboId);
            let comboPrice = getPrice(combo, visitDate);
            let comboOriginalPrice = combo.itemIds.reduce((sum, itemId) => {
                let s = allServices.get(itemId);
                return sum + (s ? (s.price || 0) : 0);
            }, 0);

            receiptItems.push({
                id: combo.id,
                name: combo.name,
                originalPrice: comboOriginalPrice,
                finalPrice: comboPrice,
                discountNote: '套餐組合',
                isCombo: true
            });
            totalOriginal += comboOriginalPrice;
            totalDiscounted += comboPrice;
        });

        // 2. 處理單品 (嘗試自動組裝套餐)
        let { appliedCombos, remainingItems } = findBestCombosForItems(singleIdsSelected, visitDate);

        appliedCombos.forEach(combo => {
            let comboPrice = getPrice(combo, visitDate);
            let comboOriginalPrice = combo.itemIds.reduce((sum, itemId) => {
                let s = allServices.get(itemId);
                return sum + (s ? (s.price || 0) : 0);
            }, 0);

            receiptItems.push({
                id: combo.id,
                name: combo.name,
                originalPrice: comboOriginalPrice,
                finalPrice: comboPrice,
                discountNote: '符合套餐組合',
                isCombo: true
            });
            totalOriginal += comboOriginalPrice;
            totalDiscounted += comboPrice;
        });

        remainingItems.forEach(itemId => {
            let service = allServices.get(itemId);
            if (!service) return;
            let originalPrice = service.price || 0;
            let finalPrice = getPrice(service, visitDate);
            let note = finalPrice < originalPrice ? '促銷優惠' : null;

            receiptItems.push({
                id: service.id,
                name: service.name,
                originalPrice: originalPrice,
                finalPrice: finalPrice,
                discountNote: note
            });
            totalOriginal += originalPrice;
            totalDiscounted += finalPrice;
        });
    }

    totalPoints = Math.floor(totalDiscounted / 1000);

    currentReceiptData = {
        items: receiptItems,
        totalOriginal,
        totalDiscounted,
        totalPoints
    };

    updateUI();
}

function updateUI() {
    if (!currentReceiptData) return;

    // 1. 更新底部浮動列的總計
    if (DOM.floatingTotal) DOM.floatingTotal.textContent = currentReceiptData.totalOriginal;
    if (DOM.floatingDiscountedTotal) DOM.floatingDiscountedTotal.textContent = currentReceiptData.totalDiscounted;
    if (DOM.floatingPoints) DOM.floatingPoints.textContent = currentReceiptData.totalPoints;

    const origTotalEl = document.getElementById('original-total-p');
    if (origTotalEl) {
        if (currentReceiptData.totalDiscounted < currentReceiptData.totalOriginal) {
            origTotalEl.style.textDecoration = 'line-through';
            origTotalEl.style.color = '#999';
        } else {
            origTotalEl.style.textDecoration = 'none';
            origTotalEl.style.color = 'inherit';
        }
    }

    const pointsContainer = document.getElementById('points-container');
    if (pointsContainer) {
        pointsContainer.style.display = currentReceiptData.totalPoints > 0 ? 'block' : 'none';
    }

    // 2. 更新「目前選擇明細」列表
    const floatingList = document.querySelector('#floating-selected-items-list ul');
    if (floatingList) {
        floatingList.innerHTML = '';
        if (currentReceiptData.items.length === 0) {
            floatingList.innerHTML = '<li style="padding: 5px 0; color: #666;">尚未選擇任何項目</li>';
        } else {
            currentReceiptData.items.forEach(item => {
                const li = document.createElement('li');
                li.style.padding = '8px 0';
                li.style.borderBottom = '1px solid #eee';

                let priceText = `${item.finalPrice} 元`;

                // 針對不同身分產生對應樣式的價格文字
                if (currentIdentity === 'birthday' || currentIdentity === 'student') {
                    // 將原價以刪除線標示，並於左方顯示優惠後價格（含折數標記）
                    priceText = `<span style="text-decoration: line-through; color: #999; margin-right: 5px;">${item.originalPrice} 元</span><span style="color: var(--danger-color, #dc3545); font-weight: bold;">${item.finalPrice} 元 (${item.discountNote})</span>`;
                } else if (item.discountNote) {
                    priceText = `<span style="text-decoration: line-through; color: #999; margin-right: 5px;">${item.originalPrice} 元</span><span style="color: var(--danger-color, #dc3545); font-weight: bold;">${item.finalPrice} 元 (${item.discountNote})</span>`;
                }

                // 壽星與學生若勾選套餐的專屬提示
                let extraNoteHtml = '';
                if (item.extraNote) {
                    extraNoteHtml = `<div style="font-size: 0.85em; color: var(--danger-color, #dc3545); margin-top: 4px;">${item.extraNote}</div>`;
                }

                li.innerHTML = `
                    <div>
                        <span style="font-weight: 500;">${item.name}</span>
                        <div style="font-size: 0.9em; margin-top: 2px;">${priceText}</div>
                        ${extraNoteHtml}
                    </div>
                `;
                floatingList.appendChild(li);
            });
        }
    }
}

// ==========================================
// 4. 輔助功能 (儲存、讀取、分享、截圖)
// ==========================================
function saveSelection() {
    const data = {
        items: Array.from(selectedItems),
        identity: currentIdentity,
        date: DOM.visitDate ? DOM.visitDate.value : ''
    };
    localStorage.setItem('dede_saved_selection', JSON.stringify(data));
    showNotice('💾 選擇已儲存！');
}

function loadSelection() {
    const saved = localStorage.getItem('dede_saved_selection');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            selectedItems = new Set(data.items);
            if (data.identity) {
                currentIdentity = data.identity;
                const radio = document.querySelector(`input[name="identity"][value="${data.identity}"]`);
                if (radio) radio.checked = true;
            }
            if (data.date && DOM.visitDate) {
                DOM.visitDate.value = data.date;
            }
            renderServices(); // 重新渲染以更新勾選狀態
            calculateTotal();
            showNotice('📂 已載入上次的選擇！');
        } catch (e) {
            showNotice('❌ 載入失敗');
        }
    } else {
        showNotice('沒有找到儲存的紀錄。');
    }
}

function clearSelection() {
    selectedItems.clear();
    currentIdentity = 'general';
    const defaultRadio = document.querySelector(`input[name="identity"][value="general"]`);
    if (defaultRadio) defaultRadio.checked = true;
    renderServices();
    calculateTotal();
    showNotice('🗑️ 已清除所有選項');
}

function generateShareLink() {
    const baseUrl = window.location.origin + window.location.pathname;
    const itemsStr = Array.from(selectedItems).join(',');
    const url = `${baseUrl}?items=${encodeURIComponent(itemsStr)}&id=${currentIdentity}`;
    
    navigator.clipboard.writeText(url).then(() => {
        showNotice('🔗 分享網址已複製到剪貼簿！');
    }).catch(() => {
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotice('🔗 分享網址已複製到剪貼簿！');
        } catch (err) {
            showNotice('❌ 複製失敗，請手動複製網址');
        }
        document.body.removeChild(textArea);
    });
}

function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const itemsParam = params.get('items');
    const idParam = params.get('id');

    if (itemsParam) {
        const items = itemsParam.split(',');
        items.forEach(id => selectedItems.add(id));
    }

    if (idParam) {
        currentIdentity = idParam;
        const radio = document.querySelector(`input[name="identity"][value="${idParam}"]`);
        if (radio) radio.checked = true;
    }
}

function takeScreenshot() {
    const btn = DOM.screenshotBtn;
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = '擷取中...';
    btn.disabled = true;

    const receiptDiv = document.createElement('div');
    receiptDiv.style.position = 'absolute';
    receiptDiv.style.left = '-9999px';
    receiptDiv.style.top = '0';
    receiptDiv.style.width = '400px';
    receiptDiv.style.padding = '20px';
    receiptDiv.style.background = '#fff';
    receiptDiv.style.color = '#333';
    receiptDiv.style.fontFamily = 'sans-serif';
    receiptDiv.style.borderRadius = '10px';
    
    let dateStr = DOM.visitDate ? DOM.visitDate.value : new Date().toISOString().split('T')[0];
    let identityStr = '一般';
    if (currentIdentity === 'birthday') identityStr = '當月壽星';
    if (currentIdentity === 'student') identityStr = '學生';

    let html = `
        <h2 style="text-align:center; color:#007bff; margin-bottom:10px;">德德美體美容中心</h2>
        <p style="text-align:center; margin:0 0 15px 0; color:#666;">估價單</p>
        <div style="border-bottom:2px solid #333; margin-bottom:15px; padding-bottom:5px;">
            <div><strong>預計來店日期：</strong> ${dateStr}</div>
            <div><strong>選擇身分：</strong> ${identityStr}</div>
        </div>
        <ul style="list-style:none; padding:0; margin:0;">
    `;

    if (currentReceiptData && currentReceiptData.items) {
        currentReceiptData.items.forEach(item => {
            let priceText = `${item.finalPrice} 元`;
            
            // 截圖內也要套用新的價格顯示樣式
            if (currentIdentity === 'birthday' || currentIdentity === 'student') {
                 priceText = `<span style="text-decoration: line-through; color: #999; margin-right: 5px;">${item.originalPrice} 元</span><span style="color: #dc3545; font-weight: bold;">${item.finalPrice} 元 (${item.discountNote})</span>`;
            } else if (item.discountNote) {
                priceText = `<span style="text-decoration: line-through; color: #999; margin-right: 5px;">${item.originalPrice} 元</span><span style="color: #dc3545; font-weight: bold;">${item.finalPrice} 元 (${item.discountNote})</span>`;
            }

            let extraNoteHtml = item.extraNote ? `<div style="font-size: 0.85em; color: #dc3545; margin-top: 4px;">${item.extraNote}</div>` : '';

            html += `
                <li style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px dashed #ccc;">
                    <div style="font-weight:bold;">${item.name}</div>
                    <div style="font-size:0.9em; margin-top:3px;">${priceText}</div>
                    ${extraNoteHtml}
                </li>
            `;
        });
    }

    html += `
        </ul>
        <div style="margin-top:15px; text-align:right; font-size:1.1em;">
            <div>原價總計：<span style="${currentReceiptData.totalDiscounted < currentReceiptData.totalOriginal ? 'text-decoration:line-through; color:#999;' : ''}">${currentReceiptData.totalOriginal}</span> 元</div>
            <div style="font-weight:bold; color:#dc3545; font-size:1.2em; margin-top:5px;">折扣後總金額：${currentReceiptData.totalDiscounted} 元</div>
    `;
    
    if (currentReceiptData.totalPoints > 0) {
        html += `<div style="color:#007bff; font-weight:bold; margin-top:5px;">🎁 可獲得點數：${currentReceiptData.totalPoints} 點</div>`;
    }
    
    html += `</div>`;
    receiptDiv.innerHTML = html;
    document.body.appendChild(receiptDiv);

    html2canvas(receiptDiv, {
        scale: 2,
        backgroundColor: '#ffffff'
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `德德美體_估價單_${new Date().getTime()}.png`;
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
    let noticeDiv = document.getElementById('sw-notice');
    if (noticeDiv) noticeDiv.remove();
    noticeDiv = document.createElement('div'); 
    noticeDiv.id = 'sw-notice'; 
    noticeDiv.className = 'sw-notice slide-up-animation';
    noticeDiv.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">關閉</button>`;
    document.body.appendChild(noticeDiv);
    setTimeout(() => { if (document.getElementById('sw-notice')) document.getElementById('sw-notice').remove(); }, 3000);
}
