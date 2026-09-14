// ==UserScript==
// @name         选中即译（Select Translate）
// @namespace    select-translate
// @version      1.0.0
// @description  在酒馆(SillyTavern)里选中非中文文字，自动弹出中文翻译，日文附罗马音。仅在存在 #chat 的页面生效。
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// ================================================================
//  Select Translate —— SillyTavern（酒馆）"选中即译"插件
// ----------------------------------------------------------------
//  功能：
//    1. 在页面里选中一段"非中文"文字（日文/英文/韩文等）
//    2. 选区旁边自动出现一个"译"小按钮
//    3. 点按钮弹出浮窗：原文 + 中文翻译 + 读音
//       - 日文：自动给出罗马音（假名本地转换，汉字部分尝试查词典）
//       - 韩文：尽力给出罗马音
//       - 其他语言：只给中文翻译
//    4. 浮窗可拖动、可复制、可关闭
//
//  翻译源：谷歌翻译（自动识别语种，优先）→ MyMemory（备用，断网谷歌时自动切换）
//  读音源：本地假名→罗马音表（Hepburn）+ Jotoba 词典（整词读音/逐字音读）
//
//  安装：
//    方式一（扩展）：
//      把整个 select-translate 文件夹放进
//        public/scripts/extensions/  （或 extensions/third-party/）
//      刷新页面，扩展面板启用 "选中即译"。
//    方式二（脚本）：
//      脚本管理 → 全局脚本 → 导入 select-translate.user.js → 启用。
//
//  兼容性：纯 DOM + fetch 实现，不依赖酒馆内部 API。
// ================================================================
(function () {
    'use strict';

    var PANEL_ID = 'strans-panel';
    var BTN_ID = 'strans-btn';

    // ================================================================
    // 假名 → 罗马音（Hepburn）
    // ================================================================
    var KANA = {
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
        'わ': 'wa', 'を': 'o', 'ん': 'n',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
        'ゔ': 'vu',
        'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
        'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa', 'ゕ': 'ka', 'ゖ': 'ke'
    };
    var YOON = {
        'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
        'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
        'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
        'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
        'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
        'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
        'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
        'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
        'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
        'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
        'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
        'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
        'てぃ': 'ti', 'でぃ': 'di', 'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo'
    };

    // 片假名转平假名（偏移 0x60）
    function toHiragana(ch) {
        var cp = ch.charCodeAt(0);
        if (cp >= 0x30a1 && cp <= 0x30f6) return String.fromCharCode(cp - 0x60);
        return ch;
    }

    // 整段转罗马音；非假名字符（汉字/英文等）原样保留
    function kanaToRomaji(str) {
        var out = '';
        for (var i = 0; i < str.length; i++) {
            var c = toHiragana(str[i]);
            if (c === 'っ') { // 促音：双写下一个辅音；ch 前用 t（いっち→itchi, まっし→masshi）
                var n1 = toHiragana(str[i + 1] || '');
                var n2 = toHiragana(str[i + 2] || '');
                var nxRom = YOON[n1 + n2] || KANA[n1] || null;
                if (nxRom) {
                    out += nxRom.indexOf('ch') === 0 ? 't' + nxRom : nxRom[0] + nxRom;
                    i += YOON[n1 + n2] ? 2 : 1;
                }
                continue;
            }
            if (c === 'ー') { // 长音：重复前一个元音
                var m = out.match(/([aeiou])$/);
                if (m) out += m[1];
                continue;
            }
            if (c === 'ん') { // 拨音
                var nxt = toHiragana(str[i + 1] || '');
                if (/[あいうえおやゆよんゃゅょ]/.test(nxt)) out += "n'";
                else if (/[ばぱま]/.test(nxt)) out += 'm';
                else out += 'n';
                continue;
            }
            var two = YOON[c + toHiragana(str[i + 1] || '')];
            if (two) { out += two; i++; continue; }
            var one = KANA[c];
            if (one) { out += one; continue; }
            out += str[i]; // 非假名，原样保留
        }
        return out;
    }

    // ================================================================
    // 语言 / 文字判断
    // ================================================================
    function hasKana(s) { return /[\u3040-\u30ff]/.test(s); }
    function hasHangul(s) { return /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(s); }
    function hasLatin(s) { return /[a-zA-Z\u00c0-\u024f]/.test(s); }

    // 是否为"值得翻译的非中文选区"
    function isForeignSelection(text) {
        if (!text || !text.trim()) return false;
        // 去掉中文、空白、数字、常见标点后，若还剩至少 1 个字母/假名/谚文 → 是
        var rest = text.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef0-9\s，。！？、；：""''（）《》【】,.!?;:'"()\[\]{}<>~\-—_]/g, '');
        return rest.length > 0;
    }

    function detectLang(text) {
        if (hasKana(text)) return 'ja';
        if (hasHangul(text)) return 'ko';
        return 'other';
    }

    // ================================================================
    // 翻译（谷歌优先 → MyMemory 回退）
    // ================================================================
    function fetchJson(url, timeout, init) {
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, timeout || 8000);
        return fetch(url, Object.assign({ signal: ctrl.signal }, init || {})).then(function (r) {
            return r.json();
        }).finally(function () { clearTimeout(timer); });
    }

    function googleTranslate(text) {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + encodeURIComponent(text);
        return fetchJson(url, 6000).then(function (j) {
            if (!j || !Array.isArray(j[0])) throw new Error('bad response');
            var tr = j[0].map(function (x) { return x && x[0] ? x[0] : ''; }).join('');
            var src = j[2] || '';
            if (!tr) throw new Error('empty');
            return { translation: tr, source: src };
        });
    }

    function myMemoryTranslate(text, lang) {
        var pair = { ja: 'ja', ko: 'ko', other: 'en' }[lang] || 'en';
        var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + pair + '|zh-CN';
        return fetchJson(url, 12000).then(function (j) {
            var tr = j && j.responseData && j.responseData.translatedText;
            if (!tr) throw new Error('empty');
            // MyMemory 偶尔返回重复/乱码，简单清洗
            tr = String(tr).replace(/\s+/g, ' ').trim();
            if (!tr) throw new Error('empty');
            return { translation: tr, source: pair };
        });
    }

    function translateText(text, lang) {
        return googleTranslate(text).catch(function () {
            return myMemoryTranslate(text, lang);
        });
    }

    // ================================================================
    // 读音
    // ================================================================
    // Jotoba 词典：整词读音（支持跨域）。只采纳覆盖选区一半以上的整词，
    // 避免长句只匹配到开头的短词导致读音不完整。
    async function jotobaReading(text) {
        var resp = null;
        try {
            resp = await fetchJson('https://jotoba.de/api/search/words', 8000, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: text, language: 'English' })
            });
        } catch (e) { return null; }
        if (!resp) return null;
        var words = resp.words || [];
        var total = text.replace(/[^\u3040-\u30ff\u4e00-\u9fff]/g, '').length;
        for (var i = 0; i < words.length; i++) {
            var r = words[i] && words[i].reading && words[i].reading.kana;
            if (!r || !hasKana(r)) continue;
            var len = r.replace(/[^\u3040-\u30ff\u4e00-\u9fff]/g, '').length;
            if (total > 0 && len / total >= 0.5) {
                return { type: 'word', romaji: kanaToRomaji(r) };
            }
        }
        return null;
    }

    // 日文读音：纯假名直接转；含汉字则查 Jotoba 整词，未匹配则给出假名部分
    async function getReading(text, lang) {
        if (lang === 'ja') {
            var local = kanaToRomaji(text);
            if (!/[\u4e00-\u9fff]/.test(text)) {
                return { text: local, note: '' };
            }
            var dict = await jotobaReading(text);
            if (dict && dict.type === 'word') {
                return { text: dict.romaji, note: '词典读音' };
            }
            return { text: local, note: '含汉字，整句未匹配词典，已转假名部分（汉字照写）' };
        }
        return { text: '', note: '' };
    }

    // ================================================================
    // UI
    // ================================================================
    var btn = null;
    var panel = null;
    var lastText = '';

    function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

    function getSelectionInfo() {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
        var text = sel.toString().replace(/\s+/g, ' ').trim();
        if (!isForeignSelection(text)) return null;
        // 选区在我们自己的浮窗/按钮里则忽略
        var node = sel.anchorNode;
        var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
        if (el && el.closest && el.closest('#' + PANEL_ID + ', #' + BTN_ID)) return null;
        var rect = sel.getRangeAt(0).getBoundingClientRect();
        return { text: text, rect: rect };
    }

    function buildBtn() {
        btn = document.createElement('div');
        btn.id = BTN_ID;
        btn.textContent = '译';
        btn.title = '翻译所选文字';
        document.body.appendChild(btn);
    }

    function buildPanel() {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<div class="st-head"><span class="st-title">选中即译</span><span class="st-close" title="关闭">×</span></div>' +
            '<div class="st-row"><div class="st-label">原文</div><div class="st-body st-orig"></div><button class="st-copy" data-copy="orig">复制</button></div>' +
            '<div class="st-row st-reading-row" style="display:none"><div class="st-label">读音</div><div class="st-body st-reading"></div><button class="st-copy" data-copy="reading">复制</button></div>' +
            '<div class="st-row"><div class="st-label">译文</div><div class="st-body st-trans"></div><button class="st-copy" data-copy="trans">复制</button></div>';
        document.body.appendChild(panel);

        panel.querySelector('.st-close').addEventListener('click', function (e) {
            e.stopPropagation();
            hidePanel();
        });
        panel.querySelectorAll('.st-copy').forEach(function (b) {
            b.addEventListener('click', function (e) {
                e.stopPropagation();
                var key = b.getAttribute('data-copy');
                var map = { orig: lastText, reading: panel.__reading || '', trans: panel.__trans || '' };
                var val = map[key];
                if (!val) return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(val).then(function () {
                        b.textContent = '已复制';
                        setTimeout(function () { b.textContent = '复制'; }, 1200);
                    }).catch(function () { fallbackCopy(val, b); });
                } else {
                    fallbackCopy(val, b);
                }
            });
        });

        // 拖动
        var dragging = null;
        panel.querySelector('.st-head').addEventListener('pointerdown', function (e) {
            dragging = { sx: e.clientX, sy: e.clientY, lx: panel.offsetLeft, ty: panel.offsetTop };
            e.preventDefault();
        });
        window.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            panel.style.left = clamp(dragging.lx + e.clientX - dragging.sx, 4, window.innerWidth - panel.offsetWidth - 4) + 'px';
            panel.style.top = clamp(dragging.ty + e.clientY - dragging.sy, 4, window.innerHeight - panel.offsetHeight - 4) + 'px';
        });
        window.addEventListener('pointerup', function () { dragging = null; });
    }

    function fallbackCopy(text, btnEl) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); btnEl.textContent = '已复制'; setTimeout(function () { btnEl.textContent = '复制'; }, 1200); } catch (e) { /* 忽略 */ }
        document.body.removeChild(ta);
    }

    function positionBtn(rect) {
        var bw = btn.offsetWidth;
        var bh = btn.offsetHeight;
        var x = clamp(rect.right + 8, 4, window.innerWidth - bw - 4);
        var y = clamp(rect.top - bh / 2, 4, window.innerHeight - bh - 4);
        btn.style.left = x + 'px';
        btn.style.top = y + 'px';
        btn.style.display = 'block';
    }

    function showBtn(info) {
        if (!btn) return;
        lastText = info.text;
        btn.style.display = 'block';
        positionBtn(info.rect);
    }

    function hideBtn() {
        if (btn) btn.style.display = 'none';
    }

    function showPanel(nearRect) {
        if (!panel) return;
        panel.style.display = 'block';
        var w = panel.offsetWidth;
        var x = clamp(nearRect ? nearRect.left : (window.innerWidth - w - 16), 8, window.innerWidth - w - 8);
        var y = clamp(nearRect ? nearRect.bottom + 8 : 80, 8, window.innerHeight - panel.offsetHeight - 8);
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
        panel.classList.remove('st-loading');
    }

    function hidePanel() {
        if (panel) panel.style.display = 'none';
    }

    function setPanelLoading() {
        panel.querySelector('.st-trans').textContent = '翻译中…';
        panel.querySelector('.st-orig').textContent = lastText;
        var rr = panel.querySelector('.st-reading-row');
        rr.style.display = 'none';
        rr.querySelector('.st-reading').textContent = '';
        rr.querySelector('.st-note') && (rr.querySelector('.st-note').textContent = '');
        panel.__reading = '';
        panel.__trans = '';
        panel.classList.add('st-loading');
    }

    async function runTranslate() {
        if (!panel) return;
        // 点击时重读当前选区，避免选区已变化却翻译旧文本
        var info = getSelectionInfo();
        if (info && info.text) lastText = info.text;
        if (!lastText) return;
        setPanelLoading();
        showPanel(info ? info.rect : null);
        var lang = detectLang(lastText);
        try {
            var [tr, rd] = await Promise.all([translateText(lastText, lang), getReading(lastText, lang)]);
            var transEl = panel.querySelector('.st-trans');
            transEl.textContent = tr.translation;
            panel.__trans = tr.translation;
            var rr = panel.querySelector('.st-reading-row');
            if (rd && rd.text) {
                rr.style.display = '';
                var readingEl = rr.querySelector('.st-reading');
                readingEl.textContent = rd.text;
                if (rd.note) {
                    if (!rr.querySelector('.st-note')) {
                        var note = document.createElement('div');
                        note.className = 'st-note';
                        rr.appendChild(note);
                    }
                    rr.querySelector('.st-note').textContent = rd.note;
                } else if (rr.querySelector('.st-note')) {
                    rr.querySelector('.st-note').textContent = '';
                }
                panel.__reading = rd.text;
            } else {
                rr.style.display = 'none';
            }
            panel.classList.remove('st-loading');
        } catch (e) {
            panel.querySelector('.st-trans').textContent = '翻译失败：' + (e && e.message ? e.message : '网络错误') + '（可检查网络或重试）';
            panel.classList.remove('st-loading');
        }
    }

    // ================================================================
    // 事件
    // ================================================================
    function onMouseUp(e) {
        if (e.target && e.target.closest && e.target.closest('#' + PANEL_ID + ', #' + BTN_ID)) return;
        setTimeout(function () {
            var info = getSelectionInfo();
            if (info) {
                showBtn(info);
            } else {
                hideBtn();
            }
        }, 10);
    }

    function onSelectionChange() {
        setTimeout(function () {
            var info = getSelectionInfo();
            if (info) showBtn(info);
        }, 150);
    }

    function onDocMouseDown(e) {
        if (e.target && e.target.closest && e.target.closest('#' + PANEL_ID + ', #' + BTN_ID)) return;
        var info = getSelectionInfo();
        if (!info) hideBtn();
    }

    // ================================================================
    // 初始化
    // ================================================================
    var CSS = [
        '#' + BTN_ID + '{position:fixed;z-index:2147483001;display:none;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#5b6cff,#8a5bff);color:#fff;font-size:16px;font-weight:700;line-height:34px;text-align:center;cursor:pointer;box-shadow:0 4px 14px rgba(80,80,220,.45);user-select:none;border:1px solid rgba(255,255,255,.25);}',
        '#' + BTN_ID + ':hover{filter:brightness(1.12);}',
        '#' + PANEL_ID + '{position:fixed;z-index:2147483002;display:none;width:min(360px,92vw);background:rgba(24,26,36,.96);color:#e8eaf2;border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.5);backdrop-filter:blur(10px);font:13px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden;}',
        '#' + PANEL_ID + ' .st-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,.05);cursor:move;border-bottom:1px solid rgba(255,255,255,.08);}',
        '#' + PANEL_ID + ' .st-title{font-weight:700;color:#aeb8ff;}',
        '#' + PANEL_ID + ' .st-close{width:22px;height:22px;line-height:20px;text-align:center;border-radius:6px;cursor:pointer;color:#9aa0b8;}',
        '#' + PANEL_ID + ' .st-close:hover{background:rgba(255,80,80,.25);color:#fff;}',
        '#' + PANEL_ID + ' .st-row{position:relative;padding:8px 12px 8px 66px;border-bottom:1px solid rgba(255,255,255,.05);}',
        '#' + PANEL_ID + ' .st-row:last-child{border-bottom:none;}',
        '#' + PANEL_ID + ' .st-label{position:absolute;left:12px;top:10px;font-size:11px;color:#8b93b0;border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:1px 6px;}',
        '#' + PANEL_ID + ' .st-body{white-space:pre-wrap;word-break:break-word;max-height:140px;overflow-y:auto;padding-right:44px;}',
        '#' + PANEL_ID + ' .st-trans{color:#d7f0b0;}',
        '#' + PANEL_ID + ' .st-reading{color:#ffd9a0;}',
        '#' + PANEL_ID + ' .st-note{font-size:11px;color:#8b93b0;margin-top:3px;}',
        '#' + PANEL_ID + ' .st-copy{position:absolute;right:8px;bottom:8px;font-size:11px;color:#8b93b0;background:none;border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:2px 8px;cursor:pointer;}',
        '#' + PANEL_ID + ' .st-copy:hover{color:#fff;border-color:#aeb8ff;}',
        '#' + PANEL_ID + '.st-loading .st-trans{color:#8b93b0;}'
    ].join('\n');

    // ================================================================
    // 初始化
    // ================================================================
    function boot() {
        if (document.getElementById(BTN_ID)) return;
        var style = document.createElement('style');
        style.id = 'strans-style';
        style.textContent = CSS;
        document.head.appendChild(style);
        buildBtn();
        buildPanel();

        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('mousedown', onDocMouseDown);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') hidePanel();
        });

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            runTranslate();
        });
    }

    // 稳健初始化：页面已就绪立即启动；否则等 DOMContentLoaded，并带轮询兜底
    // （部分宿主/扩展注入场景不会触发 DOMContentLoaded）
    function tryBoot() {
        if (document && document.documentElement && document.body) {
            boot();
            return true;
        }
        return false;
    }

    // 稳健初始化（油猴版）：等酒馆 #chat 出现再启动
    var tries = 0;
    function waitChat() {
        if (document.getElementById('chat')) { tryBoot(); return; }
        if (tries++ < 200) setTimeout(waitChat, 300);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitChat);
    } else {
        waitChat();
    }
})();
