document.addEventListener('DOMContentLoaded', () => {

    // --- 資料結構 ---
    const serviceData = {
        categories: [
            {
                name: '男士專屬除毛',
                items: [
                    { id: 'private_full', name: '私密處除毛 (全除)', price: 1900 },
                    { id: 'nose', name: '鼻毛', price: 200 },
                    { id: 'private_shape', name: '私密處除毛 (局部/造型)', price: 1900 },
                    { id: 'private_trim', name: '私密處毛修剪-一般修剪無痛(修剪+沐浴)', price: 300 },
                    { id: 'belly_lower', name: '三角處(下腹毛以下,根部以上)', price: 800 },
                    { id: 'armpit', name: '腋下毛', price: 600 },
                    { id: 'belly_upper', name: '上腹部毛(肚臍以上胸部以下)', price: 600 },
                    { id: 'belly_middle', name: '下腹部毛(肚臍以下陰毛以上)', price: 600 },
                    { id: 'arm_half', name: '半手臂', price: 1600 },
                    { id: 'arm_full', name: '全手臂', price: 3000 },
                    { id: 'finger', name: '手指', price: 300 },
                    { id: 'hand_back', name: '手背', price: 300 },
                    { id: 'toe', name: '腳趾', price: 300 },
                    { id: 'foot_back', name: '腳背', price: 300 },
                    { id: 'leg_calf', name: '小腿', price: 1900 },
                    { id: 'leg_thigh', name: '大腿', price: 1900 },
                    { id: 'leg_full', name: '全腿', price: 3500, promotions: [
                        { price: 3000, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                    ]},
                    { id: 'nipple', name: '奶頭毛', price: 200 },
                    { id: 'chest', name: '胸毛', price: 600 },
                    { id: 'private_area', name: '區域單獨除毛', price: 600 },
                    { id: 'beard', name: '鬍子熱蠟除毛(八字鬍與下巴)', price: 1000, promotions: [
                        { price: 900, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                    ]},
                    { id: 'private_combo_part', name: '私密處單一區域任選2部位', price: 1200, promotions: [
                        { price: 1000, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                    ]}
                ]
            },
            {
                name: '男士專屬油壓',
                items: [
                    { id: 'oil_massage_1hr', name: '[油推]能量精油 健康調理 /1hr(含機能保養)', price: 1200 },
                    { id: 'oil_massage_1.5hr', name: '[油推]能量精油健康調理 /1.5hr(含機能保養)', price: 1800, promotions: [
                         { price: 1500, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                    ]}
                ]
            },
            { name: '男士專屬指壓', items: [
                    { id: 'acupressure_1hr', name: '[指壓]能量健康調理 /1hr', price: 1000 },
                    { id: 'acupressure_1.5hr', name: '[指壓]能量健康調理 /1.5hr', price: 1500 }
            ]},
            { name: '男士專屬筋膜刀體雕', items: [
                    { id: 'fascia_knife_1hr', name: '筋膜刀體雕 氣脈健康調理 /1hr', price: 1600 },
                    { id: 'fascia_knife_1.5hr', name: '筋膜刀體雕 氣脈健康調理 /1.5hr', price: 2200 }
            ]},
            {
                name: '男士專屬SPA',
                items: [
                    { id: 'spa_face', name: '【臉部】更新油美白煥膚萬年礦泥臉部肌膚調理 /1hr', price: 1800 },
                    { id: 'spa_private', name: '【私密處】更新油美白換膚萬年礦泥 屁股+私密處 肌膚調理 /1hr', price: 2200, promotions: [
                        { price: 1800, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                    ]},
                    { id: 'spa_body', name: '【全身】更新油全身深層敷體淨化 /1.5hr', price: 3000, promotions: [
                        { price: 2600, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                    ]}
                ]
            }
        ],
        combos: [
            {
                id: 'combo_private_armpit',
                name: '私密處全除 + 腋下毛 組合優惠',
                itemIds: ['private_full', 'armpit'],
                price: 2500,
                promotions: [
                    { price: 2200, label: '9月優惠', start: '2025-09-01', end: '2025-09-30' }
                ]
            }
        ]
    };

    const allServices = new Map(serviceData.categories.flatMap(cat => cat.items).map(item => [item.id, item]));
    const STORAGE_KEY = 'serviceCalculatorState_v3';

    // DOM 元素
    const serviceListContainer = document.getElementById('service-list');
    const searchInput = document.getElementById('search-input');
    const isBirthdayPerson = document.getElementById('isBirthdayPerson');
    const isStudent = document.getElementById('isStudent');
    const toast = document.getElementById('toast-notification');
    const priceVersionSpan = document.getElementById('price-version');

    const floatingSummary = document.getElementById('floating-summary');
    const toggleDetailsBtn = document.getElementById('toggle-details');
    const summaryDetails = document.getElementById('summary-details');
    const saveBtn = document.getElementById('save-btn');
    const loadBtn = document.getElementById('load-btn');
    const clearBtn = document.getElementById('clear-btn');
    const shareBtn = document.getElementById('share-btn');

    const originalTotalP = document.getElementById('original-total-p');
    const discountedTotalP = document.getElementById('discounted-total-p');
    const originalTotalSpan = document.getElementById('floating-original-total');
    const discountedTotalSpan = document.getElementById('floating-discounted-total');
    const savingsContainer = document.getElementById('savings-container');
    const savingsSpan = document.getElementById('floating-savings');
    const selectedItemsListUl = document.querySelector('#floating-selected-items-list ul');
    const discountNoteContainer = document.getElementById('discount-note-container');
    const discountNoteSpan = discountNoteContainer.querySelector('.discount-note');

    function getTaipeiDateString() {
        const now = new Date();
        return new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Taipei'
        }).format(now);
    }
    
    // --- 核心日期判斷函式 (已修改) ---
    // 使用 getTaipeiDateString() 進行日期比較，確保時區正確
    function getActivePromotion(item) {
        if (!item.promotions || item.promotions.length === 0) {
            return null;
        }
        const todayString = getTaipeiDateString();

        for (const promo of item.promotions) {
            // 直接比較 YYYY-MM-DD 格式的字串，簡單且可靠
            if (todayString >= promo.start && todayString <= promo.end) {
                return promo;
            }
        }
        return null;
    }

    // --- 服務渲染函式 (無變更) ---
    function renderServices() {
        serviceListContainer.innerHTML = '';
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
                
                const activePromo = getActivePromotion(service);
                priceDiv.innerHTML = (activePromo) ?
                    `<span class="promotion-price">$${activePromo.price.toLocaleString()}</span> <span class="original-price">$${service.price.toLocaleString()}</span>` :
                    `<span>$${service.price.toLocaleString()}</span>`;

                div.appendChild(checkbox); div.appendChild(label); div.appendChild(priceDiv);
                fieldset.appendChild(div);
            });
            serviceListContainer.appendChild(fieldset);
        });
    }

    // --- 價格計算函式 (已修改) ---
    function calculatePrices() {
        const selectedIds = new Set(Array.from(document.querySelectorAll('#service-list input:checked')).map(cb => cb.value));
        let originalTotal = 0, promoTotal = 0;
        const processedIds = new Set(), displayItems = [], appliedPromoLabels = new Set();

        // --- 修正 2：組合優惠顯示問題 ---
        // 先檢查組合優惠本身是否在檔期內，若不在，則不將其視為組合
        serviceData.combos.forEach(combo => {
            const activeComboPromo = getActivePromotion(combo);
            // 必須同時滿足：1. 組合優惠在檔期內 2. 所有組合內項目都被選取
            if (activeComboPromo && combo.itemIds.every(id => selectedIds.has(id))) {
                const comboOriginalPrice = combo.itemIds.reduce((sum, id) => sum + allServices.get(id).price, 0);
                
                originalTotal += comboOriginalPrice;
                promoTotal += activeComboPromo.price;
                
                displayItems.push({ 
                    type: 'combo', 
                    comboInfo: combo, 
                    originalPrice: comboOriginalPrice, 
                    finalPrice: activeComboPromo.price,
                    promo: activeComboPromo
                });
                appliedPromoLabels.add(activeComboPromo.label);
                combo.itemIds.forEach(id => processedIds.add(id));
            }
        });

        // 處理剩餘的、未被組合的項目
        selectedIds.forEach(id => {
            if (!processedIds.has(id)) {
                const service = allServices.get(id);
                if (service) {
                    const activeServicePromo = getActivePromotion(service);
                    const servicePrice = activeServicePromo ? activeServicePromo.price : service.price;

                    originalTotal += service.price;
                    promoTotal += servicePrice;
                    displayItems.push({ 
                        type: 'service', 
                        serviceInfo: service, 
                        originalPrice: service.price,
                        finalPrice: servicePrice,
                        promo: activeServicePromo
                    });
                    if(activeServicePromo) appliedPromoLabels.add(activeServicePromo.label);
                }
            }
        });

        let finalPrice = promoTotal;
        let discountType = appliedPromoLabels.size > 0 ? [...appliedPromoLabels].join(', ') : '無';

        const birthdayDiscount = originalTotal * 0.5;
        const studentDiscount = originalTotal * 0.8;

        if (isBirthdayPerson.checked && birthdayDiscount < finalPrice) {
            finalPrice = birthdayDiscount;
            discountType = '壽星原價 5 折';
        }
        if (isStudent.checked && studentDiscount < finalPrice) {
            finalPrice = studentDiscount;
            discountType = '學生原價 8 折';
        }

        const savedAmount = originalTotal - finalPrice;
        return {
            originalTotal: Math.round(originalTotal),
            finalTotal: Math.round(finalPrice),
            savedAmount: Math.round(savedAmount),
            appliedDiscount: discountType,
            displayItems
        };
    }

    // --- 更新顯示函式 (無變更) ---
    function updateDisplay(result) {
        if (result.savedAmount > 0) {
            originalTotalP.style.display = 'block';
            discountedTotalP.style.display = 'block';
            savingsContainer.style.display = 'block';
            discountNoteContainer.style.display = 'block';
            originalTotalP.firstChild.nodeValue = '原始總金額：';
            discountedTotalP.firstChild.nodeValue = '折扣後總金額：';
            originalTotalSpan.textContent = result.originalTotal.toLocaleString();
            savingsSpan.textContent = result.savedAmount.toLocaleString();
            discountedTotalSpan.textContent = result.finalTotal.toLocaleString();
            discountNoteSpan.textContent = `套用最佳優惠方案： ${result.appliedDiscount}`;
        } else {
            originalTotalP.style.display = 'none';
            savingsContainer.style.display = 'none';
            discountNoteContainer.style.display = 'none';
            discountedTotalP.style.display = 'block';
            discountedTotalP.firstChild.nodeValue = '總金額：';
            discountedTotalSpan.textContent = result.finalTotal.toLocaleString();
        }

        selectedItemsListUl.innerHTML = '';
        const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');
        
        result.displayItems.forEach(item => {
            const li = document.createElement('li');
            let name, priceHtml;

            if (isIdentityDiscount) {
                const servicesToRender = item.type === 'service' ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
                servicesToRender.forEach(service => {
                    const li_item = document.createElement('li');
                    li_item.innerHTML = `<span class="item-name">${service.name}</span><span class="item-price-detail"><span>$${service.price.toLocaleString()}</span></span>`;
                    selectedItemsListUl.appendChild(li_item);
                });
                return;
            }
            
            if (item.type === 'combo') {
                name = item.comboInfo.name;
                priceHtml = item.promo ? 
                    `<span class="promotion-price">$${item.finalPrice.toLocaleString()}</span> <span class="original-price">$${item.originalPrice.toLocaleString()}</span>` : 
                    `<span>$${item.originalPrice.toLocaleString()}</span>`;
            } else {
                name = item.serviceInfo.name;
                priceHtml = item.promo ?
                    `<span class="promotion-price">$${item.finalPrice.toLocaleString()}</span> <span class="original-price">$${item.originalPrice.toLocaleString()}</span>` :
                    `<span>$${item.originalPrice.toLocaleString()}</span>`;
            }
            li.innerHTML = `<span class="item-name">${name}</span><span class="item-price-detail">${priceHtml}</span>`;
            selectedItemsListUl.appendChild(li);
        });
    }
    
    // --- 匯出圖片函式 (無變更) ---
    function exportAsPNG() {
        const result = calculatePrices();
        if (result.displayItems.length === 0) {
            showToast('請先選擇服務項目再輸出。');
            return;
        }

        const imageSource = document.createElement('div');
        imageSource.style.width = '450px';
        imageSource.style.padding = '25px';
        imageSource.style.backgroundColor = '#ffffff';
        imageSource.style.fontFamily = 'sans-serif';
        imageSource.style.color = '#333';
        imageSource.style.position = 'absolute';
        imageSource.style.left = '-9999px';
        imageSource.style.border = '1px solid #ddd';

        const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');

        let itemsHtml = result.displayItems.map(item => {
            let itemHtml = '';
            
            if (item.type === 'combo' && !isIdentityDiscount && item.promo) {
                 return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;">
                            <span>${item.comboInfo.name}</span>
                            <span style="white-space: nowrap; margin-left: 15px;">
                                <strong style="color: #dc3545;">$${item.finalPrice.toLocaleString()}</strong>
                                <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${item.originalPrice.toLocaleString()}</span>
                            </span>
                        </div>`;
            }

            const servicesToRender = (item.type === 'service') ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
            servicesToRender.forEach(service => {
                const activePromo = getActivePromotion(service);
                const priceHtml = isIdentityDiscount ? `<span>$${service.price.toLocaleString()}</span>` :
                    (activePromo && !isIdentityDiscount ?
                    `<strong style="color: #dc3545;">$${activePromo.price.toLocaleString()}</strong> <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${service.price.toLocaleString()}</span>` :
                    `<span>$${service.price.toLocaleString()}</span>`);
                itemHtml += `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;">
                                <span>${service.name}</span>
                                <span style="white-space: nowrap; margin-left: 15px;">${priceHtml}</span>
                             </div>`;
            });
            return itemHtml;
        }).join('');


        let totalsHtml = '';
        if (result.savedAmount > 0) {
            totalsHtml = `
                <p style="margin: 4px 0;">原始總金額: ${result.originalTotal.toLocaleString()} 元</p>
                <p style="margin: 4px 0; font-size: 0.9em; color: #28a745;"><strong>套用最佳優惠方案： ${result.appliedDiscount}</strong></p>
                <p style="margin: 4px 0; font-size: 1.1em; color: #28a745;"><strong>共節省: ${result.savedAmount.toLocaleString()} 元</strong></p>
                <p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>折扣後總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p>
            `;
        } else {
            totalsHtml = `<p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p>`;
        }
        
        const versionText = getVersionText();
        imageSource.innerHTML = `
            <h3 style="color: #0056b3; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin: 0 0 15px 0;">德德美體美容中心 - 消費明細</h3>
            <div style="margin-bottom: 20px;">${itemsHtml}</div>
            <div style="text-align: right;">${totalsHtml}</div>
            <p style="text-align: center; font-size: 0.7em; color: #999; margin-top: 20px;">價格版本: ${versionText}</p>
        `;

        document.body.appendChild(imageSource);

        html2canvas(imageSource, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            const now = new Date();
            const rocYear = now.getFullYear() - 1911;
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
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

    // --- 其餘輔助函式 (無變更) ---
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function saveState() {
        const state = {
            selectedIds: Array.from(document.querySelectorAll('#service-list input:checked')).map(cb => cb.id),
            isBirthday: isBirthdayPerson.checked,
            isStudent: isStudent.checked
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        showToast('已儲存當前選擇！');
    }

    function loadState() {
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (savedState) {
            clearSelections(false);
            const state = JSON.parse(savedState);
            state.selectedIds.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
            isBirthdayPerson.checked = state.isBirthday;
            isStudent.checked = state.isStudent;
            handleInteraction();
            showToast('已載入上次選擇！');
        } else {
            showToast('沒有找到儲存的紀錄。');
        }
    }

    function handleInteraction() {
        const result = calculatePrices();
        updateDisplay(result);
    }

    function clearSelections(showMsg = true) {
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        handleInteraction();
        if (showMsg) showToast('已清除所有選項。');
    }

    function filterServices() {
        const query = searchInput.value.toLowerCase().trim();
        const allFieldsets = serviceListContainer.querySelectorAll('fieldset');
        allFieldsets.forEach(fieldset => {
            let categoryHasVisibleItem = false;
            const items = fieldset.querySelectorAll('.service-item');
            items.forEach(item => {
                const label = item.querySelector('label');
                const itemName = label ? label.textContent.toLowerCase() : '';
                if (itemName.includes(query)) {
                    item.style.display = 'flex';
                    categoryHasVisibleItem = true;
                } else {
                    item.style.display = 'none';
                }
            });
            fieldset.style.display = categoryHasVisibleItem ? 'block' : 'none';
        });
    }
    
    function getVersionText() {
        const now = new Date();
        const rocYear = now.getFullYear() - 1911;
        const month = now.getMonth() + 1;
        return `${rocYear}年${month}月版`;
    }

    function setVersion() {
        priceVersionSpan.textContent = `(${getVersionText()})`;
    }

    // --- 事件監聽與初始化 (無變更) ---
    const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
            const height = entry.contentRect.height;
            document.body.style.paddingBottom = `${height}px`;
        }
    });
    observer.observe(floatingSummary);

    serviceListContainer.addEventListener('change', handleInteraction);
    isBirthdayPerson.addEventListener('change', handleInteraction);
    isStudent.addEventListener('change', handleInteraction);
    searchInput.addEventListener('input', filterServices);

    const togglePanel = () => {
        floatingSummary.classList.toggle('partial-expand');
        const isExpanded = floatingSummary.classList.contains('partial-expand');
        toggleDetailsBtn.setAttribute('aria-expanded', isExpanded);
        summaryDetails.setAttribute('aria-hidden', !isExpanded);
    };

    toggleDetailsBtn.addEventListener('click', togglePanel);
    toggleDetailsBtn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePanel();
        }
    });

    saveBtn.addEventListener('click', saveState);
    loadBtn.addEventListener('click', loadState);
    clearBtn.addEventListener('click', () => clearSelections(true));
    shareBtn.addEventListener('click', exportAsPNG);
    
    // --- 初始化頁面 ---
    renderServices();
    handleInteraction();
    setVersion();

});
