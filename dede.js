document.addEventListener('DOMContentLoaded', () => {

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
                    { id: 'leg_full', name: '全腿', price: 3500, promoPrice: 3000 },
                    { id: 'nipple', name: '奶頭毛', price: 200 },
                    { id: 'chest', name: '胸毛', price: 600 },
                    { id: 'private_area', name: '區域單獨除毛', price: 600 },
                    { id: 'beard', name: '鬍子熱蠟除毛(八字鬍與下巴)', price: 1000, promoPrice: 900 },
                    { id: 'private_combo_part', name: '私密處單一區域任選2部位', price: 1200, promoPrice: 1000 }
                ]
            },
            {
                name: '男士專屬油壓',
                items: [
                    { id: 'oil_massage_1hr', name: '[油推]能量精油 健康調理 /1hr(含機能保養)', price: 1200 },
                    { id: 'oil_massage_1.5hr', name: '[油推]能量精油健康調理 /1.5hr(含機能保養)', price: 1800, promoPrice: 1500 }
                ]
            },
            {
                name: '男士專屬指壓',
                items: [
                    { id: 'acupressure_1hr', name: '[指壓]能量健康調理 /1hr', price: 1000 },
                    { id: 'acupressure_1.5hr', name: '[指壓]能量健康調理 /1.5hr', price: 1500 }
                ]
            },
            {
                name: '男士專屬筋膜刀體雕',
                items: [
                    { id: 'fascia_knife_1hr', name: '筋膜刀體雕 氣脈健康調理 /1hr', price: 1600 },
                    { id: 'fascia_knife_1.5hr', name: '筋膜刀體雕 氣脈健康調理 /1.5hr', price: 2200 }
                ]
            },
            {
                name: '男士專屬SPA',
                items: [
                    { id: 'spa_face', name: '【臉部】更新油美白煥膚萬年礦泥臉部肌膚調理 /1hr', price: 1800 },
                    { id: 'spa_private', name: '【私密處】更新油美白換膚萬年礦泥 屁股+私密處 肌膚調理 /1hr', price: 2200, promoPrice: 1800 },
                    { id: 'spa_body', name: '【全身】更新油全身深層敷體淨化 /1.5hr', price: 3000, promoPrice: 2600 }
                ]
            }
        ],
        combos: [
            {
                id: 'combo_private_armpit',
                name: '私密處全除 + 腋下毛 組合優惠',
                itemIds: ['private_full', 'armpit'],
                price: 2200
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

    // 懸浮視窗內的元素
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
                priceDiv.innerHTML = (service.promoPrice !== undefined) ?
                    `<span class="promotion-price">$${service.promoPrice.toLocaleString()}</span> <span class="original-price">$${service.price.toLocaleString()}</span>` :
                    `<span>$${service.price.toLocaleString()}</span>`;
                div.appendChild(checkbox); div.appendChild(label); div.appendChild(priceDiv);
                fieldset.appendChild(div);
            });
            serviceListContainer.appendChild(fieldset);
        });
    }

    function calculatePrices() {
        const selectedIds = new Set(Array.from(document.querySelectorAll('#service-list input:checked')).map(cb => cb.value));
        let originalTotal = 0, promoTotal = 0;
        const processedIds = new Set(), displayItems = [];
        serviceData.combos.forEach(combo => {
            if (combo.itemIds.every(id => selectedIds.has(id))) {
                const comboOriginalPrice = combo.itemIds.reduce((sum, id) => sum + allServices.get(id).price, 0);
                originalTotal += comboOriginalPrice; promoTotal += combo.price;
                displayItems.push({ type: 'combo', comboInfo: combo, originalPrice: comboOriginalPrice });
                combo.itemIds.forEach(id => processedIds.add(id));
            }
        });
        selectedIds.forEach(id => {
            if (!processedIds.has(id)) {
                const service = allServices.get(id);
                if (service) {
                    originalTotal += service.price; promoTotal += service.promoPrice ?? service.price;
                    displayItems.push({ type: 'service', serviceInfo: service });
                }
            }
        });
        let finalPrice = promoTotal, discountType = displayItems.length > 0 ? '本月活動優惠' : '無';
        const birthdayDiscount = originalTotal * 0.5;
        const studentDiscount = originalTotal * 0.8;
        if (isBirthdayPerson.checked && birthdayDiscount < finalPrice) {
            finalPrice = birthdayDiscount; discountType = '壽星原價 5 折';
        }
        if (isStudent.checked && studentDiscount < finalPrice) {
            finalPrice = studentDiscount; discountType = '學生原價 8 折';
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
            if (item.type === 'combo' && !isIdentityDiscount) {
                const li = document.createElement('li');
                li.innerHTML = `<span class="item-name">${item.comboInfo.name}</span><span class="item-price-detail"><span class="promotion-price">$${item.comboInfo.price.toLocaleString()}</span> <span class="original-price">$${item.originalPrice.toLocaleString()}</span></span>`;
                selectedItemsListUl.appendChild(li);
            } else {
                const servicesToRender = (item.type === 'service') ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
                servicesToRender.forEach(service => {
                    const li = document.createElement('li');
                    const priceHtml = isIdentityDiscount ? `<span>$${service.price.toLocaleString()}</span>` :
                        (service.promoPrice !== undefined ?
                        `<span class="promotion-price">$${service.promoPrice.toLocaleString()}</span> <span class="original-price">$${service.price.toLocaleString()}</span>` :
                        `<span>$${service.price.toLocaleString()}</span>`);
                    li.innerHTML = `<span class="item-name">${service.name}</span><span class="item-price-detail">${priceHtml}</span>`;
                    selectedItemsListUl.appendChild(li);
                });
            }
        });
    }
    
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

        let itemsHtml = result.displayItems.map(item => {
            const isIdentityDiscount = result.appliedDiscount.includes('壽星') || result.appliedDiscount.includes('學生');
            let itemHtml = '';
            if (item.type === 'combo' && !isIdentityDiscount) {
                itemHtml = `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;">
                                <span>${item.comboInfo.name}</span>
                                <span style="white-space: nowrap; margin-left: 15px;">
                                    <strong style="color: #dc3545;">$${item.comboInfo.price.toLocaleString()}</strong>
                                    <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${item.originalPrice.toLocaleString()}</span>
                                </span>
                            </div>`;
            } else {
                const servicesToRender = (item.type === 'service') ? [item.serviceInfo] : item.comboInfo.itemIds.map(id => allServices.get(id));
                servicesToRender.forEach(service => {
                    const priceHtml = isIdentityDiscount ? `<span>$${service.price.toLocaleString()}</span>` :
                        (service.promoPrice !== undefined ?
                        `<strong style="color: #dc3545;">$${service.promoPrice.toLocaleString()}</strong> <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-left: 5px;">$${service.price.toLocaleString()}</span>` :
                        `<span>$${service.price.toLocaleString()}</span>`);
                    itemHtml += `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #eee;">
                                    <span>${service.name}</span>
                                    <span style="white-space: nowrap; margin-left: 15px;">${priceHtml}</span>
                                 </div>`;
                });
            }
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
            totalsHtml = `
                <p style="margin: 10px 0 0 0; font-size: 1.3em;"><strong>總金額: <span style="color: #dc3545;">${result.finalTotal.toLocaleString()}</span> 元</strong></p>
            `;
        }

        imageSource.innerHTML = `
            <h3 style="color: #0056b3; border-bottom: 2px solid #007bff; padding-bottom: 10px; margin: 0 0 15px 0;">德德美體美容中心 - 消費明細</h3>
            <div style="margin-bottom: 20px;">${itemsHtml}</div>
            <div style="text-align: right;">${totalsHtml}</div>
            <p style="text-align: center; font-size: 0.7em; color: #999; margin-top: 20px;">價格版本: 114年9月版</p>
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

    renderServices();
    handleInteraction();
});
