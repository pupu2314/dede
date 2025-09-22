/**
 * 載入服務資料的核心函式
 * @returns {Promise<object|null>} 成功時回傳服務資料物件，失敗時回傳 null
 */
async function loadServiceData() {
    try {
        // 加入時間戳記以繞過瀏覽器快取
        const response = await fetch(`services.json?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`伺服器回應錯誤: ${response.status}`);
        }
        const data = await response.json();
        console.log('成功載入 services.json');
        return data;
    } catch (error) {
        console.error('載入 services.json 失敗:', error);
        return null;
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