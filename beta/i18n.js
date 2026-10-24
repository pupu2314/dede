// ==========================================
// DeDe 多國語系 (i18n)
//
// 設計原則
//   1. 繁體中文 (zh-TW) 是正本：services.json 與 ui.zh-TW.json 就是中文內容。
//   2. 其他語言只是「疊加層」：缺哪個字串／欄位，就自動退回中文，不會壞掉。
//   3. 新增語言只需放檔案、在 i18n/languages.json 登記一行，不用改程式。
//
// 檔案
//   i18n/languages.json     支援的語言清單
//   i18n/ui.<code>.json     介面文字（key → 文字，可含 {參數}）
//   i18n/data.<code>.json   服務資料翻譯（以 services.json 裡的 id 對應；可只翻一部分）
// ==========================================
(function (global) {
    'use strict';

    const BASE = 'i18n/';
    const STORE_KEY = 'dede_lang';

    let config = { default: 'zh-TW', languages: [{ code: 'zh-TW', name: '繁體中文' }] };
    let lang = 'zh-TW';
    let ui = {};          // 目前語言的介面文字
    let uiBase = {};      // 預設語言（中文）的介面文字，缺字時退回用
    let data = {};        // 目前語言的服務資料翻譯（預設語言為空物件＝直接用 services.json 原文）
    const listeners = [];

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    async function getJson(file, optional) {
        try {
            const res = await fetch(BASE + file, { cache: 'no-cache' }); // 每次向伺服器確認，翻譯更新後才會馬上生效
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            if (!optional) console.warn('[i18n] 載入失敗：' + file, e);
            return null;
        }
    }

    // ---------- 語言比對與偵測 ----------
    // 回傳「已登記」的語言代碼，找不到回傳 null。
    // 先完全比對 (en-US 對 en-US)，再比對主語言 (en-US → en；zh-HK → zh-TW)。
    function matchLang(tag) {
        if (!tag) return null;
        const t = String(tag).toLowerCase();
        const list = config.languages;
        const exact = list.find((l) => l.code.toLowerCase() === t);
        if (exact) return exact.code;
        const base = t.split('-')[0];
        const same = list.find((l) => l.code.toLowerCase().split('-')[0] === base);
        return same ? same.code : null;
    }

    function detect() {
        // 1. 網址 ?lang=（方便把指定語言的連結傳給客人）
        const q = matchLang(new URLSearchParams(location.search).get('lang'));
        if (q) return q;
        // 2. 上次的選擇
        try {
            const s = matchLang(localStorage.getItem(STORE_KEY));
            if (s) return s;
        } catch (e) { /* 無痕模式讀不到就略過 */ }
        // 3. 瀏覽器語言
        const prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
        for (const tag of prefs) {
            const m = matchLang(tag);
            if (m) return m;
        }
        return config.default;
    }

    async function load(code) {
        ui = (await getJson('ui.' + code + '.json')) || {};
        data = (code === config.default) ? {} : ((await getJson('data.' + code + '.json', true)) || {});
        lang = code;
        const meta = config.languages.find((l) => l.code === code) || {};
        document.documentElement.lang = code;
        document.documentElement.dir = meta.dir === 'rtl' ? 'rtl' : 'ltr';
    }

    // ---------- 介面文字 ----------
    const fill = (s, params) => String(s).replace(/\{(\w+)\}/g, (m, k) => (
        params && Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m
    ));

    // 純文字（給 textContent 用，或自行 esc 後再放進 innerHTML）
    function t(key, params) {
        const s = ui[key] != null ? ui[key] : (uiBase[key] != null ? uiBase[key] : key);
        return fill(s, params);
    }

    // 給 innerHTML 用：譯文先跳脫，\n 轉成 <br>；params 視為「已是安全的 HTML」直接帶入
    function tHtml(key, params) {
        const s = ui[key] != null ? ui[key] : (uiBase[key] != null ? uiBase[key] : key);
        return fill(esc(s), params).replace(/\n/g, '<br>');
    }

    // 套用 HTML 裡的 data-i18n="key"（textContent）與 data-i18n-label="key"（aria-label）
    function applyStatic(root) {
        (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
        (root || document).querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
    }

    // ---------- 服務資料翻譯 ----------
    // kind: 'categories' | 'items' | 'combos'；翻譯缺漏時退回 services.json 的中文原文
    function field(kind, obj, name) {
        const node = obj && obj.id != null && data[kind] && data[kind][obj.id];
        const v = node && node[name];
        if (typeof v === 'string' && v.trim()) return v;
        return (obj && obj[name]) || '';
    }
    const nameOf = (kind, obj) => field(kind, obj, 'name');
    const descOf = (kind, obj) => field(kind, obj, 'desc');

    // 分類的「快速跳轉」短名稱：優先用翻譯的 short，其次翻譯的 name，最後是中文去掉「男士專屬」
    function catShort(cat) {
        const node = cat && cat.id != null && data.categories && data.categories[cat.id];
        if (node && node.short) return node.short;
        if (node && node.name) return node.name;
        return String(cat.name || '').replace('男士專屬', '');
    }

    function monthName(m) {
        try { return new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2000, m - 1, 1)); }
        catch (e) { return String(m); }
    }

    // 優惠標籤：「N月優惠」自動換成當地語言；其他標籤查 promoLabels；都沒有就維持原文
    function promoLabel(label) {
        if (lang === config.default) return label;
        const m = /^(\d{1,2})月優惠$/.exec(String(label || '').trim());
        if (m) return t('promo.monthly', { month: +m[1], monthName: monthName(+m[1]) });
        const map = data.promoLabels;
        return (map && map[label]) || label;
    }

    // ---------- 數字與金額 ----------
    const num = (n) => Math.round(n).toLocaleString(lang);
    const money = (n) => t('money', { amount: num(n) });

    // ---------- 語言切換 ----------
    function persist(code) {
        try { localStorage.setItem(STORE_KEY, code); } catch (e) { /* ignore */ }
        try {
            const u = new URL(location.href);
            u.searchParams.set('lang', code);
            history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (e) { /* ignore */ }
    }

    async function setLang(code) {
        const m = matchLang(code);
        if (!m || m === lang) return;
        await load(m);
        persist(m);
        applyStatic();
        listeners.forEach((fn) => { try { fn(lang); } catch (e) { console.error(e); } });
    }

    function buildSelect(sel) {
        sel.innerHTML = config.languages
            .map((l) => `<option value="${esc(l.code)}">${esc(l.name)}</option>`).join('');
        sel.value = lang;
        sel.addEventListener('change', () => setLang(sel.value));
    }

    async function init() {
        config = (await getJson('languages.json')) || config;
        uiBase = (await getJson('ui.' + config.default + '.json')) || {};
        await load(detect());
        applyStatic();
        return lang;
    }

    global.I18n = {
        init, setLang, buildSelect, applyStatic,
        t, tHtml, esc, num, money, monthName,
        nameOf, descOf, catShort, promoLabel,
        onChange: (fn) => listeners.push(fn),
        get lang() { return lang; },
        get defaultLang() { return config.default; },
        get languages() { return config.languages; }
    };
})(window);
