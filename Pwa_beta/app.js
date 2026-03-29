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
    
    // 結算與明細相關 DOM
    DOM.originalTotal = document.getElementById('floating-original-total');
    DOM.originalTotalP = document.getElementById('original-total-p');
    DOM.promoSavingsContainer = document.getElementById('promo-savings-container'); 
    DOM.appliedPromo = document.getElementById('floating-applied-promo');         
    DOM.discountedTotal = document.getElementById('floating-discounted-total');
    DOM.savings = document.getElementById('floating-savings');
    DOM.points = document.getElementById('floating-points');
    DOM.pointsContainer = document.getElementById('points-container');
    DOM.selectedItemsList = document.querySelector('#floating-selected-items-list ul');
    
    // 身分選擇與按鈕
    DOM.identityRadios = document.querySelectorAll('input[name="identity"]');
    DOM.saveBtn = document.getElementById('save-btn');
    DOM.loadBtn = document.getElementById('load-btn');
    DOM.clearBtn = document.getElementById('clear-btn');
    DOM.screenshotBtn = document.getElementById('screenshot-btn');
    DOM.shareLinkBtn = document.getElementById('share-link-btn');
}

async function loadServiceData() {
    try {
        const response = await fetch('services.json?t=' + new Date().getTime());
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
        return data;
    } catch (error) {
        console.warn('載入最新資料失敗，嘗試使用快取', error);
        const cached = localStorage.getItem(DATA_CACHE_KEY);
        if (cached) return JSON.parse(cached);
        return null;
    }
}

function initializePage() {
    allServices.clear();
    if (serviceData && serviceData.categories) {
        serviceData.categories.forEach(category => {
            category.items.forEach(item => {
                allServices.set(item.id, item);
            });
        });
    }

    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => renderServiceList(e.target.value));
    }

    if (DOM.identityRadios) {
        DOM.identityRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentIdentity = e.target.value;
                updateTotals(); // 切換身分時重新計算
            });
        });
    }

    if (DOM.saveBtn) DOM.saveBtn.addEventListener('click', () => {
        localStorage.setItem('dede_saved_selection', JSON.stringify(Array.from(selectedItems)));
        showNotice('✅ 選擇已儲存！');
    });
    
    if (DOM.loadBtn) DOM.loadBtn.addEventListener('click', () => {
        const saved = localStorage.getItem('dede_saved_selection');
        if (saved) {
            selectedItems = new Set(JSON.parse(saved));
            updateCheckboxes();
            updateTotals();
            showNotice('📂 已載入上次選擇！');
        } else {
            showNotice('找不到儲存的紀錄。');
        }
    });
    
    if (DOM.clearBtn) DOM.clearBtn.addEventListener('click', () => {
        if (confirm('確定要清除所有選擇嗎？')) {
            selectedItems.clear();
            updateCheckboxes();
            updateTotals();
            showNotice('🗑️ 已清除所有選項');
        }
    });

    if (DOM.screenshotBtn) DOM.screenshotBtn.addEventListener('click', exportAsPNG);
    if (DOM.shareLinkBtn) DOM.shareLinkBtn.addEventListener('click', () => {
        showNotice('🔗 功能開發中');
    });

    renderServiceList();
    updateTotals();
}

function getActivePromotion(promotions) {
    if (!promotions || !Array.isArray(promotions) || promotions.length === 0) return null;
    const now = new Date();
    const activePromos = promotions.filter(p => {
        const start = new Date(p.start);
        const end = new Date(p.end);
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
    });
    if (activePromos.length === 0) return null;
    return activePromos.reduce((prev, current) => (prev.price < current.price) ? prev : current);
}

// ==========================================
// 2. 渲染服務清單
// ==========================================
function renderServiceList(filterText = '') {
    if (!DOM.serviceList) return;
    DOM.serviceList.innerHTML = '';
    
    const terms = filterText.toLowerCase().split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0);

    // --- 置頂套餐區 ---
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
            legend.textContent = '🔥 本月超值套餐 (一鍵全選)';
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

    // --- 一般分類與項目 ---
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
                    <span class="discount-note" style="font-size: 0.85em; color: var(--primary-color, #007bff); margin-right: 5px;">${activePromo.label}</span>
                    <span style="color: var(--danger-color); font-weight: bold; font-size: 1.05em;">$${activePromo.price}</span>
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

function updateCheckboxes() {
    if (!DOM.serviceList) return;
    
    const checkboxes = DOM.serviceList.querySelectorAll('.service-item input[type="checkbox"]:not(.combo-checkbox)');
    checkboxes.forEach(cb => { cb.checked = selectedItems.has(cb.value); });

    const comboCheckboxes = DOM.serviceList.querySelectorAll('.combo-checkbox');
    comboCheckboxes.forEach(cb => {
        const comboIndex = cb.dataset.comboIndex;
        const combo = serviceData.combos[comboIndex];
        if (combo && combo.itemIds) {
            cb.checked = combo.itemIds.every(id => selectedItems.has(id));
        }
    });
}

// ==========================================
// 3. 結算與邏輯計算
// ==========================================
function updateTotals() {
    if (!serviceData) return;

    let originalTotal = 0;
    let finalTotal = 0;
    let appliedPromoText = '無';
    let receiptItems = [];
    let remainingItems = new Set(selectedItems);
    
    // 判斷是否為不能享有組合優惠的特殊身分
    const isSpecialIdentity = (currentIdentity === 'student' || currentIdentity === 'birthday');

    // 1. 處理組合優惠
    if (serviceData.combos && Array.isArray(serviceData.combos)) {
        serviceData.combos.forEach(combo => {
            const comboItemsList = combo.itemIds; 
            if (!comboItemsList || !Array.isArray(comboItemsList)) return;

            const activeComboPromo = getActivePromotion(combo.promotions);

            if (activeComboPromo) {
                const isMatch = comboItemsList.every(id => remainingItems.has(id));
                
                if (isMatch) {
                    let comboOriginalPrice = 0;
                    let comboItemNames = [];

                    comboItemsList.forEach(id => {
                        const item = allServices.get(id);
                        if(item) {
                            comboOriginalPrice += item.price;
                            comboItemNames.push(item.name);
                        }
                        remainingItems.delete(id); 
                    });
                    
                    originalTotal += comboOriginalPrice;
                    
                    // 【關鍵邏輯】若為特殊身分，組合優惠強制變回原價！
                    let currentComboPrice = isSpecialIdentity ? comboOriginalPrice : activeComboPromo.price;
                    finalTotal += currentComboPrice;
                    
                    receiptItems.push({
                        name: comboItemNames.join(' + '),
                        originalPrice: comboOriginalPrice,
                        finalPrice: currentComboPrice,
                        hasPromo: !isSpecialIdentity, // 特殊身分標記為無優惠，觸發一般顯示格式
                        promoName: activeComboPromo.label || combo.name, 
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
        if (activePromo) {
            finalTotal += activePromo.price;
            receiptItems.push({
                name: item.name,
                originalPrice: item.price,
                finalPrice: activePromo.price,
                hasPromo: true,
                promoName: activePromo.label,
                isCombo: false
            });
        } else {
            finalTotal += item.price;
            receiptItems.push({
                name: item.name,
                originalPrice: item.price,
                finalPrice: item.price,
                hasPromo: false,
                promoName: '',
                isCombo: false
            });
        }
    });

    // 3. 全館身分折扣 (依您原有的身分邏輯計算)
    let discountRate = 1.0;
    let identityName = '';
    if (currentIdentity === 'student') { discountRate = 0.9; identityName = '學生 (9折)'; }
    else if (currentIdentity === 'birthday') { discountRate = 0.8; identityName = '壽星 (8折)'; }
    // 如果有 vip 等其他身分可在此擴充...

    if (discountRate < 1.0) {
        finalTotal = Math.round(finalTotal * discountRate);
        appliedPromoText = identityName;
    } else {
        const promoNames = [...new Set(receiptItems.filter(i => i.hasPromo).map(i => i.promoName))];
        if (promoNames.length > 0) appliedPromoText = promoNames.join(', ');
    }

    let savings = originalTotal - finalTotal;

    currentReceiptData = { receiptItems, originalTotal, finalTotal, savings, appliedPromoName: appliedPromoText };

    // 4. 更新明細清單 DOM
    if (DOM.selectedItemsList) DOM.selectedItemsList.innerHTML = '';
    
    if (receiptItems.length === 0) {
        if (DOM.selectedItemsList) DOM.selectedItemsList.innerHTML = '<li style="color: #999; text-align: center;">尚未選擇服務</li>';
    } else {
        receiptItems.forEach(item => {
            const li = document.createElement('li');
            li.style.marginBottom = '6px';
            li.style.borderBottom = '1px dashed #eee';
            li.style.paddingBottom = '4px';
            
            // 情境 A：有套用優惠的格式
            if (item.hasPromo) {
                let comboBadge = item.isCombo ? `<span style="color: #ff9800; font-size: 0.85em; margin-left: 4px;">🎁 組合優惠</span>` : '';
                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <span>${item.name} ${comboBadge}</span>
                        <span style="color: var(--danger-color); font-weight: bold;">$${item.finalPrice}</span>
                    </div>
                    <div style="text-align: right; font-size: 0.85em; color: #999; text-decoration: line-through;">
                        原價 $${item.originalPrice}
                    </div>
                `;
            } 
            // 情境 B：一般顯示格式 (含學生壽星點組合的紅字備註)
            else {
                let noteHtml = '';
                if (item.isCombo && isSpecialIdentity) {
                    const idName = currentIdentity === 'birthday' ? '壽星' : '學生';
                    noteHtml = `<div style="text-align: right; font-size: 0.85em; color: var(--danger-color, #dc3545); margin-top: 2px;">【${idName}無組合優惠】</div>`;
                }

                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <span>${item.name}</span>
                        <span>$${item.originalPrice}</span>
                    </div>
                    ${noteHtml}
                `;
            }
            if (DOM.selectedItemsList) DOM.selectedItemsList.appendChild(li);
        });
    }

    // 5. 動態更新總計區塊
    const discountedTotalPNode = document.getElementById('discounted-total-p');

    if (savings > 0) {
        if (DOM.originalTotalP) {
            DOM.originalTotalP.style.display = 'block';
            if (DOM.originalTotal) DOM.originalTotal.textContent = originalTotal.toLocaleString();
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

    // 點數計算
    let points = Math.floor(finalTotal / 100);
    if (DOM.pointsContainer) {
        if (points > 0) {
            DOM.pointsContainer.style.display = 'block';
            if (DOM.points) DOM.points.textContent = points;
        } else {
            DOM.pointsContainer.style.display = 'none';
        }
    }
}

// ==========================================
// 4. 匯出截圖功能
// ==========================================
function exportAsPNG() {
    if (!currentReceiptData || currentReceiptData.receiptItems.length === 0) {
        showNotice('請先選擇服務項目再產生截圖！');
        return;
    }

    const btn = DOM.screenshotBtn;
    const originalText = btn.textContent;
    btn.textContent = '產生中...';
    btn.disabled = true;

    const receiptDiv = document.createElement('div');
    receiptDiv.style.position = 'absolute';
    receiptDiv.style.left = '-9999px';
    receiptDiv.style.top = '0';
    receiptDiv.style.width = '400px';
    receiptDiv.style.backgroundColor = '#fff';
    receiptDiv.style.padding = '30px';
    receiptDiv.style.borderRadius = '12px';
    receiptDiv.style.boxShadow = '0 10px 30px rgba(0,0,0,0.1)';
    receiptDiv.style.fontFamily = 'sans-serif';
    receiptDiv.style.color = '#333';
    receiptDiv.style.lineHeight = '1.5';

    let html = `
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px;">
            <h2 style="margin: 0 0 5px 0; color: #111;">德德美體美容中心</h2>
            <div style="font-size: 0.9em; color: #666;">專屬估價單</div>
            <div style="font-size: 0.8em; color: #999; margin-top: 5px;">建立時間：${new Date().toLocaleString('zh-TW')}</div>
        </div>
        <div style="margin-bottom: 20px;">
    `;

    const isSpecialIdentity = (currentIdentity === 'student' || currentIdentity === 'birthday');

    currentReceiptData.receiptItems.forEach(item => {
        if (item.hasPromo) {
            let comboBadge = item.isCombo ? `<span style="color: #ff9800; font-size: 0.85em; margin-left: 4px;">🎁 組合優惠</span>` : '';
            html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <div style="flex: 1; padding-right: 10px;">
                    <div style="font-weight: 500;">${item.name} ${comboBadge}</div>
                    <div style="font-size: 0.85em; color: #888;">原價 $${item.originalPrice}</div>
                </div>
                <div style="text-align: right; font-weight: bold; color: #d84315;">
                    $${item.finalPrice}
                </div>
            </div>`;
        } else {
            let noteHtml = '';
            if (item.isCombo && isSpecialIdentity) {
                const idName = currentIdentity === 'birthday' ? '壽星' : '學生';
                noteHtml = `<div style="font-size: 0.85em; color: #dc3545; text-align: right; margin-top: 2px;">【${idName}無組合優惠】</div>`;
            }
            
            html += `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between;">
                    <div style="flex: 1; padding-right: 10px; font-weight: 500;">${item.name}</div>
                    <div style="text-align: right;">$${item.originalPrice}</div>
                </div>
                ${noteHtml}
            </div>`;
        }
    });

    html += `</div>`;
    html += `<div style="border-top: 2px dashed #ccc; padding-top: 15px; text-align: right; font-size: 1em; line-height: 1.6;">`;
    
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

    html += `</div>`;

    receiptDiv.innerHTML = html;
    document.body.appendChild(receiptDiv);

    html2canvas(receiptDiv, { scale: 2, useCORS: true }).then(canvas => {
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
        btn.textContent = originalText;
        btn.disabled = false;
    });
}

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
    setTimeout(() => { 
        if (document.getElementById('sw-notice')) document.getElementById('sw-notice').remove(); 
    }, 3000);
}
