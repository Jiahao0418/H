// ==UserScript==
// @name         手机视频嗅探 · 全屏手势播放器
// @name:en      Mobile Video Sniffer & Gesture Player
// @namespace    https://github.com/superz/mtvsp
// @version      1.0.0
// @description  一键嗅探网页全部视频（含 Shadow DOM / 动态插入 / 跨框架嵌套 / blob·m3u8 流），屏幕边缘悬浮球 + 数量角标，列表点选全屏播放：左右滑动快进快退（实时画面预览）、左半屏调亮度、右半屏调音量、0.5x~3x 倍速、设置记忆、返回键退出全屏、手势引导。
// @author       Super Z
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ============================ 可调配置 ============================ */
  const CONFIG = {
    FULL_SWIPE_SECONDS: 20,                   // 左右滑满一整屏宽 ≈ 快进/快退秒数
    SEEK_PREVIEW_MS: 200,                     // 拖动中实时画面预览（真实 seek）的节流间隔
    SPEEDS: [0.5, 0.75, 1, 1.25, 1.5, 2, 3],  // 倍速档位（B站式全档）
    MIN_W: 120, MIN_H: 75,                    // 忽略过小的视频（广告埋点/统计用）
    SCAN_MS: 1200,                            // 视频嗅探扫描间隔
    AUTO_HIDE_MS: 3500,                       // 全屏控制栏自动隐藏时间
    BALL_SIZE: 48                             // 悬浮球直径 px
  };

  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ============================ 小工具 ============================ */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = (m < 10 ? '0' : '') + m, ss = (sec < 10 ? '0' : '') + sec;
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('mtvsp_' + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem('mtvsp_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const SVG = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M18.3 5.71 12 12.01l-6.3-6.3-1.4 1.41 6.29 6.3-6.3 6.29 1.42 1.42 6.29-6.3 6.29 6.3 1.42-1.42-6.3-6.29 6.3-6.3z"/></svg>'
  };

  /* ============================ 样式 ============================ */
  const CSS = `
#mtvsp-ball{position:fixed;left:0;top:0;width:48px;height:48px;border-radius:50%;background:rgba(18,18,20,.62);
border:1px solid rgba(255,255,255,.42);display:none;align-items:center;justify-content:center;z-index:2147483640;
box-shadow:0 2px 12px rgba(0,0,0,.45);opacity:.5;transition:opacity .25s;box-sizing:border-box;
-webkit-tap-highlight-color:transparent;touch-action:none;will-change:transform}
#mtvsp-ball.mtvsp-t{opacity:1}
#mtvsp-ball svg{width:22px;height:22px;fill:#fff;pointer-events:none}
#mtvsp-ball .mtvsp-badge{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;border-radius:10px;background:#ff3b30;
color:#fff;font:bold 12px/20px -apple-system,'Segoe UI',Roboto,'Noto Sans SC',sans-serif;text-align:center;padding:0 5px;
box-sizing:border-box;pointer-events:none;display:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}
#mtvsp-mask{position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.35);z-index:2147483643;display:none}
#mtvsp-panel{position:fixed;left:0;right:0;bottom:0;z-index:2147483644;background:#1c1c1e;color:#ececec;border-radius:16px 16px 0 0;
transform:translateY(105%);transition:transform .25s ease;max-height:56vh;display:flex;flex-direction:column;
font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans SC','PingFang SC',sans-serif;box-shadow:0 -8px 30px rgba(0,0,0,.5)}
#mtvsp-panel.mtvsp-open{transform:translateY(0)}
.mtvsp-ph{display:flex;align-items:center;padding:14px 16px 8px;font-size:15px;font-weight:600;flex:none}
.mtvsp-ph .mtvsp-cnt{color:#ff5f57;font-size:13px;margin-left:8px;font-weight:500}
.mtvsp-pclose{margin-left:auto;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.12);
display:flex;align-items:center;justify-content:center}
.mtvsp-pclose svg{width:15px;height:15px;fill:#fff}
.mtvsp-plist{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px 8px 18px}
.mtvsp-item{display:flex;align-items:center;gap:12px;padding:11px 10px;border-radius:12px}
.mtvsp-item:active{background:rgba(255,255,255,.09)}
.mtvsp-idx{flex:none;width:36px;height:36px;border-radius:9px;background:rgba(255,255,255,.1);
display:flex;align-items:center;justify-content:center}
.mtvsp-idx svg{width:17px;height:17px;fill:#ff5f57}
.mtvsp-meta{flex:1;min-width:0}
.mtvsp-t1{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mtvsp-t2{font-size:11px;color:#98989e;margin-top:3px}
.mtvsp-empty{padding:30px 0 24px;text-align:center;color:#8e8e93;font-size:13px;line-height:1.9}
#mtvsp-player{position:fixed;left:0;top:0;width:100%;height:100%;display:none;background:#000;z-index:2147483647;
touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;animation:mtvsp-in .18s ease-out;
font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans SC','PingFang SC',sans-serif}
@keyframes mtvsp-in{from{opacity:0}to{opacity:1}}
#mtvsp-player .mtvsp-vwrap{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
#mtvsp-player .mtvsp-dim{position:absolute;left:0;top:0;width:100%;height:100%;background:#000;opacity:0;pointer-events:none;z-index:2}
#mtvsp-player .mtvsp-spin{position:absolute;left:50%;top:50%;width:42px;height:42px;margin:-21px 0 0 -21px;z-index:4;
border:3px solid rgba(255,255,255,.22);border-top-color:#fff;border-radius:50%;animation:mtvsp-rot .8s linear infinite;
display:none;pointer-events:none}
@keyframes mtvsp-rot{to{transform:rotate(360deg)}}
.mtvsp-bar{position:absolute;left:0;right:0;z-index:5;padding:10px 14px;opacity:0;transition:opacity .25s;pointer-events:none}
#mtvsp-player.mtvsp-showctrl .mtvsp-bar{opacity:1;pointer-events:auto}
.mtvsp-top{top:0;display:flex;align-items:center;gap:10px;padding-top:12px;background:linear-gradient(rgba(0,0,0,.7),rgba(0,0,0,0))}
.mtvsp-close{width:38px;height:38px;flex:none;border-radius:50%;background:rgba(0,0,0,.3);
display:flex;align-items:center;justify-content:center}
.mtvsp-close svg{width:20px;height:20px;fill:#fff}
.mtvsp-title{flex:1;color:#fff;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92}
.mtvsp-bottom{bottom:0;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.7))}
.mtvsp-pbar{position:relative;height:22px;display:flex;align-items:center}
.mtvsp-track{position:relative;width:100%;height:3px;border-radius:2px;background:rgba(255,255,255,.22)}
.mtvsp-buf{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.35);border-radius:2px}
.mtvsp-played{position:absolute;left:0;top:0;bottom:0;width:0;background:#ff5f57;border-radius:2px}
.mtvsp-knob{position:absolute;right:-7px;top:50%;transform:translateY(-50%);width:13px;height:13px;border-radius:50%;
background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.mtvsp-row{display:flex;align-items:center;gap:10px;margin-top:4px}
.mtvsp-pp{width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center}
.mtvsp-pp svg{width:26px;height:26px;fill:#fff}
.mtvsp-time{flex:1;color:#fff;font-size:12px;opacity:.92;font-variant-numeric:tabular-nums}
.mtvsp-live{display:none;color:#ff5f57;font-size:12px;flex:none}
.mtvsp-speed{flex:none;color:#fff;font-size:12px;background:rgba(255,255,255,.18);padding:6px 12px;border-radius:15px}
.mtvsp-flash{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;background:rgba(0,0,0,.55);color:#fff;
font-size:13px;padding:12px 18px;border-radius:12px;opacity:0;transition:opacity .18s;pointer-events:none;text-align:center;
line-height:1.6;max-width:72%}
.mtvsp-flash .mtvsp-big{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.mtvsp-vind{position:absolute;top:50%;transform:translateY(-50%);z-index:6;pointer-events:none;opacity:0;transition:opacity .2s;
display:flex;flex-direction:column;align-items:center;gap:8px}
.mtvsp-vtrack{width:5px;height:32vh;background:rgba(255,255,255,.28);border-radius:3px;position:relative;overflow:hidden}
.mtvsp-vfill{position:absolute;left:0;bottom:0;width:100%;height:50%;background:#fff;border-radius:3px}
.mtvsp-vtxt{color:#fff;font-size:12px;background:rgba(0,0,0,.55);padding:4px 10px;border-radius:11px;white-space:nowrap}
.mtvsp-menu{position:absolute;right:12px;bottom:70px;z-index:7;background:rgba(22,22,24,.94);border-radius:12px;overflow:hidden;
display:none;box-shadow:0 6px 20px rgba(0,0,0,.55)}
.mtvsp-menu div{color:#e8e8e8;font-size:13px;padding:10px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,.07)}
.mtvsp-menu div:last-child{border-bottom:0}
.mtvsp-menu div.mtvsp-on{color:#ff5f57;font-weight:700}
.mtvsp-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;background:rgba(0,0,0,.8);color:#f2f2f2;
border-radius:14px;padding:16px 20px;font-size:13px;line-height:2.1;pointer-events:none;opacity:0;transition:opacity .3s;max-width:84%}
.mtvsp-hint b{color:#ffd60a;font-weight:600}
html.mtvsp-lock{overflow:hidden!important}
`;
  function injectStyle() {
    if (document.getElementById('mtvsp-style')) return;
    const st = document.createElement('style');
    st.id = 'mtvsp-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ============================ 全局状态 ============================ */
  const SUBFRAME = window.self !== window.top;
  const videoInfo = new Map();      // video 元素 -> { title }
  const owned = new WeakSet();      // 已被播放器接管的视频
  const frameEntries = new Map();   // 子框架 window -> { id, items, frameEl, hasOwnUI }
  let domDirty = true, scanTick = 0, scanT = 0, frameIdSeq = 1;
  let ownList = [], lastSig = '';
  let panel = null;

  /* ============================ 视频嗅探引擎 ============================ */
  // 深度收集：常规 DOM + 开放 Shadow DOM
  function deepVideos() {
    const out = [];
    const visit = (root) => {
      let w = null;
      try { w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null); } catch (e) { return; }
      let n;
      while ((n = w.nextNode())) {
        if (n.tagName === 'VIDEO') out.push(n);
        else if (n.shadowRoot) visit(n.shadowRoot);
      }
    };
    visit(document);
    return out;
  }
  function isValidVideo(v) {
    try {
      const r = v.getBoundingClientRect();
      if (r.width < CONFIG.MIN_W || r.height < CONFIG.MIN_H) return false;
      const s = getComputedStyle(v);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.01) return false;
      return true;
    } catch (e) { return false; }
  }
  function videoTitle(v) {
    try {
      const a = v.getAttribute('title') || v.getAttribute('aria-label') || v.getAttribute('data-title');
      if (a && a.trim()) return a.trim().slice(0, 60);
      let p = v.parentElement, i = 0;
      while (p && i++ < 4) {
        const t = p.getAttribute && (p.getAttribute('title') || p.getAttribute('aria-label') || p.getAttribute('data-title'));
        if (t && t.trim()) return t.trim().slice(0, 60);
        p = p.parentElement;
      }
      return (document.title || '视频').trim().slice(0, 60) || '视频';
    } catch (e) { return '视频'; }
  }
  function scan() {
    scanTick++;
    let vids = Array.prototype.slice.call(document.querySelectorAll('video'));
    if (domDirty || scanTick % 3 === 0) { vids = deepVideos(); domDirty = false; }
    for (const v of vids) {
      if (owned.has(v) || videoInfo.has(v) || !isValidVideo(v)) continue;
      videoInfo.set(v, { title: videoTitle(v) });
    }
    for (const v of Array.from(videoInfo.keys())) {
      if (!v.isConnected || owned.has(v) || !isValidVideo(v)) videoInfo.delete(v);
    }
    let agg = false;
    for (const [w, en] of Array.from(frameEntries)) {
      if (!en.frameEl || !en.frameEl.isConnected) { frameEntries.delete(w); agg = true; }
    }
    refreshUI();
    if (agg) maybeReport(true);
  }
  function scheduleScan() { clearTimeout(scanT); scanT = setTimeout(scan, 250); }

  /* ============================ 跨框架聚合（iframe 内嵌视频上报/接管） ============================ */
  function buildAllItems() {
    ownList = Array.from(videoInfo.keys());
    const items = ownList.map((v, i) => {
      const inf = videoInfo.get(v) || {};
      return {
        title: inf.title || '视频',
        res: v.videoWidth ? v.videoWidth + '×' + v.videoHeight : '',
        dur: isFinite(v.duration) && v.duration > 0 ? fmtTime(v.duration) : '',
        own: true, i, v
      };
    });
    for (const [, en] of frameEntries) {
      if (en.hasOwnUI) continue; // 大尺寸子框架有自己的悬浮球，避免重复列出
      for (const rep of en.items) {
        items.push({
          title: '[嵌] ' + (rep.t || '视频'),
          res: rep.w ? rep.w + '×' + rep.h : '',
          dur: rep.d ? fmtTime(rep.d) : '',
          own: false, win: en.win,
          msg: rep.self ? { index: rep.i } : { c: rep.c, index: rep.i }
        });
      }
    }
    return items;
  }
  function playItem(it) {
    if (it.own) { openPlayer(it.v); return; }
    try { it.win.postMessage(Object.assign({ type: 'mtvsp:play' }, it.msg), '*'); } catch (e) {}
  }
  function computeReport() {
    const items = ownList.map((v, i) => {
      const inf = videoInfo.get(v) || {};
      return {
        self: 1, i,
        t: inf.title || '视频',
        w: v.videoWidth || 0, h: v.videoHeight || 0,
        d: isFinite(v.duration) && v.duration > 0 ? +v.duration.toFixed(1) : 0
      };
    });
    for (const [, en] of frameEntries) {
      if (en.hasOwnUI) continue;
      for (const rep of en.items) items.push(rep);
    }
    return items;
  }
  function maybeReport(force) {
    if (!SUBFRAME) return;
    const items = computeReport();
    const sig = JSON.stringify(items);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    try { window.parent.postMessage({ type: 'mtvsp:report', items }, '*'); } catch (e) {}
  }
  function onMessage(ev) {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'mtvsp:report') {
      let frameEl = null;
      try {
        for (const f of document.querySelectorAll('iframe')) {
          if (f.contentWindow === ev.source) { frameEl = f; break; }
        }
      } catch (e) {}
      if (!frameEl) return;
      let en = frameEntries.get(ev.source);
      if (!en) { en = { id: frameIdSeq++, win: ev.source, frameEl, items: [], hasOwnUI: false }; frameEntries.set(ev.source, en); }
      en.frameEl = frameEl;
      en.items = Array.isArray(d.items) ? d.items : [];
      const r = frameEl.getBoundingClientRect();
      en.hasOwnUI = r.width >= 300 && r.height >= 180;
      refreshUI();
    } else if (d.type === 'mtvsp:bye') {
      if (frameEntries.delete(ev.source)) refreshUI();
    } else if (d.type === 'mtvsp:play') {
      if (ev.source !== window.parent) return;
      if (d.c != null) {
        for (const [, en] of frameEntries) {
          if (en.id === d.c) { try { en.win.postMessage({ type: 'mtvsp:play', index: d.index }, '*'); } catch (e) {} return; }
        }
        return;
      }
      const v = ownList[d.index | 0];
      if (v) openPlayer(v);
    }
  }
  function sendBye() {
    if (!SUBFRAME) return;
    try { window.parent.postMessage({ type: 'mtvsp:bye' }, '*'); } catch (e) {}
  }

  /* ============================ 边缘悬浮球 ============================ */
  const ball = { el: null, badge: null, x: 0, y: 0, side: 'R', yr: 0.42,
                 drag: false, sx: 0, sy: 0, bx: 0, by: 0, id: null };

  function initBallPos() {
    const saved = store.get('ballPos', null);
    if (saved) { ball.side = saved.side === 'L' ? 'L' : 'R'; ball.yr = clamp(+saved.yr || .42, .06, .94); }
    const S = CONFIG.BALL_SIZE, m = 6;
    ball.x = ball.side === 'R' ? innerWidth - S - m : m;
    ball.y = clamp(ball.yr * innerHeight - S / 2, m, Math.max(m, innerHeight - S - m));
  }
  function setBallPos(x, y) {
    ball.x = x; ball.y = y;
    ball.el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function snapBall() {
    const S = CONFIG.BALL_SIZE, m = 6;
    ball.side = (ball.x + S / 2) < innerWidth / 2 ? 'L' : 'R';
    ball.yr = clamp((ball.y + S / 2) / innerHeight, .06, .94);
    store.set('ballPos', { side: ball.side, yr: +ball.yr.toFixed(3) });
    ball.el.style.transition = 'transform .25s ease';
    setBallPos(ball.side === 'R' ? innerWidth - S - m : m, clamp(ball.y, m, Math.max(m, innerHeight - S - m)));
    setTimeout(() => { if (ball.el) ball.el.style.transition = ''; }, 280);
  }
  function buildBall() {
    if (ball.el) return;
    if (SUBFRAME && (innerWidth < 300 || innerHeight < 180)) return; // 小尺寸子框架：只上报不显示 UI
    const b = el('div');
    b.id = 'mtvsp-ball';
    b.innerHTML = SVG.play + '<span class="mtvsp-badge"></span>';
    (document.body || document.documentElement).appendChild(b);
    ball.el = b;
    ball.badge = b.querySelector('.mtvsp-badge');
    initBallPos();
    setBallPos(ball.x, ball.y);
    b.addEventListener('touchstart', ballTS, { passive: false });
    b.addEventListener('touchmove', ballTM, { passive: false });
    b.addEventListener('touchend', ballTE, { passive: false });
    b.addEventListener('touchcancel', ballTC, { passive: false });
    b.addEventListener('click', () => { if (!P.open) togglePanel(); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  function ballTS(e) {
    if (P.open) { e.preventDefault(); return; }
    const t = e.changedTouches[0];
    ball.id = t.identifier;
    ball.sx = t.clientX; ball.sy = t.clientY;
    ball.bx = ball.x; ball.by = ball.y;
    ball.drag = false;
    ball.el.style.transition = 'none';
    ball.el.classList.add('mtvsp-t');
    e.preventDefault();
    e.stopPropagation();
  }
  function ballTM(e) {
    let t = null;
    for (const c of e.changedTouches) if (c.identifier === ball.id) t = c;
    if (!t) { if (ball.id != null) e.preventDefault(); return; }
    const dx = t.clientX - ball.sx, dy = t.clientY - ball.sy;
    if (!ball.drag && Math.hypot(dx, dy) > 8) ball.drag = true;
    if (ball.drag) {
      const S = CONFIG.BALL_SIZE, m = 6;
      setBallPos(clamp(ball.bx + dx, m, innerWidth - S - m), clamp(ball.by + dy, m, Math.max(m, innerHeight - S - m)));
    }
    e.preventDefault();
  }
  function ballTE(e) {
    let t = null;
    for (const c of e.changedTouches) if (c.identifier === ball.id) t = c;
    ball.el.classList.remove('mtvsp-t');
    if (!t) return;
    ball.id = null;
    if (ball.drag) { ball.drag = false; snapBall(); }
    else if (!P.open) togglePanel();
    e.preventDefault();
    e.stopPropagation();
  }
  function ballTC() {
    ball.id = null; ball.drag = false;
    if (ball.el) ball.el.classList.remove('mtvsp-t');
  }
  function updateBall(n) {
    if (!ball.el) return;
    if (P.open || n <= 0) {
      ball.el.style.display = 'none';
      if (panel && panel.root.classList.contains('mtvsp-open') && n <= 0) togglePanel(false);
      return;
    }
    ball.el.style.display = 'flex';
    if (n > 1) {
      ball.badge.textContent = n > 99 ? '99+' : n;
      ball.badge.style.display = 'block';
    } else ball.badge.style.display = 'none';
  }

  /* ============================ 视频列表面板 ============================ */
  function buildPanel() {
    if (panel) return;
    const mask = el('div');
    mask.id = 'mtvsp-mask';
    mask.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    mask.addEventListener('touchend', e => { e.preventDefault(); togglePanel(false); }, { passive: false });
    mask.addEventListener('click', () => togglePanel(false));
    const p = el('div');
    p.id = 'mtvsp-panel';
    p.innerHTML =
      '<div class="mtvsp-ph"><span>嗅探到的视频</span><span class="mtvsp-cnt"></span>' +
      '<div class="mtvsp-pclose">' + SVG.cross + '</div></div>' +
      '<div class="mtvsp-plist"></div>';
    (document.body || document.documentElement).appendChild(mask);
    (document.body || document.documentElement).appendChild(p);
    panel = {
      mask, root: p,
      cnt: p.querySelector('.mtvsp-cnt'),
      list: p.querySelector('.mtvsp-plist'),
      close: p.querySelector('.mtvsp-pclose')
    };
    panel.close.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); togglePanel(false); }, { passive: false });
    panel.close.addEventListener('click', () => togglePanel(false));
  }
  function togglePanel(force) {
    if (force === false && !panel) return;
    buildPanel();
    const show = force != null ? !!force : !panel.root.classList.contains('mtvsp-open');
    if (show) renderList(buildAllItems());
    panel.root.classList.toggle('mtvsp-open', show);
    panel.mask.style.display = show ? 'block' : 'none';
  }
  function renderList(items) {
    if (!panel) return;
    panel.cnt.textContent = items.length ? items.length + ' 个' : '';
    if (!items.length) {
      panel.list.innerHTML = '<div class="mtvsp-empty">未嗅探到视频<br>当页面出现视频后会自动加入列表</div>';
      return;
    }
    panel.list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = el('div', 'mtvsp-item');
      const meta2 = '视频 ' + (idx + 1) + (it.res ? ' · ' + it.res : '') + (it.dur ? ' · ' + it.dur : '');
      row.innerHTML = '<div class="mtvsp-idx">' + SVG.play + '</div>' +
        '<div class="mtvsp-meta"><div class="mtvsp-t1">' + esc(it.title) + '</div>' +
        '<div class="mtvsp-t2">' + esc(meta2) + '</div></div>';
      let sy = 0;
      row.addEventListener('touchstart', e => { sy = e.changedTouches[0].clientY; }, { passive: true });
      row.addEventListener('touchend', e => {
        if (Math.abs(e.changedTouches[0].clientY - sy) < 12) {
          e.preventDefault(); e.stopPropagation();
          togglePanel(false);
          setTimeout(() => playItem(it), 100);
        }
      }, { passive: false });
      row.addEventListener('click', () => { togglePanel(false); setTimeout(() => playItem(it), 100); });
      panel.list.appendChild(row);
    });
  }
  function refreshUI() {
    buildBall();
    const items = buildAllItems();
    updateBall(items.length);
    if (panel && panel.root.classList.contains('mtvsp-open')) renderList(items);
    maybeReport(false);
  }

  /* ============================ 全屏手势播放器 ============================ */
  const P = {
    open: false, video: null,
    origParent: null, origNext: null, origStyle: null, origControls: null, origPlaysinline: null,
    bright: 100, speed: 1, histPushed: false
  };
  const G = { on: false, id: null, x0: 0, y0: 0, t0: 0, tEl: null, axis: null, mode: null,
              base: 0, target: 0, val: 0, wasPlaying: false, lastPrev: 0 };
  let ui = null, ctrlTimer = 0, uiRaf = 0, flashTimer = 0, hintTimer = 0, stealAt = 0, vHandlers = null;

  function buildUI() {
    if (ui) return;
    const root = el('div');
    root.id = 'mtvsp-player';
    root.innerHTML =
      '<div class="mtvsp-vwrap"></div>' +
      '<div class="mtvsp-dim"></div>' +
      '<div class="mtvsp-spin"></div>' +
      '<div class="mtvsp-bar mtvsp-top"><div class="mtvsp-close">' + SVG.back + '</div><div class="mtvsp-title"></div></div>' +
      '<div class="mtvsp-flash"></div>' +
      '<div class="mtvsp-vind" style="left:12%"><div class="mtvsp-vtrack"><div class="mtvsp-vfill"></div></div><div class="mtvsp-vtxt"></div></div>' +
      '<div class="mtvsp-vind" style="right:12%"><div class="mtvsp-vtrack"><div class="mtvsp-vfill"></div></div><div class="mtvsp-vtxt"></div></div>' +
      '<div class="mtvsp-bar mtvsp-bottom">' +
        '<div class="mtvsp-pbar"><div class="mtvsp-track"><div class="mtvsp-buf"></div><div class="mtvsp-played"><div class="mtvsp-knob"></div></div></div></div>' +
        '<div class="mtvsp-row">' +
          '<div class="mtvsp-pp">' + SVG.play + '</div>' +
          '<div class="mtvsp-time">0:00 / 0:00</div>' +
          '<div class="mtvsp-live">● 直播</div>' +
          '<div class="mtvsp-speed">1.0x</div>' +
        '</div>' +
      '</div>' +
      '<div class="mtvsp-menu"></div>' +
      '<div class="mtvsp-hint"></div>';
    (document.body || document.documentElement).appendChild(root);
    ui = {
      root, vwrap: root.querySelector('.mtvsp-vwrap'), dim: root.querySelector('.mtvsp-dim'),
      spin: root.querySelector('.mtvsp-spin'), title: root.querySelector('.mtvsp-title'),
      flash: root.querySelector('.mtvsp-flash'), vinds: root.querySelectorAll('.mtvsp-vind'),
      pp: root.querySelector('.mtvsp-pp'), time: root.querySelector('.mtvsp-time'),
      live: root.querySelector('.mtvsp-live'), pbar: root.querySelector('.mtvsp-pbar'),
      buf: root.querySelector('.mtvsp-buf'), played: root.querySelector('.mtvsp-played'),
      speedBtn: root.querySelector('.mtvsp-speed'), menu: root.querySelector('.mtvsp-menu'),
      hint: root.querySelector('.mtvsp-hint')
    };
    buildMenu();
    bindPlayerEvents();
  }
  function buildMenu() {
    ui.menu.innerHTML = '';
    for (const s of CONFIG.SPEEDS) {
      const d = el('div');
      d.textContent = (s % 1 === 0 ? s.toFixed(1) : String(s)) + 'x';
      d.dataset.s = s;
      ui.menu.appendChild(d);
    }
  }

  /* ---------- 播放器内提示组件 ---------- */
  function flash(html, ms) {
    ui.flash.innerHTML = html;
    ui.flash.style.opacity = '1';
    clearTimeout(flashTimer);
    if (ms !== 0) flashTimer = setTimeout(hideFlash, ms || 1000);
  }
  function hideFlash() { if (ui) ui.flash.style.opacity = '0'; }
  function showVind(idx, pct, label) {
    const v = ui.vinds[idx];
    v.querySelector('.mtvsp-vfill').style.height = clamp(pct, 0, 100) + '%';
    v.querySelector('.mtvsp-vtxt').textContent = label;
    ui.vinds[1 - idx].style.opacity = '0';
    v.style.opacity = '1';
  }
  function hideVind() {
    if (!ui) return;
    for (let i = 0; i < ui.vinds.length; i++) ui.vinds[i].style.opacity = '0';
  }
  function showCtrl() {
    if (!ui) return;
    ui.root.classList.add('mtvsp-showctrl');
    clearTimeout(ctrlTimer);
    if (P.video && !P.video.paused) ctrlTimer = setTimeout(hideCtrl, CONFIG.AUTO_HIDE_MS);
  }
  function hideCtrl() {
    if (!ui) return;
    ui.root.classList.remove('mtvsp-showctrl');
    toggleMenu(false); hideVind(); hideFlash();
  }
  function toggleMenu(force) {
    const show = force != null ? !!force : ui.menu.style.display !== 'block';
    ui.menu.style.display = show ? 'block' : 'none';
    if (show) clearTimeout(ctrlTimer);
  }

  /* ---------- 亮度 / 音量 / 倍速 ---------- */
  function setBrightness(pct, save) {
    P.bright = clamp(pct, 10, 100);
    ui.dim.style.opacity = ((1 - P.bright / 100) * 0.85).toFixed(3);
    if (save !== false) store.set('brightness', Math.round(P.bright));
  }
  function setVolume(val, save) {
    val = clamp(val, 0, 1);
    if (P.video) {
      try { P.video.volume = val; P.video.muted = val <= 0.001; } catch (e) {}
    }
    if (save !== false) store.set('volume', +val.toFixed(3));
  }
  function applySpeed(s, withFlash) {
    P.speed = s;
    store.set('speed', s);
    if (P.video) { try { P.video.playbackRate = s; } catch (e) {} }
    const label = (s % 1 === 0 ? s.toFixed(1) : String(s)) + 'x';
    ui.speedBtn.textContent = label;
    const kids = ui.menu.children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('mtvsp-on', +kids[i].dataset.s === s);
    if (withFlash) flash('<span class="mtvsp-big">' + label + '</span><br>倍速播放', 900);
  }
  function togglePlay() {
    const v = P.video; if (!v) return;
    showCtrl();
    try {
      if (v.paused || v.ended) {
        if (v.ended) { try { v.currentTime = 0; } catch (e) {} }
        const p = v.play(); if (p && p.catch) p.catch(() => {});
      } else v.pause();
    } catch (e) {}
  }

  /* ---------- 视频事件（播放器存活期间） ---------- */
  function bindVideoEvents(v) {
    const hs = {
      ended: () => { ui.pp.innerHTML = SVG.play; showCtrl(); flash('<span class="mtvsp-big">播放结束</span><br>点击左下角按钮重播', 1800); },
      pause: () => { ui.pp.innerHTML = SVG.play; showCtrl(); },
      play: () => { ui.pp.innerHTML = SVG.pause; showCtrl(); },
      waiting: () => { ui.spin.style.display = 'block'; },
      playing: () => { ui.spin.style.display = 'none'; },
      error: () => { ui.spin.style.display = 'none'; flash('视频加载出错', 1600); },
      ratechange: () => {
        try {
          const r = v.playbackRate;
          ui.speedBtn.textContent = (r % 1 === 0 ? r.toFixed(1) : String(r)) + 'x';
        } catch (e) {}
      }
    };
    vHandlers = hs;
    for (const k in hs) v.addEventListener(k, hs[k]);
  }
  function unbindVideoEvents(v) {
    if (!vHandlers || !v) return;
    for (const k in vHandlers) v.removeEventListener(k, vHandlers[k]);
    vHandlers = null;
  }

  /* ---------- 界面刷新循环 ---------- */
  function uiTick() {
    if (!P.open) return;
    uiRaf = requestAnimationFrame(uiTick);
    const v = P.video;
    if (!v) return;
    // 若被站点脚本挪走，尝试接回（限频防止互相拉扯）
    if (v.parentNode !== ui.vwrap && v.isConnected && Date.now() - stealAt > 1500) {
      stealAt = Date.now();
      try { ui.vwrap.appendChild(v); } catch (e) {}
    }
    const live = !(isFinite(v.duration) && v.duration > 0);
    ui.live.style.display = live ? 'inline' : 'none';
    if (!G.axis) {
      if (live) {
        ui.time.textContent = fmtTime(v.currentTime) + ' · 直播';
        ui.played.style.width = '0%';
      } else {
        const dur = v.duration;
        ui.time.textContent = fmtTime(v.currentTime) + ' / ' + fmtTime(dur);
        ui.played.style.width = (clamp(v.currentTime / dur, 0, 1) * 100) + '%';
        let end = 0;
        try {
          for (let i = 0; i < v.buffered.length; i++) {
            if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) > end) end = v.buffered.end(i);
          }
        } catch (e) {}
        ui.buf.style.width = (clamp(end / dur, 0, 1) * 100) + '%';
      }
    }
    ui.spin.style.display = (!v.paused && v.readyState < 3 && !v.ended) ? 'block' : 'none';
  }

  /* ---------- 进入 / 退出全屏 ---------- */
  function openPlayer(video) {
    if (!video) return;
    if (P.open) { if (P.video === video) return; closePlayer(true); }
    buildUI();
    const v = video;
    P.video = v;
    P.origParent = v.parentNode;
    P.origNext = v.nextSibling;
    P.origStyle = v.getAttribute('style');
    P.origControls = v.getAttribute('controls');
    P.origPlaysinline = v.getAttribute('playsinline');
    owned.add(v);
    // 强制内联播放（iOS 全屏层必需），移除原生控件
    v.removeAttribute('controls');
    v.setAttribute('playsinline', '');
    try { v.setAttribute('webkit-playsinline', ''); } catch (e) {}
    // 接管：把原视频元素移入全屏层（blob:/MSE/HLS 流因此天然可播）
    ui.vwrap.appendChild(v);
    v.style.cssText =
      'position:static!important;margin:0!important;padding:0!important;border:0!important;' +
      'width:100%!important;height:auto!important;max-width:100%!important;max-height:100%!important;' +
      'min-width:0!important;min-height:0!important;transform:none!important;object-fit:contain!important;' +
      'background:#000!important;display:block!important;visibility:visible!important;opacity:1!important;' +
      'filter:none!important;border-radius:0!important;box-shadow:none!important;float:none!important;';
    bindVideoEvents(v);
    // 应用记忆：亮度 / 音量 / 倍速
    P.bright = clamp(parseInt(store.get('brightness', 100), 10) || 100, 10, 100);
    setBrightness(P.bright);
    const sv = store.get('volume', null);
    if (sv != null && !isNaN(+sv)) setVolume(clamp(+sv, 0, 1));
    const sp = +store.get('speed', 1);
    applySpeed(CONFIG.SPEEDS.indexOf(sp) >= 0 ? sp : 1, false);
    ui.title.textContent = videoTitle(v);
    ui.pp.innerHTML = SVG.pause;
    ui.root.style.display = 'block';
    P.open = true;
    document.documentElement.classList.add('mtvsp-lock');
    updateBall(0);
    try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
    showCtrl();
    cancelAnimationFrame(uiRaf);
    uiRaf = requestAnimationFrame(uiTick);
    pushHist();
    if (!store.get('hinted', false)) { showHint(); store.set('hinted', true); }
  }
  function closePlayer(fromPop) {
    if (!P.open) return;
    const v = P.video;
    cancelAnimationFrame(uiRaf);
    clearTimeout(ctrlTimer); clearTimeout(flashTimer); clearTimeout(hintTimer);
    try { v.pause(); } catch (e) {}
    unbindVideoEvents(v);
    // 移回原位置
    if (P.origParent && P.origParent.isConnected) {
      try { P.origParent.insertBefore(v, P.origNext); }
      catch (e) { try { P.origParent.appendChild(v); } catch (e2) {} }
    } else {
      try {
        const h = document.createElement('div');
        h.style.display = 'none';
        (document.body || document.documentElement).appendChild(h);
        h.appendChild(v);
      } catch (e) {}
    }
    owned.delete(v);
    // 还原样式与属性
    if (P.origStyle == null) v.removeAttribute('style'); else v.setAttribute('style', P.origStyle);
    if (P.origControls == null) v.removeAttribute('controls'); else v.setAttribute('controls', P.origControls);
    if (P.origPlaysinline == null) { v.removeAttribute('playsinline'); v.removeAttribute('webkit-playsinline'); }
    else v.setAttribute('playsinline', P.origPlaysinline);
    P.open = false; P.video = null;
    ui.root.style.display = 'none';
    ui.menu.style.display = 'none';
    ui.flash.style.opacity = '0';
    hideVind();
    document.documentElement.classList.remove('mtvsp-lock');
    if (!fromPop && P.histPushed) { P.histPushed = false; try { history.back(); } catch (e) {} }
    else P.histPushed = false;
    refreshUI();
  }

  /* ---------- 返回键退出全屏 ---------- */
  function pushHist() {
    if (P.histPushed) return;
    try { history.pushState({ mtvsp: 1 }, '', location.href); P.histPushed = true; } catch (e) {}
  }
  window.addEventListener('popstate', () => { if (P.open) closePlayer(true); });

  /* ---------- 首次手势引导 ---------- */
  function showHint() {
    ui.hint.innerHTML =
      '<b>· 左右滑动</b>&nbsp;快进 / 快退 · 实时画面预览<br>' +
      '<b>· 左半屏上下滑</b>&nbsp;调节亮度<br>' +
      '<b>· 右半屏上下滑</b>&nbsp;调节音量' + (isIOS ? '(iOS 请用音量键)' : '') + '<br>' +
      '<b>· 底部倍速</b>&nbsp;0.5x ~ 3x 任意切换<br>' +
      '<b>· 单击画面</b>&nbsp;显示 / 隐藏控制栏<br>' +
      '<b>· 返回键 / 左上角</b>&nbsp;退出全屏';
    ui.hint.style.opacity = '1';
    hintTimer = setTimeout(() => { if (ui) ui.hint.style.opacity = '0'; }, 4200);
  }

  /* ============================ 手势引擎（全屏层内） ============================ */
  function isolate(e) {
    try { e.stopImmediatePropagation(); } catch (x) {}
    e.stopPropagation();
  }
  function bindPlayerEvents() {
    const R = ui.root;
    // 屏蔽页面合成 click / 长按菜单，与页面手势完全隔离
    R.addEventListener('click', e => { e.preventDefault(); isolate(e); }, true);
    R.addEventListener('contextmenu', e => { e.preventDefault(); isolate(e); }, true);
    R.addEventListener('touchstart', onTS, { capture: true, passive: false });
    R.addEventListener('touchmove', onTM, { capture: true, passive: false });
    R.addEventListener('touchend', onTE, { capture: true, passive: false });
    R.addEventListener('touchcancel', onTE, { capture: true, passive: false });
  }
  function onTS(e) {
    if (!P.open) return;
    isolate(e);
    if (G.on) { e.preventDefault(); return; } // 只响应第一根手指
    const t = e.changedTouches[0];
    G.on = true; G.id = t.identifier;
    G.x0 = t.clientX; G.y0 = t.clientY; G.t0 = Date.now();
    G.tEl = e.target; G.axis = null; G.mode = null;
    showCtrl();
    e.preventDefault();
  }
  function onTM(e) {
    if (!P.open || !G.on) return;
    isolate(e);
    let t = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === G.id) t = e.changedTouches[i];
    }
    if (!t) { e.preventDefault(); return; }
    const dx = t.clientX - G.x0, dy = t.clientY - G.y0;
    if (!G.axis && (Math.abs(dx) >= 12 || Math.abs(dy) >= 12)) {
      const onBar = G.tEl && G.tEl.closest && G.tEl.closest('.mtvsp-pbar');
      if (onBar) { G.axis = 'bar'; beginSeek(); }
      else if (Math.abs(dx) >= Math.abs(dy)) { G.axis = 'h'; beginSeek(); }
      else {
        G.axis = 'v';
        G.mode = G.x0 < innerWidth / 2 ? 'bright' : 'volume';
        G.base = G.mode === 'bright' ? P.bright : (P.video.muted ? 0 : P.video.volume);
        G.val = G.base;
      }
    }
    if (G.axis === 'h') moveSeek(dx);
    else if (G.axis === 'bar') moveBar(t.clientX);
    else if (G.axis === 'v') moveVert(dy);
    e.preventDefault();
  }
  function onTE(e) {
    if (!P.open || !G.on) return;
    isolate(e);
    e.preventDefault();
    let t = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === G.id) t = e.changedTouches[i];
    }
    if (!t) return; // 该手指未结束
    G.on = false;
    const dt = Date.now() - G.t0;
    const moved = Math.hypot(t.clientX - G.x0, t.clientY - G.y0);
    if (G.axis === 'h' || G.axis === 'bar') endSeek();
    else if (G.axis === 'v') endVert();
    else if (moved < 12 && dt < 400) handleTap(e.target, t);
    else showCtrl();
  }

  /* ---------- 左右滑动：快进 / 快退（实时画面预览） ---------- */
  function beginSeek() {
    const v = P.video;
    G.base = v.currentTime || 0;
    G.target = G.base;
    G.wasPlaying = !v.paused;
    if (G.wasPlaying) { try { v.pause(); } catch (e) {} }
    G.lastPrev = Date.now();
  }
  function moveSeek(dx) {
    const v = P.video;
    const dur = v.duration;
    if (!(isFinite(dur) && dur > 0)) { flash('<span class="mtvsp-big">直播流</span><br>不支持拖动快进', 800); return; }
    G.target = clamp(G.base + (dx / innerWidth) * CONFIG.FULL_SWIPE_SECONDS, 0, Math.max(0, dur - 0.2));
    const now = Date.now();
    if (now - G.lastPrev >= CONFIG.SEEK_PREVIEW_MS) {
      G.lastPrev = now;
      try { v.currentTime = G.target; } catch (e) {}   // 实时 seek → 画面即预览
    }
    flash('<span class="mtvsp-big">' + (G.target >= G.base ? '» ' : '« ') + fmtTime(G.target) + '</span><br>' +
      (G.target >= G.base ? '快进 ' : '快退 ') + Math.abs(Math.round(G.target - G.base)) + ' 秒 · 实时预览中', 0);
    ui.played.style.width = (clamp(G.target / dur, 0, 1) * 100) + '%';
    ui.time.textContent = fmtTime(G.target) + ' / ' + fmtTime(dur);
  }
  function moveBar(cx) {
    const v = P.video;
    const dur = v.duration;
    const r = ui.pbar.getBoundingClientRect();
    if (!(isFinite(dur) && dur > 0) || r.width <= 0) return;
    const ratio = clamp((cx - r.left) / r.width, 0, 1);
    G.target = ratio * dur;
    const now = Date.now();
    if (now - G.lastPrev >= CONFIG.SEEK_PREVIEW_MS) {
      G.lastPrev = now;
      try { v.currentTime = G.target; } catch (e) {}
    }
    flash('<span class="mtvsp-big">' + fmtTime(G.target) + '</span>', 0);
    ui.played.style.width = (ratio * 100) + '%';
    ui.time.textContent = fmtTime(G.target) + ' / ' + fmtTime(dur);
  }
  function endSeek() {
    const v = P.video;
    try { v.currentTime = G.target; } catch (e) {}
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    ui.time.textContent = fmtTime(G.target) + (dur ? ' / ' + fmtTime(dur) : ' · 直播');
    hideFlash();
    if (G.wasPlaying) { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }

  /* ---------- 左半屏：亮度 / 右半屏：音量 ---------- */
  function moveVert(dy) {
    const range = innerHeight * 0.65;
    if (G.mode === 'bright') {
      G.val = clamp(G.base + (-dy / range) * 100, 10, 100);
      setBrightness(G.val, false);
      showVind(0, G.val, '亮度 ' + Math.round(G.val) + '%');
    } else {
      G.val = clamp(G.base + (-dy / range), 0, 1);
      setVolume(G.val, false);
      showVind(1, G.val * 100, '音量 ' + Math.round(G.val * 100) + '%' + (isIOS ? ' · iOS请用音量键' : ''));
    }
  }
  function endVert() {
    if (G.mode === 'bright') store.set('brightness', Math.round(G.val));
    else store.set('volume', +G.val.toFixed(3));
    setTimeout(hideVind, 400);
  }

  /* ---------- 单击：控制栏 / 按钮 ---------- */
  function handleTap(target, t) {
    const hit = sel => { try { return !!(target && target.closest && target.closest(sel)); } catch (e) { return false; } };
    if (hit('.mtvsp-close')) { closePlayer(false); return; }
    if (hit('.mtvsp-pp')) { togglePlay(); return; }
    if (hit('.mtvsp-speed')) { toggleMenu(); return; }
    const mi = hit('.mtvsp-menu div') ? target.closest('.mtvsp-menu div') : null;
    if (mi) { applySpeed(+mi.dataset.s, true); toggleMenu(false); return; }
    if (hit('.mtvsp-pbar')) {
      const v = P.video;
      const dur = v ? v.duration : NaN;
      if (isFinite(dur) && dur > 0) {
        const r = ui.pbar.getBoundingClientRect();
        const x = t && t.clientX != null ? t.clientX : r.left + r.width / 2;
        try { v.currentTime = clamp((x - r.left) / r.width, 0, 1) * dur; } catch (e) {}
        flash('<span class="mtvsp-big">' + fmtTime(v.currentTime) + '</span>', 700);
        showCtrl();
      }
      return;
    }
    if (hit('.mtvsp-top') || hit('.mtvsp-bottom')) { showCtrl(); return; }
    if (ui.menu.style.display === 'block') { toggleMenu(false); showCtrl(); return; }
    if (ui.root.classList.contains('mtvsp-showctrl')) hideCtrl();
    else showCtrl();
  }

  /* ============================ 启动引擎 ============================ */
  function startEngine() {
    buildBall();
    setInterval(scan, CONFIG.SCAN_MS);
    try {
      const mo = new MutationObserver(() => { domDirty = true; scheduleScan(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    for (const ev of ['playing', 'loadstart', 'loadedmetadata', 'canplay']) {
      document.addEventListener(ev, e => {
        if (e.target && e.target.tagName === 'VIDEO') { domDirty = true; scheduleScan(); }
      }, true);
    }
    addEventListener('resize', () => {
      if (ball.el && !P.open) { initBallPos(); setBallPos(ball.x, ball.y); }
    }, { passive: true });
    addEventListener('pagehide', sendBye);
    addEventListener('beforeunload', sendBye);
    addEventListener('message', onMessage);
    scan();
  }
  function boot() { injectStyle(); startEngine(); }
  boot();
})();