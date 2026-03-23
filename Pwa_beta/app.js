// ==========================================
// 全域變數與狀態管理
// ==========================================
let serviceData = null;
let allServices = new Map();
let selectedItems = new Set();
let currentIdentity = 'general'; // 新增：追蹤客戶身分狀態
const DOM = {};

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
    DOM.summarySection = document.getElementById('summary-details'); // 修改：對應 index.html 的正確 ID，確保懸浮視窗樣式能套用
    
    // 總計區塊
    DOM.originalTotal = document.getElementById('floating-original-total');
    DOM.originalTotalP = document.getElementById('original-total-p');
    DOM.discountedTotal = document.getElementById('floating-discounted-total');
    DOM.savings = document.getElementById('floating-savings');
    DOM.savingsContainer = document.getElementById('savings-container');
    DOM.points = document.getElementById('floating-points');
    DOM.pointsContainer = document.getElementById('points-container');
    DOM.selectedItemsList = document.querySelector('#floating-selected-items-list ul');
    
    // 按鈕
    DOM.saveBtn = document.getElementById('save-btn');
    DOM.loadBtn = document.getElementById('load-btn');
    DOM.clearBtn = document.getElementById('clear-btn');
    DOM.shareLinkBtn = document.getElementById('share-link-btn');
    DOM.screenshotBtn = document.getElementById('screenshot-btn');
}

async function loadServiceData() {
    try {
        // 修改：移除時間戳並改用 no-cache，避免跨域或本機快取強制阻擋造成「載入失敗」
        const response = await fetch('services.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`伺服器回應錯誤: ${response.status}`);
        return await response.json();
    } catch (networkError) {
        console.warn('網路請求 services.json 失敗:', networkError.message, '嘗試從快取讀取...');
        try {
            // 修改：不寫死快取版本號，動態尋找可用的快取資料，大幅提高穩定度
            const cacheKeys = await caches.keys();
            for (const key of cacheKeys) {
                const cache = await caches.open(key);
                const cachedResponse = await cache.match('services.json');
                if (cachedResponse) return await cachedResponse.json();
            }
            throw new Error('所有快取中皆找不到 services.json');
        } catch (cacheError) {
            console.error('讀取快取失敗:', cacheError);
            return null;
        }
    }
}

function initializePage() {
    // 建立快查 Map，方便後續用 ID 搜尋項目價格
    allServices.clear();
    serviceData.categories.forEach(cat => {
        cat.items.forEach(item => {
            allServices.set(item.id, item);
        });
    });

    setupFloatingSummary();   // 新增：設定懸浮視窗樣式
    renderIdentitySelector(); // 新增：渲染客戶身分選項
    renderServiceList();
    bindEvents();
    
    // 檢查網址是否有分享參數
    loadFromUrl();
    updateTotals();
}

// 新增：設定下方總計區塊為懸浮視窗
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
            maxHeight: '35vh', // 修改：縮小懸浮窗高度至 35vh，避免影響上方操作
            overflowY: 'auto'
        });
        // 在 body 底部預留空間，避免網頁最下方內容被懸浮窗擋住
        document.body.style.paddingBottom = '40vh'; // 修改：配合高度縮小
    }
}

// 新增：渲染客戶身分選項（壽星、學生折扣）
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
            updateTotals(); // 切換身分時重新計算總價
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
    
    // 修改：將輸入文字用逗號(全半形皆可)分割，以支援多個搜尋關鍵字
    const terms = filterText.toLowerCase().split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0);

    serviceData.categories.forEach(category => {
        // 過濾該分類下的項目
        const filteredItems = category.items.filter(item => {
            if (terms.length === 0) return true;
            // 若「任一」關鍵字符合名稱或標籤，即保留該項目
            return terms.some(term => 
                item.name.toLowerCase().includes(term) || 
                (item.tags && item.tags.some(tag => tag.toLowerCase().includes(term)))
            );
        });

        if (filteredItems.length === 0) return; // 如果這個分類沒有符合的項目，就不渲染分類

        const fieldset = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = category.name;
        fieldset.appendChild(legend);

        // 加入全選/取消全選按鈕區塊
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

        // 渲染項目
        filteredItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'service-item';
            
            const label = document.createElement('label');
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item.id;
            checkbox.checked = selectedItems.has(item.id);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedItems.add(item.id);
                } else {
                    selectedItems.delete(item.id);
                }
                updateTotals();
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'item-name';
            nameSpan.textContent = item.name;

            const priceSpan = document.createElement('span');
            priceSpan.className = 'item-price-detail';
            
            // 檢查是否有生效的促銷
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
        DOM.searchInput.addEventListener('input', (e) => {
            renderServiceList(e.target.value);
        });
    }

    if (DOM.saveBtn) DOM.saveBtn.addEventListener('click', saveSelections);
    if (DOM.loadBtn) DOM.loadBtn.addEventListener('click', loadSelections);
    if (DOM.clearBtn) DOM.clearBtn.addEventListener('click', clearSelections);
    if (DOM.shareLinkBtn) DOM.shareLinkBtn.addEventListener('click', generateShareableLink);
    if (DOM.screenshotBtn) DOM.screenshotBtn.addEventListener('click', exportAsPNG);
    
    // 監聽來自 Service Worker 的訊息
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_STATUS') {
                showNotice(event.data.message);
            }
        });
    }
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
        end.setHours(23, 59, 59, 999); // 確保包含結束日期的整天
        if (now >= start && now <= end) {
            return promo;
        }
    }
    return null;
}

function updateTotals() {
    if (!DOM.discountedTotal || !DOM.selectedItemsList) return;

    let originalTotal = 0;
    let finalTotal = 0;
    let detailsHtml = '';
    
    // 複製一份選中的項目，用來處理組合套餐的貪婪扣除
    let remainingItems = new Set(selectedItems);

    // 1. 檢查組合優惠 (有符合的就套用)
    if (serviceData.combos && Array.isArray(serviceData.combos)) {
        serviceData.combos.forEach(combo => {
            // 檢查組合包的促銷日期
            const activeComboPromo = getActivePromotion([combo]); 
            const hasValidDate = (!combo.start && !combo.end) || activeComboPromo !== null;

            if (hasValidDate) {
                // 檢查是否選中了該組合要求的所有項目
                const isMatch = combo.items.every(id => remainingItems.has(id));
                if (isMatch) {
                    let comboOriginalPrice = 0;
                    combo.items.forEach(id => {
                        const item = allServices.get(id);
                        if(item) comboOriginalPrice += item.price;
                        remainingItems.delete(id); // 從剩餘單品清單中移除
                    });
                    
                    originalTotal += comboOriginalPrice;
                    finalTotal += combo.price;
                    
                    detailsHtml += `
                        <li>
                            <span class="item-name">🎁 [組合] ${combo.name}</span>
                            <span class="item-price-detail" style="color: var(--danger-color);">$${combo.price} <span style="text-decoration: line-through; color: #999; font-size: 0.8em;">$${comboOriginalPrice}</span></span>
                        </li>
                    `;
                }
            }
        });
    }

    // 2. 計算剩餘單品的價格 (包含單品促銷)
    remainingItems.forEach(id => {
        const item = allServices.get(id);
        if (!item) return;

        originalTotal += item.price;
        const activePromo = getActivePromotion(item.promotions);
        let itemFinalPrice = item.price;
        let displayPriceHtml = `$${item.price}`;

        if (activePromo) {
            itemFinalPrice = activePromo.price;
            displayPriceHtml = `<span style="color: var(--danger-color);">$${itemFinalPrice}</span> <span style="text-decoration: line-through; color: #999; font-size: 0.8em;">$${item.price}</span>`;
        }

        finalTotal += itemFinalPrice;
        
        detailsHtml += `
            <li>
                <span class="item-name">${item.name}</span>
                <span class="item-price-detail">${displayPriceHtml}</span>
            </li>
        `;
    });

    // 新增：插入客戶身分折扣邏輯
    if (currentIdentity !== 'general' && selectedItems.size > 0) {
        let identityDiscountPrice = originalTotal;
        let identityLabel = '';
        
        if (currentIdentity === 'birthday') {
            identityDiscountPrice = originalTotal * 0.5;
            identityLabel = '🎉 當月壽星 (原價 5 折)';
        } else if (currentIdentity === 'student') {
            identityDiscountPrice = originalTotal * 0.8;
            identityLabel = '🎓 學生 (原價 8 折)';
        }

        // 比較「原價打折」與「現有促銷/組合總價」，取最便宜的價格給客人
        if (identityDiscountPrice < finalTotal) {
            finalTotal = identityDiscountPrice;
            detailsHtml += `
                <li style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc;">
                    <span class="item-name" style="color: #dc3545; font-weight: bold;">✨ 已套用最佳優惠</span>
                    <span class="item-price-detail" style="color: #dc3545; font-weight: bold;">${identityLabel}</span>
                </li>`;
        } else {
            detailsHtml += `
                <li style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc;">
                    <span class="item-name" style="color: #6c757d; font-size: 0.9em;">ℹ️ 單品/組合促銷已低於身分折扣，為您保留最划算方案</span>
                </li>`;
        }
    }

    // 3. 更新 UI
    if (selectedItems.size === 0) {
        detailsHtml = '<li><span class="item-name" style="color: var(--text-muted);">尚未選擇任何服務</span></li>';
    }

    DOM.selectedItemsList.innerHTML = detailsHtml;
    
    // 修改：加入所有標籤的防呆檢查 (if)，避免網頁缺少標籤時導致系統當機報錯
    if (DOM.discountedTotal) DOM.discountedTotal.textContent = finalTotal.toLocaleString();
    if (DOM.originalTotal) DOM.originalTotal.textContent = originalTotal.toLocaleString();

    const savings = originalTotal - finalTotal;
    if (savings > 0) {
        if (DOM.originalTotalP) DOM.originalTotalP.style.display = 'block';
        if (DOM.savingsContainer) DOM.savingsContainer.style.display = 'block';
        if (DOM.savings) DOM.savings.textContent = savings.toLocaleString();
    } else {
        if (DOM.originalTotalP) DOM.originalTotalP.style.display = 'none';
        if (DOM.savingsContainer) DOM.savingsContainer.style.display = 'none';
    }

    // 簡單點數計算邏輯：每消費 100 元獲得 1 點
    const points = Math.floor(finalTotal / 100);
    if (points > 0 && DOM.pointsContainer) {
        DOM.pointsContainer.style.display = 'block';
        if (DOM.points) DOM.points.textContent = points.toLocaleString();
    } else if (DOM.pointsContainer) {
        DOM.pointsContainer.style.display = 'none';
    }
}

function updateCheckboxes() {
    document.querySelectorAll('.service-item input[type="checkbox"]').forEach(cb => {
        cb.checked = selectedItems.has(cb.value);
    });
}

// ==========================================
// 4. 快速操作與工具函式
// ==========================================
function saveSelections() {
    if (selectedItems.size === 0) {
        showNotice('尚未選擇任何項目，無法儲存');
        return;
    }
    localStorage.setItem('dede_saved_selections', JSON.stringify(Array.from(selectedItems)));
    showNotice('✅ 已成功儲存目前選擇！');
}

function loadSelections() {
    const saved = localStorage.getItem('dede_saved_selections');
    if (saved) {
        try {
            const arr = JSON.parse(saved);
            selectedItems = new Set(arr);
            updateCheckboxes();
            updateTotals();
            showNotice('📂 已載入上次的選擇');
        } catch (e) {
            showNotice('❌ 讀取失敗，存檔可能已損毀');
        }
    } else {
        showNotice('找不到儲存的紀錄');
    }
}

function clearSelections() {
    if (selectedItems.size === 0) return;
    if (confirm('確定要清除所有已選項目嗎？')) {
        selectedItems.clear();
        updateCheckboxes();
        updateTotals();
        showNotice('🗑️ 已清除所有選項');
        
        // 移除網址中的分享參數
        const url = new URL(window.location);
        url.searchParams.delete('items');
        window.history.replaceState({}, '', url);
    }
}

function generateShareableLink() {
    if (selectedItems.size === 0) {
        showNotice('請先選擇項目後再產生分享連結');
        return;
    }
    const ids = Array.from(selectedItems).join(',');
    const encoded = btoa(ids); // 使用 Base64 編碼隱藏明文 ID
    const url = new URL(window.location);
    url.searchParams.set('items', encoded);
    url.searchParams.set('identity', currentIdentity); // 新增：將客戶身分一起加進網址

    // 嘗試複製到剪貼簿
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url.toString()).then(() => {
            showNotice('🔗 分享連結已複製到剪貼簿！');
        }).catch(err => copyFallback(url.toString()));
    } else {
        copyFallback(url.toString());
    }
}

function copyFallback(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand('copy');
        showNotice('🔗 分享連結已複製到剪貼簿！');
    } catch (err) {
        showNotice('無法自動複製，請手動複製網址');
    }
    document.body.removeChild(input);
}

function loadFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const encodedItems = urlParams.get('items');
    const identity = urlParams.get('identity'); // 新增：讀取客戶身分

    // 新增：恢復客戶身分設定與畫面選取
    if (identity && ['general', 'birthday', 'student'].includes(identity)) {
        currentIdentity = identity;
        const radio = document.querySelector(`input[name="identity"][value="${identity}"]`);
        if (radio) radio.checked = true;
    }

    if (encodedItems) {
        try {
            const decoded = atob(encodedItems);
            const ids = decoded.split(',');
            selectedItems = new Set(ids.filter(id => allServices.has(id)));
            updateCheckboxes();
            showNotice('已載入分享的服務項目');
        } catch (e) {
            console.error('解析分享連結失敗:', e);
            showNotice('無法解析分享連結');
        }
    }
}

function exportAsPNG() {
    // 新增：未選擇項目防呆阻擋機制
    if (selectedItems.size === 0) {
        showNotice('⚠️ 尚未選擇任何服務，無法截圖');
        return;
    }

    const captureArea = document.getElementById('capture-area');
    if (!captureArea) {
        showNotice('找不到可截圖的區域');
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

    // 使用 html2canvas 產生圖片
    html2canvas(captureArea, {
        scale: 2, // 提高解析度使文字更清晰
        backgroundColor: '#f4f4f9',
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `德德美體-估價單-${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotice('📷 截圖已下載！');
    }).catch(err => {
        console.error('截圖失敗:', err);
        showNotice('❌ 截圖發生錯誤');
    }).finally(() => {
        btn.textContent = originalText;
        btn.disabled = false;
    });
}

// ==========================================
// 5. UI 通知系統
// ==========================================
function showNotice(msg) {
    // 優先使用 index.html 與 dede.css 中定義的 toast-notification
    let toast = document.getElementById('toast-notification');
    
    if (toast) {
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, -20px)';
        
        // 重置動畫計時器
        if(toast.timeoutId) clearTimeout(toast.timeoutId);
        
        toast.timeoutId = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 0)';
        }, 3000);
        return;
    }

    // Fallback: 如果沒有 toast，則動態建立一個 sw-notice
    let noticeDiv = document.getElementById('sw-notice');
    if (noticeDiv) noticeDiv.remove();

    noticeDiv = document.createElement('div');
    noticeDiv.id = 'sw-notice';
    noticeDiv.className = 'sw-notice slide-up-animation';
    noticeDiv.innerHTML = `
        <span>${msg}</span>
        <button onclick="this.parentElement.remove()">關閉</button>
    `;
    document.body.appendChild(noticeDiv);

    setTimeout(() => {
        if (document.getElementById('sw-notice') === noticeDiv) {
            noticeDiv.style.opacity = '0';
            noticeDiv.style.transform = 'translate(-50%, 20px)';
            setTimeout(() => noticeDiv.remove(), 500);
        }
    }, 4000);
}
