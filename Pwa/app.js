// 全域變數，供 dede.html 和 check.html 共用
let serviceData = null;
let allServices = new Map();

/**
 * 載入服務資料的核心函式
 * 採用網路優先，若失敗則讀取 PWA 快取的策略 (Network-first, cache fallback)
 * @returns {Promise<object|null>} 成功時回傳服務資料物件，全部失敗時回傳 null
 */
async function loadServiceData() {
    // 策略1：網路優先 (Network First)
    try {
        // 使用 'reload' 選項繞過瀏覽器 HTTP 快取，確保向網路發送請求。
        // 這能讓 Service Worker 有機會攔截並提供最新的快取或更新快取。
        const response = await fetch('services.json', { cache: 'reload' });
        if (!response.ok) {
            // 如果伺服器回傳錯誤 (如 404, 500)，也應視為網路失敗，轉而嘗試快取
            throw new Error(`伺服器回應錯誤: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('成功從網路載入 services.json');
        return data;
    } catch (networkError) {
        console.warn('網路請求 services.json 失敗:', networkError.message);
        console.log('嘗試從 PWA 快取中讀取...');

        // 策略2：讀取快取 (Cache Fallback)
        try {
            // 確保 Service Worker 使用的快取名稱與這裡一致
            const cache = await caches.open('price-calculator-v5.1');
            // 查詢沒有 cache-busting 參數的原始 URL，這才是 Service Worker 快取的鍵
            const cachedResponse = await cache.match('services.json');
            if (cachedResponse) {
                console.log('成功從 PWA 快取載入 services.json');
                return await cachedResponse.json();
            } else {
                console.error('PWA 快取中也找不到 services.json');
                return null; // 快取中也沒有資料
            }
        } catch (cacheError) {
            console.error('讀取 PWA 快取時發生錯誤:', cacheError);
            return null; // 讀取快取也失敗
        }
    }
}

/**
 * 根據載入的資料初始化頁面通用邏輯
 */
function initializePage() {
    // 將所有服務項目扁平化存入 Map，方便快速查找
    allServices = new Map(serviceData.categories.flatMap(cat => cat.items).map(item => [item.id, item]));

    // 根據目前在哪個頁面，執行不同的初始化函式
    if (document.getElementById('promo-container')) {
        initCheckPage();
    }
    if (document.getElementById('service-list')) {
        initCalculatorPage();
    }
}

/**
 * 應用程式進入點 (DOM 載入完成後執行)
 */
document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay();
    try {
        serviceData = await loadServiceData();

        if (serviceData) {
            initializePage();
        } else {
            // 網路和快取都載入失敗，才顯示最終錯誤
            throw new Error('無法從網路或快取載入服務資料，請檢查您的網路連線後再試。');
        }
    } catch (error) {
        console.error('初始化應用程式失敗:', error);
        // 顯示最終的錯誤訊息給使用者
        document.body.innerHTML = `<div style="padding: 20px; text-align: center;"><h1>載入錯誤</h1><p>無法載入必要的服務資料。</p><p><em>${error.message}</em></p></div>`;
    } finally {
        // 無論成功或失敗，最後都必須移除載入畫面，避免卡住
        removeLoadingOverlay();
    }
});


// --- 以下為原有函式，保持不變 ---

function showLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.9); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    overlay.innerHTML = '<div style="text-align: center;"><p style="font-size: 1.2em; color: #333;">正在載入服務項目...</p></div>';
    document.body.appendChild(overlay);
}

function removeLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// --- 價格計算器頁面 (dede.html) 的邏輯 ---
function initCalculatorPage() {
    const STORAGE_KEY = 'serviceCalculatorState_v3';

    // DOM 元素快取
    const dom = {
        serviceListContainer: document.getElementById('service-list'),
        searchInput: document.getElementById('search-input'),
        isBirthdayPerson: document.getElementById('isBirthdayPerson'),
        isStudent: document.getElementById('isStudent'),
        toast: document.getElementById('toast-notification'),
        floatingSummary: document.getElementById('floating-summary'),
        toggleDetailsBtn: document.getElementById('toggle-details'),
        saveBtn: document.getElementById('save-btn'),
        loadBtn: document.getElementById('load-btn'),
        clearBtn: document.getElementById('clear-btn'),
        shareLinkBtn: document.getElementById('share-link-btn'),
        screenshotBtn: document.getElementById('screenshot-btn'),
        originalTotalP: document.getElementById('original-total-p'),
        discountedTotalP: document.getElementById('discounted-total-p'),
        pointsP: document.getElementById('points-p'), // 新增 DOM 元素
        originalTotalSpan: document.getElementById('floating-original-total'),
        discountedTotalSpan: document.getElementById('floating-discounted-total'),
        pointsSpan: document.getElementById('floating-points'), // 新增 DOM 元素
        savingsContainer: document.getElementById('savings-container'),
        savingsSpan: document.getElementById('floating-savings'),
        selectedItemsListUl: document.querySelector('#floating-selected-items-list ul'),
        discountNoteContainer: document.getElementById('discount-note-container'),
        discountNoteSpan: document.querySelector('#discount-note-container .discount-note')
    };

    // --- 輔助函式 ---
    function getTaipeiDate() {
        const now = new Date();
        const taipeiDateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
        return new Date(taipeiDateString);
    }

    function getActivePromotion(item, today) {
        if (!item.promotions || item.promotions.length === 0) return null;
        for (const promo of item.promotions) {
            const startDate = new Date(promo.start);
            const endDate = new Date(promo.end);
            if (today >= startDate && today <= endDate) return promo;
        }
        return null;
    }

    function showToast(message) {
        dom.toast.textContent = message;
        dom.toast.classList.add('show');
        setTimeout(() => dom.toast.classList.remove('show'), 2000);
    }
    
    // --- 核心渲染與計算邏輯 ---
    function renderServices() {
        const today = getTaipeiDate();
        dom.serviceListContainer.innerHTML = '';
        serviceData.categories.forEach(category => {
            const fieldset = document.createElement('fieldset');
            const legend = document.createElement('legend');
            legend.textContent = category.name;
            fieldset.appendChild(legend);
            category.items.forEach(service => {
                const div = document.createElement('div');
                div.className = 'service-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.id = service.id; checkbox.value = service.id;
                const label = document.createElement('label');
                label.htmlFor = service.id; label.textContent = service.name;
                const priceDiv = document.createElement('div');
                priceDiv.className = 'price-info';
                
                const activePromo = getActivePromotion(service, today);
                priceDiv.innerHTML = activePromo ?
                    `<span class="promotion-price">$${activePromo.price.toLocaleString()}</span> <span class="original-price">$${service.price.toLocaleString()}</span>` :
                    `<span>$${service.price.toLocaleString()}</span>`;

                div.appendChild(checkbox); div.appendChild(label); div.appendChild(priceDiv);
                fieldset.appendChild(div);
            });
            dom.serviceListContainer.appendChild(fieldset);
        });
    }

    function calculatePrices() {
        const selectedIds = new Set(Array.from(document.querySelectorAll('#service-list input:checked')).map(cb => cb.value));
        const today = getTaipeiDate();
        let originalTotal = 0, promoTotal = 0;
        const processedIds = new Set(), displayItems = [], appliedPromoLabels = new Set();
        serviceData.combos.forEach(combo => {
            const activeComboPromo = getActivePromotion(combo, today);
            if (activeComboPromo && combo.itemIds.every(id => selectedIds.has(id))) {
                const comboOriginalPrice = combo.itemIds.reduce((sum, id) => sum + allServices.get(id).price, 0);
                originalTotal += comboOriginalPrice;
                promoTotal += activeComboPromo.price;
                displayItems.push({ type: 'combo', comboInfo: combo, originalPrice: comboOriginalPrice, finalPrice: activeComboPromo.price, promo: activeComboPromo });
                appliedPromoLabels.add(activeComboPromo.label);
                combo.itemIds.forEach(id => processedIds.add(id));
            }
        });
        selectedIds.forEach(id => {
            if (!processedIds.has(id)) {
                const service = allServices.get(id);
                if (service) {
                    const activeServicePromo = getActivePromotion(service, today);
                    const servicePrice = activeServicePromo ? activeServicePromo.price : service.price;
                    originalTotal += service.price;
                    promoTotal += servicePrice;
                    displayItems.push({ type: 'service', serviceInfo: service, originalPrice: service.price, finalPrice: servicePrice, promo: activeServicePromo });
                    if(activeServicePromo) appliedPromoLabels.add(activeServicePromo.label);
                }
            }
        });
        let finalPrice = promoTotal;
        let discountType = appliedPromoLabels.size > 0 ? [...appliedPromoLabels].join(', ') : '無';
        const potentialDiscounts = [{ price: finalPrice, type: discountType }];
        if (dom.isBirthdayPerson.checked) potentialDiscounts.push({ price: originalTotal * 0.5, type: '壽星原價 5 折' });
        if (dom.isStudent.checked) potentialDiscounts.push({ price: originalTotal * 0.8, type: '學生原價 8 折' });
        const bestDiscount = potentialDiscounts.reduce((best, current) => current.price < best.price ? current : best, potentialDiscounts[0]);
        finalPrice = bestDiscount.price;
        discountType = bestDiscount.type;

        // 計算點數
        const earnedPoints = Math.floor(finalPrice / 1500);

        return {
            originalTotal: Math.round(originalTotal),
            finalTotal: Math.round(finalPrice),
            savedAmount: Math.round(originalTotal - finalPrice),
            appliedDiscount: discountType,
            displayItems,
            earnedPoints // 新增回傳點數
        };
    }

    function updateDisplay(result) {
        if (result.savedAmount > 0) {
            dom.originalTotalP.style.display = 'block';
            dom.savingsContainer.style.display = 'block';
            dom.discountNoteContainer.style.display = 'block';
            dom.originalTotalSpan.textContent = result.originalTotal.toLocaleString();
            dom.savingsSpan.textContent = result.savedAmount.toLocaleString();
            dom.discountNoteSpan.textContent = `套用最佳優惠方案： ${result.appliedDiscount}`;
        } else {
            dom.originalTotalP.style.display = 'none';
            dom.savingsContainer.style.display = 'none';
            dom.discountNoteContainer.style.display = 'none';
        }

        // 更新點數顯示
        dom.pointsP.style.display = 'block';
        dom.pointsSpan.textContent = result.earnedPoints;

        dom.discountedTotalSpan.textContent = result.finalTotal.toLocaleString();
        dom.discountedTotalP.firstChild.nodeValue = result.savedAmount > 0 ? '折扣後總金額：' : '總金額：';
        dom.selectedItemsListUl.innerHTML = '';
        const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');
        result.displayItems.forEach(item => {
            if (isIdentityDiscount) {
                const servicesToRender = item.type === 'service' ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
                servicesToRender.forEach(service => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="item-name">${service.name}</span><span class="item-price-detail"><span>$${service.price.toLocaleString()}</span></span>`;
                    dom.selectedItemsListUl.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                const name = item.type === 'combo' ? item.comboInfo.name : item.serviceInfo.name;
                const priceHtml = item.promo ?
                    `<span class="promotion-price">$${item.finalPrice.toLocaleString()}</span> <span class="original-price">$${item.originalPrice.toLocaleString()}</span>` :
                    `<span>$${item.originalPrice.toLocaleString()}</span>`;
                li.innerHTML = `<span class="item-name">${name}</span><span class="item-price-detail">${priceHtml}</span>`;
                dom.selectedItemsListUl.appendChild(li);
            }
        });
    }

    // --- 功能函式 ---
    function handleInteraction() {
        const result = calculatePrices();
        updateDisplay(result);
    }
    
    function saveState() {
        const state = {
            services: Array.from(document.querySelectorAll('#service-list input:checked')).map(cb => cb.id),
            isBirthday: dom.isBirthdayPerson.checked,
            isStudent: dom.isStudent.checked
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        showToast('已儲存當前選擇！');
    }

    function loadState() {
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (savedState) {
            clearSelections(false);
            const state = JSON.parse(savedState);
            applyState(state);
            showToast('已載入上次選擇！');
        } else {
            showToast('沒有找到儲存的紀錄。');
        }
    }

    function clearSelections(showMsg = true) {
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        handleInteraction();
        if (showMsg) showToast('已清除所有選項。');
    }

    function filterServices() {
        const query = dom.searchInput.value.toLowerCase().trim();
        dom.serviceListContainer.querySelectorAll('fieldset').forEach(fieldset => {
            let hasVisibleItem = false;
            fieldset.querySelectorAll('.service-item').forEach(item => {
                const itemName = item.querySelector('label').textContent.toLowerCase();
                const isMatch = itemName.includes(query);
                item.style.display = isMatch ? 'flex' : 'none';
                if (isMatch) hasVisibleItem = true;
            });
            fieldset.style.display = hasVisibleItem ? 'block' : 'none';
        });
    }

    function generateShareableLink() {
        const state = {
            services: Array.from(document.querySelectorAll('#service-list input:checked')).map(cb => cb.id),
            isBirthday: dom.isBirthdayPerson.checked,
            isStudent: dom.isStudent.checked
        };
        const base64String = btoa(JSON.stringify(state));
        const url = new URL(window.location.href);
        url.search = `?c=${base64String}`;
        
        navigator.clipboard.writeText(url.href)
            .then(() => showToast('分享網址已複製到剪貼簿！'))
            .catch(() => showToast('複製失敗，請手動複製網址。'));
    }

    function exportAsPNG() {
        const result = calculatePrices();
        if (result.displayItems.length === 0) {
            showToast('請先選擇服務項目再輸出。');
            return;
        }

        const imageSource = document.createElement('div');
        imageSource.style.cssText = 'width: 450px; padding: 25px; background-color: #ffffff; font-family: sans-serif; color: #333; position: absolute; left: -9999px; border: 1px solid #ddd;';
        const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');
        let itemsHtml = result.displayItems.map(item => {
            let itemHtml = '';
            if (item.type === 'combo' && !isIdentityDiscount && item.promo) {
                 return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;"><span>${item.comboInfo.name}</span><span style="white-space: nowrap; margin-left: 15px;"><strong style="color: #dc3545;">$${item.finalPrice.toLocaleString()}</strong><span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${item.originalPrice.toLocaleString()}</span></span></div>`;
            }
            const servicesToRender = (item.type === 'service') ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
            servicesToRender.forEach(service => {
                const activePromo = getActivePromotion(service, getTaipeiDate());
                const priceHtml = isIdentityDiscount ? `<span>$${service.price.toLocaleString()}</span>` : (activePromo && !isIdentityDiscount ? `<strong style="color: #dc3545;">$${activePromo.price.toLocaleString()}</strong> <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${service.price.toLocaleString()}</span>` : `<span>$${service.price.toLocaleString()}</span>`);
                itemHtml += `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;"><span>${service.name}</span><span style="white-space: nowrap; margin-left: 15px;">${priceHtml}</span></div>`;
            });
            return itemHtml;
        }).join('');
        let totalsHtml = result.savedAmount > 0 ? `<p style="margin: 4px 0;">原始總金額: ${result.originalTotal.toLocaleString()} 元</p><p style="margin: 4px 0; font-size: 0.9em; color: #28a745;"><strong>套用最佳優惠方案： ${result.appliedDiscount}</strong></p><p style="margin: 4px 0; font-size: 1.1em; color: #28a745;"><strong>共節省: ${result.savedAmount.toLocaleString()} 元</strong></p><p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>折扣後總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p><p style="margin: 4px 0; font-size: 1.1em; color: #007bff;"><strong>獲得消費點數：<span style="color: #007bff;">${result.earnedPoints.toLocaleString()}</span> 點</strong></p>` : `<p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p><p style="margin: 4px 0; font-size: 1.1em; color: #007bff;"><strong>獲得消費點數：<span style="color: #007bff;">${result.earnedPoints.toLocaleString()}</span> 點</strong></p>`;
        const now = new Date();
        const rocYear = now.getFullYear() - 1911;
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        imageSource.innerHTML = `<h3 style="color: #0056b3; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin: 0 0 15px 0;">德德美體美容中心 - 消費明細</h3><div style="margin-bottom: 20px;">${itemsHtml}</div><div style="text-align: right;">${totalsHtml}</div><p style="text-align: center; font-size: 0.7em; color: #999; margin-top: 20px;">價格版本: ${rocYear}年${month}月版</p>`;
        document.body.appendChild(imageSource);
        html2canvas(imageSource, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            link.download = `德德美體-${rocYear}${month}${day}${hours}${minutes}${seconds}.png`;
            link.click();
            document.body.removeChild(imageSource);
            showToast('圖片已開始下載！');
        }).catch(err => {
            console.error('oops, something went wrong!', err);
            document.body.removeChild(imageSource);
            showToast('圖片輸出失敗，請稍後再試。');
        });
    }
    
    function applyState(state) {
        if (!state) return;
        if (state.services) {
            state.services.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
        }
        dom.isBirthdayPerson.checked = state.isBirthday || false;
        dom.isStudent.checked = state.isStudent || false;
        handleInteraction();
    }
    
    function applyStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        const config = params.get('c');
        if (config) {
            try {
                applyState(JSON.parse(atob(config)));
            } catch(e) {
                console.error("無法解析網址中的設定:", e);
                showToast("網址中的設定格式有誤。");
            }
        }
    }

    // --- 初始化與事件綁定 ---
    renderServices();
    applyStateFromURL();
    handleInteraction();

    const observer = new ResizeObserver(entries => {
        document.body.style.paddingBottom = `${entries[0].contentRect.height}px`;
    });
    observer.observe(dom.floatingSummary);

    dom.serviceListContainer.addEventListener('change', handleInteraction);
    dom.isBirthdayPerson.addEventListener('change', handleInteraction);
    dom.isStudent.addEventListener('change', handleInteraction);
    dom.searchInput.addEventListener('input', filterServices);
    
    dom.toggleDetailsBtn.addEventListener('click', () => {
        dom.floatingSummary.classList.toggle('partial-expand');
    });

    dom.saveBtn.addEventListener('click', saveState);
    dom.loadBtn.addEventListener('click', loadState);
    dom.clearBtn.addEventListener('click', () => clearSelections(true));
    dom.shareLinkBtn.addEventListener('click', generateShareableLink);
    dom.screenshotBtn.addEventListener('click', exportAsPNG);
}

// --- 促銷檢查頁面 (check.html) 的邏輯 ---
function initCheckPage() {
    const container = document.getElementById('promo-container');
    function getTaipeiDateString() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()); }
    function getPromoStatus(promo, todayString) {
        if (todayString < promo.start) return { text: '尚未開始', class: 'upcoming' };
        if (todayString > promo.end) return { text: '已過期', class: 'expired' };
        return { text: '生效中', class: 'active' };
    }
    const today = getTaipeiDateString();
    container.innerHTML = `<h1>促銷設定總覽</h1><p class="note">此報告僅供內部檢查設定使用。所有日期的判斷基準日 (台北時間): <strong>${today}</strong></p>`;
    serviceData.categories.forEach(category => {
        let tableHtml = `<h2>${category.name}</h2><table><thead><tr><th>服務項目</th><th>原價</th><th>促銷活動</th><th>促銷價</th><th>折扣</th><th>開始日期</th><th>結束日期</th><th>狀態</th></tr></thead><tbody>`;
        category.items.forEach(item => {
            if (!item.promotions || item.promotions.length === 0) {
                tableHtml += `<tr><td data-label="服務項目">${item.name}</td><td data-label="原價" style="text-align: right;">${item.price.toLocaleString()}</td><td colspan="6" class="no-promo">無</td></tr>`;
            } else {
                item.promotions.forEach((promo, index) => {
                    const status = getPromoStatus(promo, today);
                    const discountAmount = item.price - promo.price;
                    const discountPercentage = (discountAmount / item.price) * 100;
                    const discountText = `省 ${discountAmount.toLocaleString()} (${discountPercentage.toFixed(1)}%)`;
                    tableHtml += `<tr>
                        ${index === 0 ? `<td data-label="服務項目" rowspan="${item.promotions.length}">${item.name}</td><td data-label="原價" rowspan="${item.promotions.length}" style="text-align: right;">${item.price.toLocaleString()}</td>` : ''}
                        <td data-label="促銷活動">${promo.label}</td><td data-label="促銷價" style="text-align: right;">${promo.price.toLocaleString()}</td><td data-label="折扣" class="discount-info">${discountText}</td><td data-label="開始日期">${promo.start}</td><td data-label="結束日期">${promo.end}</td><td data-label="狀態"><span class="status ${status.class}">${status.text}</span></td>
                    </tr>`;
                });
            }
        });
        tableHtml += '</tbody></table>';
        container.innerHTML += tableHtml;
    });
    let comboTableHtml = `<h2>組合優惠</h2><table><thead><tr><th>組合名稱</th><th>包含項目</th><th>原價</th><th>促銷活動</th><th>促銷價</th><th>折扣</th><th>開始日期</th><th>結束日期</th><th>狀態</th></tr></thead><tbody>`;
    serviceData.combos.forEach(combo => {
         if (combo.promotions && combo.promotions.length > 0) {
            const itemNames = combo.itemIds.map(id => allServices.get(id)?.name || '<span style="color:red;">錯誤ID</span>').join('<br>');
            const comboOriginalPrice = combo.itemIds.reduce((sum, id) => sum + (allServices.get(id)?.price || 0), 0);
            combo.promotions.forEach((promo, index) => {
                const status = getPromoStatus(promo, today);
                const discountAmount = comboOriginalPrice - promo.price;
                const discountPercentage = comboOriginalPrice > 0 ? (discountAmount / comboOriginalPrice) * 100 : 0;
                const discountText = `省 ${discountAmount.toLocaleString()} (${discountPercentage.toFixed(1)}%)`;
                comboTableHtml += `<tr>
                    ${index === 0 ? `<td data-label="組合名稱" rowspan="${combo.promotions.length}">${combo.name}</td><td data-label="包含項目" rowspan="${combo.promotions.length}">${itemNames}</td><td data-label="原價" rowspan="${combo.promotions.length}" style="text-align: right;">${comboOriginalPrice.toLocaleString()}</td>` : ''}
                    <td data-label="促銷活動">${promo.label}</td><td data-label="促銷價" style="text-align: right;">${promo.price.toLocaleString()}</td><td data-label="折扣" class="discount-info">${discountText}</td><td data-label="開始日期">${promo.start}</td><td data-label="結束日期">${promo.end}</td><td data-label="狀態"><span class="status ${status.class}">${status.text}</span></td>
                </tr>`;
            });
         }
    });
    comboTableHtml += '</tbody></table>';
    container.innerHTML += comboTableHtml;
}

}
