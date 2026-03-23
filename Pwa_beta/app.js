// ==========================================
// 全域變數與狀態管理
// ==========================================
let serviceData = null;
let allServices = new Map();
let selectedItems = new Set();
let currentIdentity = 'general'; // 追蹤客戶身分狀態
const DOM = {};

// 新增：本機資料快取 Key
const DATA_CACHE_KEY = 'dede_services_data_cache';

// ==========================================
// 1. 初始化與資料載入 (本機優先 + 背景更新策略)
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
    let cachedData = null;

    // 1. 本機優先：嘗試從 localStorage 讀取快取
    const localDataString = localStorage.getItem(DATA_CACHE_KEY);
    if (localDataString) {
        try {
            cachedData = JSON.parse(localDataString);
            console.log('✅ 已從本機快取秒速載入資料');
        } catch (e) {
            console.warn('本機快取解析失敗', e);
        }
    }

    // 2. 定義背景更新檢查函式
    const checkUpdateInBackground = async () => {
        try {
            // 加上時間戳強制略過任何中繼快取，直接向伺服器請求最新檔案
            const response = await fetch(`services.json?t=${new Date().getTime()}`, { cache: 'no-store' });
            if (response.ok) {
                const latestData = await response.json();
                const latestDataString = JSON.stringify(latestData);

                // 如果資料有異動 (與本機不同)
                if (localDataString !== latestDataString) {
                    // 延遲一下避免跟初始化的 UI 渲染衝突
                    setTimeout(() => {
                        const userAgreed = confirm('📢 系統通知\n\n發現新的服務項目或價格已更新！\n是否立即載入最新版本？\n\n(若選擇取消，您將繼續使用當前版本直到下次開啟)');
                        if (userAgreed) {
                            // 儲存新資料並重整頁面
                            localStorage.setItem(DATA_CACHE_KEY, latestDataString);
                            window.location.reload(); 
                        }
                    }, 800);
                } else {
                    console.log('🔄 背景檢查完畢：目前已是最新版本');
                }
            }
        } catch (error) {
            console.log('背景檢查更新失敗 (可能處於離線狀態):', error);
        }
    };

    // 3. 根據有無快取決定下一步動作
    if (cachedData) {
        // 有本機快取 -> 立即回傳渲染畫面，並在背景啟動檢查 (延遲1秒讓主畫面優先畫完)
        setTimeout(checkUpdateInBackground, 1000);
        return cachedData;
    } else {
        // 沒有本機快取 (初次使用或清除過資料) -> 強制等待網路請求
        try {
            console.log('初次使用，正在從網路下載資料...');
            const response = await fetch(`services.json?t=${new Date().getTime()}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`伺服器回應錯誤: ${response.status}`);
            const data = await response.json();
            
            // 存入本機快取供下次秒開使用
            localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
            return data;
        } catch (networkError) {
            console.error('初次載入資料失敗:', networkError);
            throw networkError;
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

    setupFloatingSummary();   
    renderIdentitySelector(); 
    renderServiceList();
    bindEvents();
    
    // 檢查網址是否有分享參數
    loadFromUrl();
    updateTotals();
}

// 設定下方總計區塊為懸浮視窗
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
            maxHeight: '35vh',
            overflowY: 'auto'
        });
        document.body.style.paddingBottom = '40vh'; 
    }
}

// 渲染客戶身分選項
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
    
    // 多關鍵字搜尋 (逗號分隔)
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
        end.setHours(23, 59, 59, 999); 
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
    
    let remainingItems = new Set(selectedItems);

    if (serviceData.combos && Array.isArray(serviceData.combos)) {
        serviceData.combos.forEach(combo => {
            // 新增：防呆檢查，確保 combo.items 存在且為陣列，避免 services.json 漏寫時導致畫面當機
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

    if (selectedItems.size === 0) {
        detailsHtml = '<li><span class="item-name" style="color: var(--text-muted);">尚未選擇任何服務</span></li>';
    }

    DOM.selectedItemsList.innerHTML = detailsHtml;
    
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
        
        const url = new URL(window.location);
        url.searchParams.delete('items');
        url.searchParams.delete('identity');
        window.history.replaceState({}, '', url);
    }
}

function generateShareableLink() {
    if (selectedItems.size === 0) {
        showNotice('請先選擇項目後再產生分享連結');
        return;
    }
    const ids = Array.from(selectedItems).join(',');
    const encoded = btoa(ids); 
    const url = new URL(window.location);
    url.searchParams.set('items', encoded);
    url.searchParams.set('identity', currentIdentity); 

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
    const identity = urlParams.get('identity'); 

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

    html2canvas(captureArea, {
        scale: 2, 
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
