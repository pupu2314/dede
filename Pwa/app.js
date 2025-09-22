/**
 * 載入服務資料的核心函式
 * 採用網路優先，若失敗則讀取 PWA 快取的策略 (Network-first, cache fallback)
 * @returns {Promise<object|null>} 成功時回傳服務資料物件，全部失敗時回傳 null
 */
async function loadServiceData() {
    // 策略1：網路優先 (Network First)
    try {
        const response = await fetch('services.json', { cache: 'reload' });
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
            const cache = await caches.open('price-calculator-v1'); // 確保快取名稱與 service-worker.js 一致
            const cachedResponse = await cache.match('services.json');
            if (cachedResponse) {
                console.log('成功從 PWA 快取載入 services.json');
                return await cachedResponse.json();
            }
            throw new Error('在快取中找不到 services.json');
        } catch (cacheError) {
            console.error('從 PWA 快取讀取也失敗:', cacheError.message);
            return null; // 雙重失敗
        }
    }
}

/**
 * 根據促銷的開始和結束日期，判斷其當前狀態
 * @param {object} promo - 促銷物件，需包含 start 和 end 屬性
 * @param {string} today - YYYY-MM-DD 格式的今天日期字串
 * @returns {{text: string, class: string}} 包含狀態文字和對應 CSS class 的物件
 */
function getPromoStatus(promo, today) {
    if (!promo || !promo.start || !promo.end) {
        return { text: '日期無效', class: 'invalid' };
    }
    if (today >= promo.start && today <= promo.end) {
        return { text: '進行中', class: 'active' };
    } else if (today < promo.start) {
        return { text: '即將開始', class: 'upcoming' };
    } else {
        return { text: '已過期', class: 'expired' };
    }
}

/**
 * 將特殊字元轉換為 HTML 實體，防止 XSS 攻擊
 * @param {string} str - 欲處理的字串
 * @returns {string} 處理後的安全字串
 */
function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}
