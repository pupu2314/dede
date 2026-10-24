// ==========================================
// DeDe 共用工具函式
// 供 index.html / app.js(calculator.html) / output.html / check.html / services_editor.html 共用，
// 避免同一段邏輯在多個檔案裡各自維護一份、日後改一處忘改另一處。
//
// 【計價政策：整單擇優】
//   學生／壽星的「身分優惠」與「限時優惠／套餐」不可併用；
//   整張單只能擇一，以「總額較低」的那一邊計算（兩邊相同時採用身分優惠）。
// ==========================================
(function (global) {
    'use strict';

    // ---------- 集中管理的規則（要調整折扣或集點，只改這裡） ----------
    const RULES = {
        identities: {
            student:  { key: 'student',  label: '學生', rate: 0.8 },
            birthday: { key: 'birthday', label: '壽星', rate: 0.5 }
        },
        pointsPerSpend: 1500, // 每消費多少元集 1 點（以實付金額計算）
        redeemAt: 10,         // 集滿幾點可折抵
        redeemValue: 500,     // 折抵金額
        offerSwitchDay: 5     // 每月幾號(含)起，預設改看次月優惠
    };

    // 0.8 -> "8折"、0.85 -> "8.5折"
    function rateText(rate) {
        return (Math.round(rate * 100) / 10) + '折';
    }

    // 接受 'student'/'birthday'/'general' 或 '學生'/'壽星'/'一般'，回傳身分資訊（一般回傳 null）
    function identityInfo(identity) {
        const map = { '學生': 'student', '壽星': 'birthday', '一般': 'general' };
        const key = map[identity] || identity;
        const base = RULES.identities[key];
        if (!base) return null;
        return { key: base.key, label: base.label, rate: base.rate, rateText: rateText(base.rate) };
    }

    /**
     * 解析日期字串。純日期格式 (YYYY-MM-DD) 用「本地時間」的當天 00:00，
     * 避免 new Date('2026-10-01') 被當成 UTC 午夜 (台灣為 08:00)，
     * 造成每月 1 日 00:00~08:00 新月份優惠尚未生效。其他格式維持原本的解析方式。
     */
    function parseLocalDate(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
        return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
    }

    /**
     * 從 promotions 陣列中取出「目前時間點生效中」的那一筆優惠。
     * @param {Array} promotions
     * @param {Date} [referenceDate] 選填，模擬「現在」的日期；不傳則為真正的現在時間。
     * @returns {Object|null}
     */
    function getActivePromotion(promotions, referenceDate) {
        if (!promotions || !Array.isArray(promotions) || promotions.length === 0) return null;
        const now = referenceDate instanceof Date && !isNaN(referenceDate) ? referenceDate : new Date();
        for (const promo of promotions) {
            const start = parseLocalDate(promo.start);
            const end = parseLocalDate(promo.end);
            end.setHours(23, 59, 59, 999);
            if (now >= start && now <= end) return promo;
        }
        return null;
    }

    /**
     * 單一項目：比較「身分折扣價」與「目前促銷價」，回傳較低者（僅用於價目表上顯示『單項最低價』）。
     * 多項目結帳請用 calcOrder()（整單擇優）。
     */
    function getBestPrice(basePrice, discountRate, activePromo) {
        const promoPrice = activePromo ? activePromo.price : basePrice;
        if (discountRate < 1) {
            const identityPrice = Math.round(basePrice * discountRate);
            if (identityPrice <= promoPrice) {
                return { price: identityPrice, usedIdentity: true };
            }
        }
        return { price: promoPrice, usedIdentity: false };
    }

    // ---------- 名稱正規化與別名索引（預約系統名稱 ↔ 價目項目） ----------
    // 全形半形、括號樣式、空白差異都視為相同
    function normalizeName(s) {
        return String(s == null ? '' : s).normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]+/g, '').toLowerCase();
    }

    /**
     * 建立「名稱/別名 → 項目」索引。
     * @returns {{map: Map<string, Object>, conflicts: Array<{key:string, items:Object[]}>}}
     */
    function buildNameIndex(categories) {
        const map = new Map();
        const conflicts = [];
        (categories || []).forEach(cat => (cat.items || []).forEach(item => {
            const names = [item.name].concat(Array.isArray(item.aliases) ? item.aliases : []);
            names.forEach(n => {
                const key = normalizeName(n);
                if (!key) return;
                const prev = map.get(key);
                if (prev && prev !== item) {
                    const c = conflicts.find(x => x.key === key);
                    if (c) { if (!c.items.includes(item)) c.items.push(item); }
                    else conflicts.push({ key, items: [prev, item] });
                } else if (!prev) {
                    map.set(key, item);
                }
            });
        }));
        return { map, conflicts };
    }

    // ---------- 整單擇優計價（計算器與預約單共用） ----------
    /**
     * @param {Object} opts
     * @param {string[]} opts.itemIds        已選項目 ID（可重複）
     * @param {Map<string,Object>} opts.itemsById
     * @param {Object[]} [opts.combos]
     * @param {string} [opts.identity]       'general'|'student'|'birthday'（或 一般/學生/壽星）
     * @param {Date} [opts.date]             計算優惠的基準日；不傳為現在
     */
    function calcOrder(opts) {
        const itemsById = opts.itemsById;
        const combos = Array.isArray(opts.combos) ? opts.combos : [];
        const date = opts.date;
        const info = identityInfo(opts.identity || 'general');

        const known = [];
        const unknownIds = [];
        (opts.itemIds || []).forEach(id => (itemsById.get(id) ? known : unknownIds).push(id));

        // ── 促銷側：套餐（依清單順序、符合即套用）＋單項促銷 ──
        let pool = known.slice();
        const promoLines = [];
        let promoTotal = 0;
        let originalTotal = 0;

        combos.forEach(combo => {
            const p = getActivePromotion(combo.promotions, date);
            const need = combo.itemIds;
            if (!p || !Array.isArray(need) || need.length === 0) return;
            const rest = pool.slice();
            for (const id of need) {
                const k = rest.indexOf(id);
                if (k === -1) return;
                rest.splice(k, 1);
            }
            pool = rest;
            const names = need.map(id => itemsById.get(id).name);
            const orig = need.reduce((s, id) => s + itemsById.get(id).price, 0);
            promoLines.push({
                ids: need.slice(), name: names.join('、'), itemNames: names, comboName: combo.name,
                originalPrice: orig, finalPrice: p.price, hasPromo: true,
                promoName: p.label || combo.name, promoStart: p.start, promoEnd: p.end,
                note: p.label || combo.name, isCombo: true, isIdentity: false
            });
            promoTotal += p.price;
            originalTotal += orig;
        });

        pool.forEach(id => {
            const item = itemsById.get(id);
            const p = getActivePromotion(item.promotions, date);
            const finalPrice = p ? p.price : item.price;
            promoLines.push({
                ids: [id], name: item.name, itemNames: [item.name], comboName: null,
                originalPrice: item.price, finalPrice, hasPromo: p !== null,
                promoName: p ? p.label : null, promoStart: p ? p.start : null, promoEnd: p ? p.end : null,
                note: p ? p.label : null, isCombo: false, isIdentity: false
            });
            promoTotal += finalPrice;
            originalTotal += item.price;
        });

        // ── 身分側：每項原價 × 折扣率（不含任何限時優惠／套餐） ──
        let identityTotal = null;
        let identityLines = [];
        const identityLabel = info ? info.label + info.rateText + '優惠' : '';
        if (info && known.length > 0) {
            const inCombo = new Set();
            const knownSet = new Set(known);
            combos.forEach(combo => {
                if (getActivePromotion(combo.promotions, date) && Array.isArray(combo.itemIds) && combo.itemIds.length &&
                    combo.itemIds.every(id => knownSet.has(id))) {
                    combo.itemIds.forEach(id => inCombo.add(id));
                }
            });
            identityTotal = 0;
            identityLines = known.map(id => {
                const item = itemsById.get(id);
                const finalPrice = Math.round(item.price * info.rate);
                identityTotal += finalPrice;
                return {
                    ids: [id], name: item.name, itemNames: [item.name], comboName: null,
                    originalPrice: item.price, finalPrice, hasPromo: true,
                    promoName: null, promoStart: null, promoEnd: null,
                    note: info.label + info.rateText,
                    identityMsg: inCombo.has(id)
                        ? `【${info.label}原價${info.rateText}更划算，套餐優惠未套用】`
                        : `【${info.label}原價${info.rateText}更划算】`,
                    isCombo: false, isIdentity: true
                };
            });
        }

        // ── 整單擇優：身分總額 <= 促銷總額 才採用身分優惠 ──
        const usedIdentity = identityTotal !== null && identityTotal <= promoTotal;
        const finalTotal = usedIdentity ? identityTotal : promoTotal;
        return {
            identity: info ? info.key : 'general', identityInfo: info, identityLabel,
            usedIdentity, originalTotal, promoTotal, identityTotal, finalTotal,
            savings: originalTotal - finalTotal,
            points: Math.floor(finalTotal / RULES.pointsPerSpend),
            lines: usedIdentity ? identityLines : promoLines,
            promoLines, identityLines, unknownIds
        };
    }

    // ---------- 月份規則 ----------
    // 每月 offerSwitchDay 日(含)起用次月，之前用當月。回傳 'YYYY-MM'
    function expectedMonth(d) {
        d = d instanceof Date ? d : new Date();
        const t = d.getDate() >= RULES.offerSwitchDay
            ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
            : new Date(d.getFullYear(), d.getMonth(), 1);
        return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
    }
    function monthRange(ym) {
        const [y, m] = ym.split('-').map(Number);
        const pad = n => String(n).padStart(2, '0');
        const last = new Date(y, m, 0).getDate();
        return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
    }
    function prevMonth(ym) {
        const [y, m] = ym.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    // ---------- 資料異常檢查（check.html 與編輯器共用） ----------
    function isValidDateStr(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return false;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
    }

    /**
     * @param {Object} data  services.json 內容
     * @param {Object} [opts]
     * @param {string} [opts.month] 'YYYY-MM'，檢查「前一個月有優惠、該月卻沒設定」的項目
     * @returns {{issues: Array, stats: Object}}  issue: {level:'error'|'warn', code, msg, id, name}
     */
    function validateServices(data, opts) {
        opts = opts || {};
        const issues = [];
        const add = (level, code, msg, node) => issues.push({ level, code, msg, id: node && node.id, name: node && node.name });
        const cats = (data && data.categories) || [];
        const combos = (data && data.combos) || [];
        const items = [];
        cats.forEach(c => (c.items || []).forEach(i => items.push(i)));
        const byId = new Map();

        // 重複 ID、必要欄位
        const seen = new Map();
        items.concat(combos).forEach(n => {
            const tag = n.name ? `「${n.name}」` : '（未命名）';
            if (!n.id) add('error', 'E_MISSING', `${tag} 缺少 ID`, n);
            else if (seen.has(n.id)) add('error', 'E_DUP_ID', `ID「${n.id}」重複：${tag} 與「${seen.get(n.id).name || '未命名'}」`, n);
            else seen.set(n.id, n);
            if (!n.name || !String(n.name).trim()) add('error', 'E_MISSING', `ID「${n.id || '?'}」缺少名稱`, n);
        });
        items.forEach(i => {
            byId.set(i.id, i);
            if (typeof i.price !== 'number' || !isFinite(i.price) || i.price < 0) add('error', 'E_MISSING', `「${i.name}」的原價不是有效數字`, i);
        });

        // 名稱／別名衝突（會讓預約單比對到錯的項目）
        const ni = buildNameIndex(cats);
        ni.conflicts.forEach(c => {
            add('error', 'E_NAME_CONFLICT', `名稱或別名「${c.items.map(x => x.name).join('」與「')}」正規化後相同（${c.key}），預約單會比對錯誤`, c.items[0]);
        });

        // 套餐
        const comboSum = new Map();
        combos.forEach(c => {
            const ids = Array.isArray(c.itemIds) ? c.itemIds : [];
            if (ids.length < 2) add('error', 'E_COMBO_SIZE', `套餐「${c.name}」包含的項目少於 2 個`, c);
            let sum = 0, missing = false;
            ids.forEach(id => {
                const it = byId.get(id);
                if (!it) { missing = true; add('error', 'E_COMBO_REF', `套餐「${c.name}」引用了不存在的項目 ID「${id}」`, c); }
                else sum += it.price || 0;
            });
            comboSum.set(c, missing ? null : sum);
        });

        // 優惠（項目與套餐）
        const range = opts.month ? monthRange(opts.month) : null;
        const prevRange = opts.month ? monthRange(prevMonth(opts.month)) : null;
        const covers = (promos, r) => (promos || []).some(p => isValidDateStr(p.start) && isValidDateStr(p.end) && p.start <= r.end && p.end >= r.start);
        let monthCovered = 0;
        items.concat(combos).forEach(n => {
            const isCombo = Array.isArray(n.itemIds);
            const base = isCombo ? comboSum.get(n) : n.price;
            const promos = Array.isArray(n.promotions) ? n.promotions : [];
            const valid = [];
            promos.forEach((p, idx) => {
                const lab = `「${n.name}」的優惠「${p.label || '#' + (idx + 1)}」`;
                let ok = true;
                if (!isValidDateStr(p.start) || !isValidDateStr(p.end)) { add('error', 'E_DATE_FORMAT', `${lab} 的日期格式不正確（需為 YYYY-MM-DD）`, n); ok = false; }
                else if (p.start > p.end) { add('error', 'E_DATE_ORDER', `${lab} 的開始日（${p.start}）晚於結束日（${p.end}）`, n); ok = false; }
                if (typeof p.price !== 'number' || !isFinite(p.price) || p.price <= 0) add('error', 'E_PROMO_PRICE', `${lab} 的優惠價必須大於 0`, n);
                else if (base != null) {
                    if (p.price > base) add('error', 'E_PROMO_PRICE', `${lab} 的優惠價 $${p.price} 高於${isCombo ? '單項合計' : '原價'} $${base}`, n);
                    else if (p.price === base && !isCombo) add('warn', 'W_PROMO_EQUAL', `${lab} 的優惠價與原價相同（$${base}）`, n);
                    else if (p.price === base && isCombo) add('warn', 'W_COMBO_COST', `${lab} 的套餐價與單項合計相同（$${base}），沒有比單買便宜`, n);
                }
                if (ok) valid.push(p);
            });
            const sorted = valid.slice().sort((a, b) => a.start.localeCompare(b.start));
            for (let k = 1; k < sorted.length; k++) {
                if (sorted[k].start <= sorted[k - 1].end) {
                    add('warn', 'W_OVERLAP', `「${n.name}」的優惠期間重疊：「${sorted[k - 1].label || ''}」（${sorted[k - 1].start}~${sorted[k - 1].end}）與「${sorted[k].label || ''}」（${sorted[k].start}~${sorted[k].end}）`, n);
                }
            }
            if (range) {
                if (covers(promos, range)) monthCovered++;
                else if (covers(promos, prevRange)) add('warn', 'W_MONTH_GAP', `「${n.name}」在 ${prevMonth(opts.month)} 有優惠，但 ${opts.month} 沒有設定優惠`, n);
            }
        });
        return {
            issues,
            stats: { items: items.length, combos: combos.length, monthCovered: range ? monthCovered : null, month: opts.month || null }
        };
    }

    global.DeDeUtils = {
        RULES, rateText, identityInfo, parseLocalDate, getActivePromotion, getBestPrice,
        normalizeName, buildNameIndex, calcOrder, expectedMonth, monthRange, prevMonth, validateServices
    };
})(window);
