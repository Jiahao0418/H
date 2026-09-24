// ==UserScript==
// @name         视频嗅探播放器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  手机端网页视频嗅探，全屏横屏播放，左右滑动快进快退，左侧亮度/右侧音量，支持倍速与字幕加载
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_openInTab
// @connect      xunlei.com
// @connect      geilijiasu.com
// @connect      v.geilijiasu.com
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /* ================= 样式 ================= */
    GM_addStyle(`
        .vs-btn {
            position: fixed;
            z-index: 2147483646;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: rgba(0,0,0,0.65);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            border: 1px solid rgba(255,255,255,0.25);
            box-shadow: 0 3px 10px rgba(0,0,0,0.45);
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            transition: transform 0.15s;
        }
        .vs-btn:active { transform: scale(0.9); }
        .vs-btn-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            min-width: 19px;
            height: 19px;
            border-radius: 10px;
            background: #ff3b30;
            color: #fff;
            font-size: 11px;
            line-height: 19px;
            text-align: center;
            padding: 0 4px;
            box-sizing: border-box;
            font-weight: 700;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }

        /* ---------- 全屏播放层 ---------- */
        .vs-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            background: #000;
            overflow: hidden;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        }
        .vs-stage {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            touch-action: none;
        }
        .vs-stage video {
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            max-height: none !important;
            object-fit: contain !important;
            background: #000;
            display: block;
        }

        .vs-subtitle {
            position: absolute;
            bottom: 16%;
            left: 50%;
            transform: translateX(-50%);
            color: #fff;
            font-size: 20px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.95), 0 0 4px #000, 0 0 2px #000;
            text-align: center;
            max-width: 88%;
            z-index: 5;
            pointer-events: none;
            white-space: pre-line;
            line-height: 1.35;
            word-break: break-word;
        }

        .vs-topbar {
            position: absolute;
            top: 0; left: 0; right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            padding-top: calc(12px + env(safe-area-inset-top, 0px));
            z-index: 10;
            background: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0));
            pointer-events: none;
        }
        .vs-topbar > * { pointer-events: auto; }

        .vs-icon-btn {
            background: rgba(255,255,255,0.18);
            border: none;
            color: #fff;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            transition: transform 0.15s, background 0.15s;
        }
        .vs-icon-btn:active {
            transform: scale(0.9);
            background: rgba(255,255,255,0.3);
        }

        .vs-bottombar {
            position: absolute;
            bottom: 0; left: 0; right: 0;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
            z-index: 10;
            background: linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0));
        }
        .vs-time {
            color: #fff;
            font-size: 13px;
            margin-right: auto;
            text-shadow: 0 1px 3px rgba(0,0,0,0.8);
            font-variant-numeric: tabular-nums;
        }
        .vs-speed-btn {
            background: rgba(255,255,255,0.18);
            border: none;
            color: #fff;
            padding: 7px 15px;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            transition: background 0.2s, transform 0.15s;
        }
        .vs-speed-btn:active { transform: scale(0.92); }
        .vs-speed-btn.active { background: #2196F3; }

        .vs-indicator {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.78);
            color: #fff;
            padding: 12px 22px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            z-index: 20;
            pointer-events: none;
            display: none;
            white-space: nowrap;
            text-align: center;
            line-height: 1.5;
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }

        .vs-sub-panel {
            position: absolute;
            left: 0; right: 0; bottom: 0;
            background: rgba(24,24,24,0.98);
            border-radius: 18px 18px 0 0;
            padding: 6px 0;
            padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
            z-index: 30;
            max-height: 62vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            box-shadow: 0 -6px 30px rgba(0,0,0,0.6);
            animation: vsSlideUp 0.22s ease-out;
        }
        @keyframes vsSlideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
        }
        .vs-sub-title {
            padding: 12px 20px 8px;
            color: #888;
            font-size: 12px;
            letter-spacing: 0.5px;
        }
        .vs-sub-item {
            padding: 15px 20px;
            color: #eee;
            font-size: 15px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            -webkit-tap-highlight-color: transparent;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .vs-sub-item:last-child { border-bottom: none; }
        .vs-sub-item:active { background: rgba(255,255,255,0.09); }
        .vs-sub-item-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .vs-sub-item-extra {
            color: #888;
            font-size: 12px;
            flex-shrink: 0;
        }

        .vs-toast {
            position: fixed;
            left: 50%;
            bottom: 90px;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.85);
            color: #fff;
            padding: 11px 22px;
            border-radius: 10px;
            font-size: 14px;
            z-index: 2147483647;
            pointer-events: none;
            white-space: nowrap;
            max-width: 82vw;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 4px 18px rgba(0,0,0,0.5);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
        }
    `);

    /* ================= 状态 ================= */
    const State = {
        tracked: [],
        overlay: null,
        player: null,
        placeholder: null,
        originalControls: true,
        originalStyle: '',
        subtitles: [],
        rawSubtitle: '',
        offset: 0,
        brightness: 1,
        pendingSeek: null,
        subtitleTimer: null,
    };

    /* ================= 工具 ================= */
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        sec = Math.floor(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const pad = n => String(n).padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    let toastTimer = null;
    function toast(msg, duration = 2200) {
        let el = document.querySelector('.vs-toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'vs-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.style.display = 'none'; }, duration);
    }

    /* ================= 视频扫描与按钮 ================= */
    function createButton(video) {
        const btn = document.createElement('div');
        btn.className = 'vs-btn';
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                 stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                <path d="M16 3h3a2 2 0 0 1 2 2v3"/>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                <path d="M8 21H5a2 2 0 0 1-2-2v-3"/>
            </svg>
            <span class="vs-btn-badge" style="display:none;"></span>
        `;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openPlayer(video);
        });
        document.body.appendChild(btn);
        return btn;
    }

    function scan() {
        // 清理已被移除的
        State.tracked = State.tracked.filter(t => {
            if (!document.contains(t.el)) {
                t.btn.remove();
                return false;
            }
            return true;
        });

        const vids = document.querySelectorAll('video');
        vids.forEach(v => {
            if (!State.tracked.some(t => t.el === v)) {
                const btn = createButton(v);
                State.tracked.push({ el: v, btn });
            }
        });

        updatePositions();
    }

    function updatePositions() {
        if (!State.tracked.length) return;

        const total = State.tracked.length;
        const showBadge = total > 1;

        State.tracked.forEach(({ el, btn }) => {
            const r = el.getBoundingClientRect();
            const visible =
                r.width > 50 && r.height > 50 &&
                r.bottom > 0 && r.top < window.innerHeight &&
                r.right > 0 && r.left < window.innerWidth &&
                getComputedStyle(el).visibility !== 'hidden' &&
                getComputedStyle(el).display !== 'none';

            if (!visible) {
                btn.style.display = 'none';
                return;
            }

            btn.style.display = 'flex';

            const left = clamp(r.right - 50, 4, window.innerWidth - 48);
            const top = clamp(r.top + 8, 4, window.innerHeight - 48);
            btn.style.left = left + 'px';
            btn.style.top = top + 'px';

            const badge = btn.querySelector('.vs-btn-badge');
            if (showBadge) {
                badge.style.display = 'block';
                badge.textContent = String(total);
            } else {
                badge.style.display = 'none';
            }
        });
    }

    let rafTick = 0;
    function positionLoop() {
        rafTick++;
        if (rafTick % 3 === 0) updatePositions();
        requestAnimationFrame(positionLoop);
    }
    requestAnimationFrame(positionLoop);

    /* ================= DOM 监听 ================= */
    let scanTimer = null;
    const mo = new MutationObserver(() => {
        if (scanTimer) return;
        scanTimer = setTimeout(() => {
            scanTimer = null;
            scan();
        }, 450);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, { passive: true });

    /* ================= 打开播放器 ================= */
    function openPlayer(video) {
        if (State.overlay) return;

        // 记录原始状态
        State.originalControls = video.controls;
        State.originalStyle = video.getAttribute('style') || '';

        // 插入占位注释
        State.placeholder = document.createComment('vs-placeholder');
        video.parentNode.insertBefore(State.placeholder, video);

        // 构建覆盖层
        const overlay = document.createElement('div');
        overlay.className = 'vs-overlay';
        overlay.innerHTML = `
            <div class="vs-stage"></div>
            <div class="vs-subtitle"></div>

            <div class="vs-topbar">
                <button class="vs-icon-btn vs-close" aria-label="关闭">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
                <div style="display:flex;gap:10px;">
                    <button class="vs-icon-btn vs-sub-btn" aria-label="字幕">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                             stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2.5"/>
                            <path d="M6 12h4M14 12h4M6 16h8"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="vs-bottombar">
                <span class="vs-time">00:00 / 00:00</span>
                <button class="vs-speed-btn" data-rate="1">1x</button>
                <button class="vs-speed-btn" data-rate="2">2x</button>
                <button class="vs-speed-btn" data-rate="3">3x</button>
            </div>

            <div class="vs-indicator"></div>
        `;

        const stage = overlay.querySelector('.vs-stage');
        stage.appendChild(video);

        document.body.appendChild(overlay);
        State.overlay = overlay;
        State.player = video;
        State.brightness = 1;

        // 重置视频属性
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.controls = false;
        video.style.cssText =
            'width:100%!important;height:100%!important;max-width:none!important;' +
            'max-height:none!important;object-fit:contain!important;background:#000;' +
            'display:block;filter:brightness(1);';

        // 绑定事件
        bindOverlayEvents(overlay, video);
        startSubtitleLoop(video, overlay);

        // 自动播放
        video.play().catch(() => {});

        // 进入全屏 + 横屏
        goFullscreen(overlay);
    }

    /* ================= 关闭播放器 ================= */
    function closePlayer() {
        if (!State.overlay) return;

        const overlay = State.overlay;
        const video = State.player;

        // 停止播放
        try { video.pause(); } catch (e) {}

        // 恢复视频
        video.controls = State.originalControls;
        if (State.originalStyle) {
            video.setAttribute('style', State.originalStyle);
        } else {
            video.removeAttribute('style');
        }
        video.style.filter = '';

        // 放回原位置
        if (State.placeholder && State.placeholder.parentNode) {
            State.placeholder.parentNode.insertBefore(video, State.placeholder);
            State.placeholder.remove();
        }
        State.placeholder = null;

        // 清理
        if (State.subtitleTimer) {
            clearInterval(State.subtitleTimer);
            State.subtitleTimer = null;
        }

        // 退出全屏
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen?.();
        }
        if (screen.orientation && screen.orientation.unlock) {
            try { screen.orientation.unlock(); } catch (e) {}
        }

        overlay.remove();

        State.overlay = null;
        State.player = null;
        State.subtitles = [];
        State.rawSubtitle = '';
        State.pendingSeek = null;
        State.offset = 0;
    }

    /* ================= 全屏与横屏 ================= */
    function goFullscreen(el) {
        const req =
            el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.mozRequestFullScreen ||
            el.msRequestFullscreen;

        if (!req) return;

        try {
            const ret = req.call(el);
            if (ret && typeof ret.then === 'function') {
                ret.then(() => {
                    lockLandscape();
                }).catch(() => {});
            } else {
                lockLandscape();
            }
        } catch (e) {}
    }

    function lockLandscape() {
        if (screen.orientation && screen.orientation.lock) {
            try {
                const p = screen.orientation.lock('landscape');
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (e) {}
        }
    }

    /* ================= 覆盖层事件绑定 ================= */
    function bindOverlayEvents(overlay, video) {
        // 关闭
        overlay.querySelector('.vs-close').addEventListener('click', closePlayer);

        // 倍速
        const speedBtns = overlay.querySelectorAll('.vs-speed-btn');
        speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const rate = parseFloat(btn.dataset.rate);
                video.playbackRate = rate;
                speedBtns.forEach(b => b.classList.toggle('active', b === btn));
                toast(`播放速度 ${rate}x`);
            });
        });
        overlay.querySelector('.vs-speed-btn[data-rate="1"]').classList.add('active');

        // 时间显示
        const timeEl = overlay.querySelector('.vs-time');
        const updateTime = () => {
            timeEl.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
        };
        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('loadedmetadata', updateTime);
        video.addEventListener('durationchange', updateTime);
        updateTime();

        // 字幕按钮
        overlay.querySelector('.vs-sub-btn').addEventListener('click', () => {
            toggleSubPanel(overlay, video);
        });

        // 点击视频切换播放/暂停
        const stage = overlay.querySelector('.vs-stage');
        let lastTap = 0;
        stage.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastTap < 280) return;
            lastTap = now;
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });

        // 手势
        bindGestures(overlay, video);
    }

    /* ================= 手势控制 ================= */
    function bindGestures(overlay, video) {
        const stage = overlay.querySelector('.vs-stage');
        const indicator = overlay.querySelector('.vs-indicator');

        let startX = 0, startY = 0;
        let startTime = 0, startVolume = 0, startBrightness = 1;
        let mode = null;
        let indicatorTimer = null;

        const showIndicator = (html) => {
            indicator.innerHTML = html;
            indicator.style.display = 'block';
            clearTimeout(indicatorTimer);
        };
        const hideIndicator = () => {
            clearTimeout(indicatorTimer);
            indicatorTimer = setTimeout(() => {
                indicator.style.display = 'none';
            }, 150);
        };

        stage.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            startTime = video.currentTime || 0;
            startVolume = video.volume;
            startBrightness = State.brightness;
            mode = null;
        }, { passive: true });

        stage.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;

            // 判定手势方向
            if (!mode) {
                if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
                if (Math.abs(dx) > Math.abs(dy) * 1.15) {
                    mode = 'seek';
                } else {
                    mode = (startX < window.innerWidth / 2) ? 'brightness' : 'volume';
                }
            }

            e.preventDefault();

            if (mode === 'seek') {
                const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
                // 整屏宽度 = 30 秒（滑动幅度温和）
                const delta = (dx / window.innerWidth) * 30;
                const target = clamp(startTime + delta, 0, dur);
                State.pendingSeek = target;

                const sign = delta >= 0 ? '+' : '-';
                const absDelta = Math.abs(delta);
                const deltaText = absDelta >= 10 ? absDelta.toFixed(0) : absDelta.toFixed(1);

                showIndicator(
                    `${sign}${deltaText}s<br>` +
                    `<span style="font-size:13px;color:#bbb;font-weight:400;">` +
                    `${fmtTime(target)} / ${fmtTime(dur)}</span>`
                );
            } else if (mode === 'brightness') {
                // 上滑增亮，下滑变暗
                const delta = -dy / (window.innerHeight * 0.55);
                State.brightness = clamp(startBrightness + delta, 0.1, 2);
                video.style.filter = `brightness(${State.brightness})`;
                showIndicator(`亮度 ${Math.round(State.brightness * 100)}%`);
            } else if (mode === 'volume') {
                const delta = -dy / (window.innerHeight * 0.55);
                const vol = clamp(startVolume + delta, 0, 1);
                video.volume = vol;
                showIndicator(`音量 ${Math.round(vol * 100)}%`);
            }
        }, { passive: false });

        const endGesture = () => {
            if (mode === 'seek' && State.pendingSeek != null) {
                try { video.currentTime = State.pendingSeek; } catch (e) {}
                State.pendingSeek = null;
            }
            mode = null;
            hideIndicator();
        };

        stage.addEventListener('touchend', endGesture);
        stage.addEventListener('touchcancel', endGesture);
    }

    /* ================= 字幕循环 ================= */
    function startSubtitleLoop(video, overlay) {
        if (State.subtitleTimer) clearInterval(State.subtitleTimer);
        const subEl = overlay.querySelector('.vs-subtitle');

        State.subtitleTimer = setInterval(() => {
            if (!State.subtitles.length) {
                if (subEl.textContent) subEl.textContent = '';
                return;
            }
            const t = video.currentTime;
            const cur = State.subtitles.find(s => t >= s.start && t <= s.end);
            const text = cur ? cur.text : '';
            if (subEl.textContent !== text) subEl.textContent = text;
        }, 100);
    }

    /* ================= 字幕面板 ================= */
    function toggleSubPanel(overlay, video) {
        let panel = overlay.querySelector('.vs-sub-panel');
        if (panel) {
            panel.remove();
            return;
        }
        buildSubPanel(overlay, video);
    }

    function buildSubPanel(overlay, video) {
        let panel = overlay.querySelector('.vs-sub-panel');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.className = 'vs-sub-panel';

        const title = document.createElement('div');
        title.className = 'vs-sub-title';
        title.textContent = '字幕设置';
        panel.appendChild(title);

        const addItem = (label, handler, extra) => {
            const div = document.createElement('div');
            div.className = 'vs-sub-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'vs-sub-item-name';
            nameSpan.textContent = label;

            div.appendChild(nameSpan);

            if (extra) {
                const extraSpan = document.createElement('span');
                extraSpan.className = 'vs-sub-item-extra';
                extraSpan.textContent = extra;
                div.appendChild(extraSpan);
            }

            div.addEventListener('click', handler);
            panel.appendChild(div);
        };

        // 1. 本地字幕
        addItem('📂 加载本地字幕 (.srt)', () => {
            pickLocalSubtitle();
            panel.remove();
        });

        // 2. 在线搜索
        addItem('🔍 在线搜索字幕（迅雷）', () => {
            searchXunlei(overlay, video);
            panel.remove();
        });

        // 3. SubtitleCat
        addItem('🌐 SubtitleCat 搜索', () => {
            const id = getVideoID();
            if (id) {
                GM_openInTab(
                    `https://subtitlecat.com/index.php?search=${encodeURIComponent(id)}`,
                    { active: true }
                );
            } else {
                toast('无法识别视频ID');
            }
            panel.remove();
        });

        // 4. 字幕偏移
        const offsetText = State.offset === 0
            ? '0.0s'
            : (State.offset > 0 ? '+' : '') + State.offset.toFixed(1) + 's';

        addItem('⏪ 字幕偏移 -0.5s', () => {
            State.offset = +(State.offset - 0.5).toFixed(1);
            reparseSubtitles();
            toast(`字幕偏移 ${State.offset.toFixed(1)}s`);
            buildSubPanel(overlay, video);
        }, offsetText);

        addItem('⏩ 字幕偏移 +0.5s', () => {
            State.offset = +(State.offset + 0.5).toFixed(1);
            reparseSubtitles();
            toast(`字幕偏移 ${State.offset.toFixed(1)}s`);
            buildSubPanel(overlay, video);
        }, offsetText);

        // 5. 清除字幕
        addItem('🗑 清除当前字幕', () => {
            State.subtitles = [];
            State.rawSubtitle = '';
            State.offset = 0;
            toast('已清除字幕');
            panel.remove();
        });

        // 6. 关闭面板
        addItem('✖ 关闭', () => {
            panel.remove();
        });

        overlay.appendChild(panel);
    }

    function reparseSubtitles() {
        if (State.rawSubtitle) {
            State.subtitles = parseSRT(State.rawSubtitle);
        }
    }

    /* ================= 本地字幕 ================= */
    let fileInputEl = null;
    function pickLocalSubtitle() {
        if (!fileInputEl) {
            fileInputEl = document.createElement('input');
            fileInputEl.type = 'file';
            fileInputEl.accept = '.srt,.vtt,text/plain';
            fileInputEl.style.display = 'none';

            fileInputEl.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const text = await readFileText(file);
                    State.rawSubtitle = text;
                    State.offset = 0;
                    State.subtitles = parseSRT(text);
                    if (!State.subtitles.length) {
                        toast('字幕解析失败，请检查格式');
                    } else {
                        toast(`字幕加载成功（${State.subtitles.length} 条）`);
                    }
                } catch (err) {
                    toast('读取失败: ' + err.message);
                }
                fileInputEl.value = '';
            });

            document.body.appendChild(fileInputEl);
        }
        fileInputEl.click();
    }

    function readFileText(file) {
        if (file.text) return file.text();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('读取错误'));
            reader.readAsText(file, 'utf-8');
        });
    }

    /* ================= 在线字幕搜索（迅雷） ================= */
    function searchXunlei(overlay, video) {
        const id = getVideoID();
        if (!id) {
            toast('无法识别视频ID');
            return;
        }
        toast('正在搜索字幕...');

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=${encodeURIComponent(id)}`,
            headers: {
                'Accept': 'application/json',
                'Referer': location.href,
                'Origin': location.origin,
                'User-Agent': navigator.userAgent,
            },
            timeout: 15000,
            onload: (res) => {
                let data;
                try {
                    data = JSON.parse(res.responseText);
                } catch (e) {
                    toast('接口返回解析失败');
                    return;
                }
                if (data && data.code === 0 && Array.isArray(data.data) && data.data.length) {
                    const list = data.data.filter(it => it.url && /\.srt(\?|$)/i.test(it.url));
                    if (!list.length) {
                        toast('未找到可用的 SRT 字幕');
                        return;
                    }
                    showSubList(overlay, list);
                } else {
                    toast('未找到匹配字幕');
                }
            },
            onerror: () => toast('网络错误'),
            ontimeout: () => toast('请求超时'),
        });
    }

    function showSubList(overlay, items) {
        let list = overlay.querySelector('.vs-sub-list');
        if (list) list.remove();

        list = document.createElement('div');
        list.className = 'vs-sub-panel';

        const title = document.createElement('div');
        title.className = 'vs-sub-title';
        title.textContent = `找到 ${items.length} 条字幕，请选择`;
        list.appendChild(title);

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'vs-sub-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'vs-sub-item-name';
            nameSpan.textContent = item.name || '未命名字幕';
            div.appendChild(nameSpan);

            const extra = item.extra_name || item.ext_name || '';
            if (extra) {
                const extraSpan = document.createElement('span');
                extraSpan.className = 'vs-sub-item-extra';
                extraSpan.textContent = extra;
                div.appendChild(extraSpan);
            }

            div.addEventListener('click', () => {
                list.remove();
                loadRemoteSubtitle(item.url);
            });

            list.appendChild(div);
        });

        const cancel = document.createElement('div');
        cancel.className = 'vs-sub-item';
        cancel.style.justifyContent = 'center';
        cancel.style.color = '#888';
        cancel.textContent = '取消';
        cancel.addEventListener('click', () => list.remove());
        list.appendChild(cancel);

        overlay.appendChild(list);
    }

    function loadRemoteSubtitle(url) {
        toast('正在加载字幕...');
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: {
                'Referer': location.href,
                'Origin': location.origin,
                'User-Agent': navigator.userAgent,
            },
            timeout: 15000,
            onload: (res) => {
                if (res.status !== 200) {
                    toast(`字幕加载失败 (${res.status})`);
                    return;
                }
                State.rawSubtitle = res.responseText;
                State.offset = 0;
                State.subtitles = parseSRT(res.responseText);
                if (!State.subtitles.length) {
                    toast('字幕解析失败');
                } else {
                    toast(`字幕加载成功（${State.subtitles.length} 条）`);
                }
            },
            onerror: () => toast('字幕加载失败'),
            ontimeout: () => toast('请求超时'),
        });
    }

    /* ================= 视频 ID 提取 ================= */
    function getVideoID() {
        // 1. URL 参数
        try {
            const sp = new URLSearchParams(location.search);
            for (const k of ['id', 'vid', 'video_id', 'v', 'aid', 'bvid', 'av']) {
                const v = sp.get(k);
                if (v) return v;
            }
        } catch (e) {}

        // 2. 路径末段
        const segs = location.pathname.split('/').filter(Boolean);
        if (segs.length) {
            let last = decodeURIComponent(segs[segs.length - 1]);
            last = last.replace(/\.(html?|php|aspx?|jsp)$/i, '');
            // 尝试提取形如 xxx-123 的编号
            const m = last.match(/[a-z]+[-_]?\d+[-_]?[a-z0-9]*/i);
            if (m && m[0]) return m[0];
            return last;
        }

        return '';
    }

    /* ================= SRT 解析 ================= */
    function parseSRT(text) {
        if (!text) return [];

        text = text
            .replace(/^\uFEFF/, '')
            .replace(/\r\n?/g, '\n')
            .replace(/\n{3,}/g, '\n\n');

        const blocks = text.split(/\n{2,}/);
        const out = [];

        for (const block of blocks) {
            const lines = block
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length);

            if (!lines.length) continue;

            const timeIdx = lines.findIndex(l => l.includes('-->'));
            if (timeIdx === -1) continue;

            const parts = lines[timeIdx].split('-->');
            if (parts.length < 2) continue;

            const startStr = parts[0].trim();
            const endStr = parts[1].trim().split(/\s+/)[0];

            const start = parseTimeStr(startStr);
            const end = parseTimeStr(endStr);

            if (!isFinite(start) || !isFinite(end)) continue;

            const textLines = lines.slice(timeIdx + 1);
            if (!textLines.length) continue;

            out.push({
                start: start + State.offset,
                end: end + State.offset,
                text: textLines.join('\n'),
            });
        }

        out.sort((a, b) => a.start - b.start);
        return out;
    }

    function parseTimeStr(s) {
        s = s.trim().replace(',', '.');
        // 匹配 HH:MM:SS.mmm 或 MM:SS.mmm
        const m3 = s.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m3) {
            return (+m3[1]) * 3600 + (+m3[2]) * 60 + (+m3[3]);
        }
        const m2 = s.match(/(\d+):(\d+(?:\.\d+)?)/);
        if (m2) {
            return (+m2[1]) * 60 + (+m2[2]);
        }
        return NaN;
    }

    /* ================= 初始化 ================= */
    (function init() {
        if (document.body) {
            scan();
        } else {
            document.addEventListener('DOMContentLoaded', scan, { once: true });
        }
    })();

})();