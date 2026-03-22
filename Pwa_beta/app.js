// 全域變數
let serviceData = null;
let allServices = new Map();

/**
 * 載入服務資料的核心函式
 */
async function loadServiceData() {
    try {
        const response = await fetch('services.json', { cache: 'reload' });
        if (!response.ok) throw new Error(`伺服器回應錯誤: ${response.status}`);
        return await response.json();
    } catch (networkError) {
        console.warn('網路請求 services.json 失敗:', networkError.message, '嘗試從快取讀取...');
        try {
            const cache = await caches.open('price-calculator-v5.1');
            const cachedResponse = await cache.match('services.json');
            if (cachedResponse) return await cachedResponse.json();
            throw new Error('快取中也找不到 services.json');
        } catch (cacheError) {
            console.error('讀取快取失敗:', cacheError);
            return null;
        }
    }
}

/**
 * 初始化頁面通用邏輯
 */
function initializePage() {
    allServices = new Map(serviceData.categories.flatMap(cat => cat.items).map(item => [item.id, item]));
    if (document.getElementById('service-list')) {
        initCalculatorPage();
    }
}

/**
 * 應用程式進入點
 */
document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay();
    try {
        serviceData = await loadServiceData();
        if (serviceData) {
            initializePage();
        } else {
            throw new Error('無法從網路或快取載入服務資料。');
        }
    } catch (error) {
        console.error('初始化應用程式失敗:', error);
        document.body.innerHTML = `<div style="padding: 20px; text-align: center;"><h1>載入錯誤</h1><p>${error.message}</p></div>`;
    } finally {
        removeLoadingOverlay();
    }
});

function showLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.9); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    overlay.innerHTML = '<p style="font-size: 1.2em; color: #333;">正在載入服務項目...</p>';
    document.body.appendChild(overlay);
}

function removeLoadingOverlay() {
    document.getElementById('loading-overlay')?.remove();
}

// --- 價格計算器頁面 (dede.html) 的邏輯 ---
function initCalculatorPage() {
    const STORAGE_KEY = 'serviceCalculatorState_v3';

    // DOM 元素快取
    const dom = {
        serviceListContainer: document.getElementById('service-list'),
        searchInput: document.getElementById('search-input'),
        searchActionsContainer: document.getElementById('search-actions'),
        selectAllFilteredBtn: document.getElementById('select-all-filtered-btn'),
        deselectAllFilteredBtn: document.getElementById('deselect-all-filtered-btn'),
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
        originalTotalSpan: document.getElementById('floating-original-total'),
        discountedTotalSpan: document.getElementById('floating-discounted-total'),
        savingsContainer: document.getElementById('savings-container'),
        savingsSpan: document.getElementById('floating-savings'),
        pointsContainer: document.getElementById('points-container'),
        pointsSpan: document.getElementById('floating-points'),
        selectedItemsListUl: document.querySelector('#floating-selected-items-list ul'),
        discountNoteContainer: document.getElementById('discount-note-container'),
        discountNoteSpan: document.querySelector('#discount-note-container .discount-note')
    };

    // --- 輔助函式 ---
    const getTaipeiDate = () => new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()));
    
    function getActivePromotion(item, today) {
        if (!item.promotions) return null;
        return item.promotions.find(promo => {
            const startDate = new Date(promo.start);
            const endDate = new Date(promo.end);
            return today >= startDate && today <= endDate;
        });
    }

    function showToast(message) {
        dom.toast.textContent = message;
        dom.toast.classList.add('show');
        setTimeout(() => dom.toast.classList.remove('show'), 2000);
    }
    
    // --- 核心渲染與計算邏輯 ---
    function renderServices() {
        const today = getTaipeiDate();
        dom.serviceListContainer.innerHTML = serviceData.categories.map(category => `
            <fieldset>
                <legend>${category.name}</legend>
                ${category.items.map(service => {
                    const activePromo = getActivePromotion(service, today);
                    const priceHtml = activePromo 
                        ? `<span class="promotion-price">$${activePromo.price.toLocaleString()}</span> <span class="original-price">$${service.price.toLocaleString()}</span>`
                        : `<span>$${service.price.toLocaleString()}</span>`;
                    return `
                        <div class="service-item">
                            <input type="checkbox" id="${service.id}" value="${service.id}">
                            <label for="${service.id}">${service.name}</label>
                            <div class="price-info">${priceHtml}</div>
                        </div>`;
                }).join('')}
            </fieldset>
        `).join('');
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
        
        const potentialDiscounts = [{ price: promoTotal, type: appliedPromoLabels.size > 0 ? [...appliedPromoLabels].join(', ') : '無' }];
        if (dom.isBirthdayPerson.checked) potentialDiscounts.push({ price: originalTotal * 0.5, type: '壽星原價 5 折' });
        if (dom.isStudent.checked) potentialDiscounts.push({ price: originalTotal * 0.8, type: '學生原價 8 折' });
        const bestDiscount = potentialDiscounts.reduce((best, current) => current.price < best.price ? current : best);
        
        const finalPrice = bestDiscount.price;
        const discountType = bestDiscount.type;
        const points = Math.floor(finalPrice / 1500);

        return {
            originalTotal: Math.round(originalTotal),
            finalTotal: Math.round(finalPrice),
            savedAmount: Math.round(originalTotal - finalPrice),
            appliedDiscount: discountType,
            displayItems,
            points
        };
    }

    function updateDisplay(result) {
        const hasSavings = result.savedAmount > 0;
        dom.originalTotalP.style.display = hasSavings ? 'block' : 'none';
        dom.savingsContainer.style.display = hasSavings ? 'block' : 'none';
        dom.discountNoteContainer.style.display = hasSavings ? 'block' : 'none';

        if(hasSavings) {
            dom.originalTotalSpan.textContent = result.originalTotal.toLocaleString();
            dom.savingsSpan.textContent = result.savedAmount.toLocaleString();
            dom.discountNoteSpan.textContent = `套用優惠：${result.appliedDiscount}`;
        }
        
        dom.discountedTotalSpan.textContent = result.finalTotal.toLocaleString();
        dom.discountedTotalP.firstChild.nodeValue = hasSavings ? '折扣後總金額：' : '總金額：';
        dom.pointsContainer.style.display = result.points > 0 ? 'block' : 'none';
        dom.pointsSpan.textContent = result.points.toLocaleString();

        const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');
        
        dom.selectedItemsListUl.innerHTML = result.displayItems.flatMap(item => {
            if (isIdentityDiscount) {
                const services = item.type === 'service' ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
                return services.map(service => `<li><span class="item-name">${service.name}</span><span class="item-price-detail"><span>$${service.price.toLocaleString()}</span></span></li>`);
            } else {
                const name = item.type === 'combo' ? item.comboInfo.name : item.serviceInfo.name;
                const priceHtml = item.promo
                    ? `<span class="promotion-price">$${item.finalPrice.toLocaleString()}</span> <span class="original-price">$${item.originalPrice.toLocaleString()}</span>`
                    : `<span>$${item.originalPrice.toLocaleString()}</span>`;
                return `<li><span class="item-name">${name}</span><span class="item-price-detail">${priceHtml}</span></li>`;
            }
        }).join('');
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
    
    function toggleSearchActionButtons() {
        const hasQuery = dom.searchInput.value.trim().length > 0;
        dom.searchActionsContainer.style.display = hasQuery ? 'flex' : 'none';
    }

    function selectFiltered(select) {
        dom.serviceListContainer.querySelectorAll('.service-item').forEach(item => {
            if (item.style.display !== 'none') {
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = select;
            }
        });
        handleInteraction();
        showToast(select ? '已全選篩選結果' : '已取消全選篩選結果');
    }

    function filterServices() {
        const rawQuery = dom.searchInput.value.toLowerCase().trim();
        const searchPhrases = rawQuery.split(',').map(p => p.trim()).filter(Boolean);

        dom.serviceListContainer.querySelectorAll('fieldset').forEach(fieldset => {
            let hasVisibleItem = false;
            fieldset.querySelectorAll('.service-item').forEach(item => {
                const itemName = item.querySelector('label').textContent.toLowerCase();
                const isMatch = searchPhrases.length === 0 || searchPhrases.some(phrase => itemName.includes(phrase));
                item.style.display = isMatch ? 'flex' : 'none';
                if (isMatch) hasVisibleItem = true;
            });
            fieldset.style.display = hasVisibleItem ? 'block' : 'none';
        });
        toggleSearchActionButtons();
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
            .then(() => showToast('分享網址已複製！'))
            .catch(() => showToast('複製失敗。'));
    }

    function exportAsPNG() {
        const result = calculatePrices();
        if (result.displayItems.length === 0) {
            showToast('請先選擇服務項目。');
            return;
        }

        const imageSource = document.createElement('div');
        imageSource.style.cssText = 'width: 450px; padding: 25px; background-color: #ffffff; font-family: sans-serif; color: #333; position: absolute; left: -9999px; border: 1px solid #ddd;';
        const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');
        
        const itemsHtml = result.displayItems.flatMap(item => {
            if (item.type === 'combo' && !isIdentityDiscount && item.promo) {
                 return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;"><span>${item.comboInfo.name}</span><span style="white-space: nowrap; margin-left: 15px;"><strong style="color: #dc3545;">$${item.finalPrice.toLocaleString()}</strong><span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${item.originalPrice.toLocaleString()}</span></span></div>`;
            }
            const servicesToRender = (item.type === 'service') ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
            return servicesToRender.map(service => {
                const activePromo = getActivePromotion(service, getTaipeiDate());
                const priceHtml = isIdentityDiscount ? `<span>$${service.price.toLocaleString()}</span>` : (activePromo && !isIdentityDiscount ? `<strong style="color: #dc3545;">$${activePromo.price.toLocaleString()}</strong> <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${service.price.toLocaleString()}</span>` : `<span>$${service.price.toLocaleString()}</span>`);
                return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;"><span>${service.name}</span><span style="white-space: nowrap; margin-left: 15px;">${priceHtml}</span></div>`;
            });
        }).join('');

        let totalsHtml = result.savedAmount > 0 
            ? `<p style="margin: 4px 0;">原始總金額: ${result.originalTotal.toLocaleString()} 元</p><p style="margin: 4px 0; font-size: 0.9em; color: #28a745;"><strong>套用優惠：${result.appliedDiscount}</strong></p><p style="margin: 4px 0; font-size: 1.1em; color: #28a745;"><strong>共節省: ${result.savedAmount.toLocaleString()} 元</strong></p><p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>折扣後總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p>` 
            : `<p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p>`;
        
        if (result.points > 0) {
            totalsHtml += `<p style="margin: 10px 0 0 0; font-size: 1.1em; color: #007bff;"><strong>🎁 獲得點數: ${result.points.toLocaleString()} 點</strong></p>`;
        }
        
        const now = new Date();
        const rocYear = now.getFullYear() - 1911;
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        imageSource.innerHTML = `<h3 style="color: #0056b3; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin: 0 0 15px 0;">德德美體美容中心 - 消費明細</h3><div style="margin-bottom: 20px;">${itemsHtml}</div><div style="text-align: right;">${totalsHtml}</div><p style="text-align: center; font-size: 0.7em; color: #999; margin-top: 20px;">價格版本: ${rocYear}年${month}月版</p>`;
        document.body.appendChild(imageSource);
        
        html2canvas(imageSource, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            link.download = `德德美體-${rocYear}${month}${day}${hours}${minutes}${seconds}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('圖片已開始下載！');
        }).catch(err => {
            console.error('圖片輸出失敗:', err);
            showToast('圖片輸出失敗，請稍後再試。');
        }).finally(() => {
            document.body.removeChild(imageSource);
        });
    }
    
    function applyState(state) {
        if (!state) return;
        state.services?.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = true;
        });
        dom.isBirthdayPerson.checked = state.isBirthday || false;
        dom.isStudent.checked = state.isStudent || false;
        handleInteraction();
    }
    
    function applyStateFromURL() {
        const config = new URLSearchParams(window.location.search).get('c');
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
    toggleSearchActionButtons();

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
    dom.selectAllFilteredBtn.addEventListener('click', () => selectFiltered(true));
    dom.deselectAllFilteredBtn.addEventListener('click', () => selectFiltered(false));
}

// 監聽來自 Service Worker 的訊息
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data) {
            // 當 SW 發現有新版本時觸發
            if (event.data.type === 'UPDATE_AVAILABLE') {
                showNotice(event.data.message, true);
            } 
            // 一般的連線狀態通知 (不再強行干擾畫面，改由 console 印出)
            else if (event.data.type === 'SW_STATUS') {
                console.log('連線狀態:', event.data.message);
            }
        }
    });
}

// 全新的通知顯示函式 (搭配 CSS 動畫)
function showNotice(msg, requiresReload = false) {
    let noticeDiv = document.getElementById('sw-notice');
    
    // 如果通知已經存在，先移除以重新觸發動畫
    if (noticeDiv) {
        noticeDiv.parentNode.removeChild(noticeDiv);
    }

    noticeDiv = document.createElement('div');
    noticeDiv.id = 'sw-notice';
    noticeDiv.className = 'sw-notice slide-up-animation'; // 加上 CSS Class
    document.body.appendChild(noticeDiv);
    
    if (requiresReload) {
        noticeDiv.innerHTML = `
            <span>🎉 ${msg}</span>
            <button onclick="window.location.reload(true)">立即更新</button>
        `;
    } else {
        noticeDiv.innerHTML = `<span>${msg}</span>`;
        setTimeout(() => {
            if(noticeDiv.parentNode) noticeDiv.parentNode.removeChild(noticeDiv);
        }, 3000);
    }
}
