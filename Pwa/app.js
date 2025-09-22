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
        const response = await fetch('services.json?t=' + new Date().getTime(), { cache: 'reload' });
        if (!response.ok) {
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
            if ('caches' in window) {
                const cache = await caches.open('price-calculator-v5.3'); // 請確保此快取名稱與 service-worker.js 一致
                const cachedResponse = await cache.match('services.json');
                if (cachedResponse) {
                    console.log('成功從 PWA 快取載入 services.json');
                    return await cachedResponse.json();
                }
                throw new Error('在 PWA 快取中找不到 services.json');
            } else {
                 throw new Error('此瀏覽器不支援 Cache API');
            }
        } catch (cacheError) {
            console.error('從 PWA 快取讀取失敗:', cacheError.message);
            return null; // 所有策略皆失敗
        }
    }
}

/**
 * 檢查促銷狀態 (有效、即將開始、已過期)
 * @param {object} promo - 促銷物件 {start: "YYYY-MM-DD", end: "YYYY-MM-DD"}
 * @param {Date} today - 用於比較的今天日期物件
 * @returns {object} {text: "狀態文字", class: "CSS class 名稱"}
 */
function getPromoStatus(promo, today) {
    const startDate = new Date(promo.start + 'T00:00:00');
    const endDate = new Date(promo.end + 'T23:59:59');
    
    if (today < startDate) return { text: '即將開始', class: 'upcoming' };
    if (today > endDate) return { text: '已過期', class: 'expired' };
    return { text: '進行中', class: 'active' };
}

/**
 * 渲染檢查報告 (check.html 使用)
 */
function renderReport() {
    const output = document.getElementById('report-output');
    const showOnlyPromos = document.getElementById('show-only-promos-toggle').checked;
    
    if (!serviceData) {
        output.innerHTML = '<p>沒有可顯示的資料。</p>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let reportHtml = '';

    (serviceData.categories || []).forEach(category => {
        let categoryHtml = '';
        let hasPromoInCategory = false;

        (category.items || []).forEach(item => {
            if (item.promotions && item.promotions.length > 0) {
                hasPromoInCategory = true;
                item.promotions.forEach(promo => {
                    const status = getPromoStatus(promo, today);
                    const discountAmount = item.price - promo.price;
                    const discountPercentage = item.price > 0 ? (discountAmount / item.price) * 100 : 0;
                    const discountText = `省 ${discountAmount.toLocaleString()} (${discountPercentage.toFixed(1)}%)`;

                    categoryHtml += `
                        <tr>
                            <td data-label="項目名稱">${item.name}</td>
                            <td data-label="原價" style="text-align: right;">${item.price.toLocaleString()}</td>
                            <td data-label="促銷活動">${promo.label}</td>
                            <td data-label="促銷價" style="text-align: right;">${promo.price.toLocaleString()}</td>
                            <td data-label="折扣" class="discount-info">${discountText}</td>
                            <td data-label="開始日期">${promo.start}</td>
                            <td data-label="結束日期">${promo.end}</td>
                            <td data-label="狀態"><span class="status ${status.class}">${status.text}</span></td>
                        </tr>
                    `;
                });
            } else if (!showOnlyPromos) {
                 categoryHtml += `
                    <tr>
                        <td data-label="項目名稱">${item.name}</td>
                        <td data-label="原價" style="text-align: right;">${item.price.toLocaleString()}</td>
                        <td data-label="促銷活動" colspan="5" style="color: #6c757d;">無</td>
                        <td data-label="狀態">-</td>
                    </tr>
                `;
            }
        });
        
        if (showOnlyPromos && !hasPromoInCategory) return;

        if (categoryHtml) {
            reportHtml += `
                <h3>${category.name}</h3>
                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>項目名稱</th>
                                <th>原價</th>
                                <th>促銷活動</th>
                                <th>促銷價</th>
                                <th>折扣</th>
                                <th>開始日期</th>
                                <th>結束日期</th>
                                <th>狀態</th>
                            </tr>
                        </thead>
                        <tbody>${categoryHtml}</tbody>
                    </table>
                </div>
            `;
        }
    });

    // 渲染組合優惠表格
    if (serviceData.combos && serviceData.combos.length > 0) {
        let comboTableHtml = '';
        serviceData.combos.forEach(combo => {
            if (combo.promotions && combo.promotions.length > 0) {
                const itemNames = combo.itemIds.map(id => allServices.get(id)?.name || `<span style="color:red;">錯誤ID</span>`).join('<br>');
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
        if (comboTableHtml) {
            reportHtml += `
                <h3>組合優惠</h3>
                <div class="table-responsive">
                    <table>
                         <thead>
                            <tr>
                                <th>組合名稱</th>
                                <th>包含項目</th>
                                <th>原價</th>
                                <th>促銷活動</th>
                                <th>促銷價</th>
                                <th>折扣</th>
                                <th>開始日期</th>
                                <th>結束日期</th>
                                <th>狀態</th>
                            </tr>
                        </thead>
                        <tbody>${comboTableHtml}</tbody>
                    </table>
                </div>`;
        }
    }

    output.innerHTML = reportHtml || '<p>沒有符合條件的項目可顯示。</p>';
}