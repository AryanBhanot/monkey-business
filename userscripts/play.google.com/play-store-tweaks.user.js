// ==UserScript==
// @name        Google Play Store Tweaks
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Extra links, shortcuts and fixes for the Google Play Store
// @author      AryanBhanot
// @icon        https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/icons/play-store-tweaks.png
// @match       https://play.google.com/store/*
// @version     0.8.0
// @license     MIT
// @homepageURL https://github.com/AryanBhanot/monkey-business
// @supportURL  https://github.com/AryanBhanot/monkey-business/issues
// @updateURL   https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/play-store-tweaks.user.js
// @downloadURL https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/play-store-tweaks.user.js
// @run-at      document-idle
// @noframes
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    const enc = encodeURIComponent;

    // One entry per button: short label on the button, full name in the
    // tooltip and settings. `url` gets { pkg, title }. Nothing is sent anywhere
    // until you click a button.
    // Default order; the user can drag them into any order in settings.
    const LINKS = [
        { key: "copy", name: "Copy app info", color: "#455a64", copy: true },
        { key: "beta", label: "Beta", name: "Beta testing page", color: "#8e24aa", url: c => `https://play.google.com/apps/testing/${enc(c.pkg)}` },
        { key: "apkmirror", label: "APKM", name: "APKMirror", color: "#ff8b14", url: c => `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${enc(c.pkg)}` },
        { key: "androidpolice", label: "AP", name: "Android Police", color: "#202124", url: c => `https://www.androidpolice.com/?s=${enc(c.title)}` },
        { key: "appbrain", label: "AB", name: "AppBrain", color: "#3f51b5", url: c => `https://www.appbrain.com/app/${enc(c.pkg)}` },
        { key: "exodus", label: "Exodus", name: "Exodus Privacy report", color: "#1565c0", url: c => `https://reports.exodus-privacy.eu.org/en/search/${enc(c.pkg)}/` },
    ];

    // What "Copy" puts on the clipboard. `key` is the short tag shown on the button.
    const by = i => (i.dev ? " by " + i.dev : "");
    const escHtml = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const FORMATS = [
        { key: "md", name: "Markdown", text: i => `[${i.title.replace(/[[\]]/g, "\\$&")}](${i.url})${by(i)} (\`${i.pkg}\`)` },
        { key: "txt", name: "Plain text", text: i => `${i.title}${by(i)}\n${i.pkg}\n${i.url}` },
        { key: "bb", name: "BBCode", text: i => `[url=${i.url}]${i.title}[/url]${by(i)} (${i.pkg})` },
        { key: "html", name: "HTML link", text: i => `<a href="${escHtml(i.url)}">${escHtml(i.title)}</a>${escHtml(by(i))} (${escHtml(i.pkg)})` },
        { key: "url", name: "Link only", text: i => i.url },
        { key: "id", name: "Package name only", text: i => i.pkg },
    ];
    const OLD_FORMATS = { markdown: "md", bbcode: "bb", plain: "txt" }; // names used before 0.8

    // ---- Settings: which buttons are shown ---------------------------------
    // Stored by the userscript manager (falls back to localStorage).
    const KEY = "gpt:enabled";
    function load() {
        let v = null;
        try { v = typeof GM_getValue === "function" ? GM_getValue(KEY, null) : JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* use defaults */ }
        return v && typeof v === "object" ? v : {};
    }
    function save(v) {
        try { if (typeof GM_setValue === "function") GM_setValue(KEY, v); else localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* not saved */ }
    }
    let enabled = load();
    const isOn = l => enabled[l.key] !== false; // everything is on by default
    let rev = 0; // bumped on every settings change so the bars are rebuilt
    // Buttons in the user's order (any button they have never ordered goes last).
    function ordered() {
        const saved = Array.isArray(enabled.order) ? enabled.order : [];
        const pos = l => { const i = saved.indexOf(l.key); return i < 0 ? 1000 + LINKS.indexOf(l) : i; };
        return LINKS.slice().sort((a, b) => pos(a) - pos(b));
    }
    function fmtIndex() {
        const k = OLD_FORMATS[enabled.copyFormat] || enabled.copyFormat;
        return Math.max(0, FORMATS.findIndex(f => f.key === k));
    }
    function setFormat(k) {
        enabled = Object.assign({}, enabled, { copyFormat: k });
        save(enabled);
        for (const b of document.querySelectorAll(".gpt-copy")) labelCopy(b);
        for (const r of document.querySelectorAll('#gpt-settings input[name="gpt-format"]')) r.checked = r.value === k;
    }

    // ---- Styles -------------------------------------------------------------
    // Sizes (height, radius, font) are copied from Google's own Install button
    // at build time through the --gpt-* variables, so the bar always matches it.
    const style = document.createElement("style");
    style.textContent = `
.gpt-bar { --gpt-h: 36px; --gpt-r: 8px; --gpt-fs: 14px; --gpt-ls: .15px;
    --gpt-accent: #01875f; --gpt-outline: #747775; --gpt-hover: rgba(1,135,95,.08);
    position: relative; z-index: 3; /* above the hero-banner overlay on apps with a trailer */
    display: inline-flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 0 8px; min-width: 0; }
/* Share has its own ~16px left padding; trim so the gaps on both sides of the bar are equal */
.gpt-bar.gpt-inline { margin-right: -8px; }
.gpt-bar.gpt-stack { display: flex; justify-content: center; gap: 6px; margin: 12px 0; }
.gpt-bar.gpt-stack .gpt-btn { padding: 0 10px; } /* phones: tighter */
.gpt-bar.gpt-below { display: flex; margin: 12px 0 0; }
.gpt-bar.gpt-float { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; margin: 0; padding: 8px; background: #fff;
    border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.3); }
.gpt-btn, .gpt-gear { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: var(--gpt-h);
    border-radius: var(--gpt-r); font: 500 var(--gpt-fs)/var(--gpt-fs) "Google Sans", Roboto, Arial, sans-serif; letter-spacing: var(--gpt-ls);
    text-decoration: none !important; white-space: nowrap; cursor: pointer; text-shadow: none; -webkit-tap-highlight-color: transparent;
    /* Keep each button on its own compositor layer with greyscale text, always (not only
       while animating), so the text never switches rendering and "glows". Same as Google's buttons. */
    transform: translateZ(0); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    transition: background-color .28s cubic-bezier(.4,0,.2,1), box-shadow .28s cubic-bezier(.4,0,.2,1); }
.gpt-btn { padding: 0 14px; border: 0; color: #fff !important; }
/* Same state layer as Google's Install button: it DARKENS (#202124 at 16%) and gains a small shadow */
.gpt-btn:hover, .gpt-btn:focus-visible { box-shadow: inset 0 0 0 999px rgba(32,33,36,.16), 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15); }
.gpt-btn:active { box-shadow: inset 0 0 0 999px rgba(32,33,36,.24); }
.gpt-gear { width: var(--gpt-h); min-width: 0; min-height: 0; padding: 0; margin: 0; background: transparent; border: 1px solid var(--gpt-outline); color: var(--gpt-accent); }
.gpt-gear:hover { background: var(--gpt-hover); }
.gpt-gear:active { background: rgba(1,135,95,.16); }
.gpt-btn:focus-visible, .gpt-gear:focus-visible { outline: 2px solid var(--gpt-accent); outline-offset: 2px; }
.gpt-gear svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; }
/* Copy: [icon | format] */
.gpt-bar .gpt-btn.gpt-copy { gap: 7px; padding: 0 10px; }
.gpt-copy svg { width: 18px; height: 18px; flex: none; fill: currentColor; pointer-events: none; }
.gpt-copy .gpt-sep { width: 1px; height: 55%; background: rgba(255,255,255,.5); flex: none; pointer-events: none; }
.gpt-copy .gpt-fmt { min-width: 4ch; text-align: center; pointer-events: none; }
/* Settings rows: [checkbox dot name ........ drag handle] */
#gpt-settings { max-height: calc(100vh - 16px); overflow-y: auto; overscroll-behavior: contain; }
#gpt-settings .gpt-tag { margin-left: auto; color: var(--gpt-sub); font: 12px/16px ui-monospace, Consolas, monospace; }
#gpt-settings .gpt-list { position: relative; }
#gpt-settings .gpt-row { display: flex; align-items: center; }
#gpt-settings .gpt-row label { flex: 1; padding-right: 4px; }
#gpt-settings .gpt-row label:hover { background: none; }
#gpt-settings .gpt-row:hover { background: rgba(1,135,95,.08); }
#gpt-settings .gpt-handle { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin-right: 10px; border-radius: 6px;
    color: var(--gpt-sub); cursor: grab; touch-action: none; user-select: none; }
#gpt-settings .gpt-handle:hover, #gpt-settings .gpt-handle:focus-visible { background: rgba(60,64,67,.12); color: var(--gpt-fg); outline: none; }
#gpt-settings .gpt-handle svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; }
#gpt-settings .gpt-row.gpt-dragging { background: var(--gpt-bg); box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15); position: relative; z-index: 1; }
#gpt-settings .gpt-row.gpt-dragging .gpt-handle { cursor: grabbing; }
html[data-gpt-theme="dark"] #gpt-settings .gpt-row:hover { background: rgba(129,201,149,.12); }
html[data-gpt-theme="dark"] #gpt-settings .gpt-handle:hover { background: rgba(255,255,255,.1); }
html[data-gpt-theme="dark"] #gpt-settings .gpt-row label:hover { background: none; }
#gpt-settings { --gpt-bg: #fff; --gpt-fg: #202124; --gpt-sub: #5f6368; --gpt-line: #e8eaed; --gpt-accent: #01875f;
    position: fixed; z-index: 2147483001; width: 280px; padding: 8px 0 10px; box-sizing: border-box; background: var(--gpt-bg); color: var(--gpt-fg);
    border-radius: 12px; box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
    font: 14px/20px "Google Sans", Roboto, Arial, sans-serif; text-align: left; }
#gpt-settings .gpt-title { padding: 8px 20px 10px; font-size: 16px; font-weight: 500; border-bottom: 1px solid var(--gpt-line); }
#gpt-settings .gpt-sub { padding: 8px 20px 4px; color: var(--gpt-sub); font-size: 12px; }
#gpt-settings label { display: flex; align-items: center; gap: 12px; padding: 7px 20px; cursor: pointer; }
#gpt-settings label:hover { background: rgba(1,135,95,.08); }
#gpt-settings input { width: 18px; height: 18px; margin: 0; accent-color: var(--gpt-accent); cursor: pointer; }
#gpt-settings .gpt-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
html[data-gpt-theme="dark"] .gpt-bar { --gpt-accent: #81c995; --gpt-outline: #8e918f; --gpt-hover: rgba(129,201,149,.12); }
html[data-gpt-theme="dark"] .gpt-btn[data-k="androidpolice"] { background-color: #5f6368 !important; } /* near-black would vanish */
html[data-gpt-theme="dark"] .gpt-bar.gpt-float { background: #2d2f31; }
html[data-gpt-theme="dark"] .gpt-gear:active { background: rgba(129,201,149,.2); }
html[data-gpt-theme="dark"] #gpt-settings { --gpt-bg: #2d2f31; --gpt-fg: #e3e3e3; --gpt-sub: #c4c7c5; --gpt-line: #444746; --gpt-accent: #81c995; }
html[data-gpt-theme="dark"] #gpt-settings label:hover { background: rgba(129,201,149,.12); }
`;
    document.head.append(style);

    // ---- Page helpers ---------------------------------------------------------
    const visible = el => el.getClientRects().length > 0;
    // Match the page's own theme (not the OS setting): Play's pages can be light
    // while the OS is dark, and the other way round.
    function syncTheme() {
        for (const el of [document.body, document.documentElement]) {
            const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
            if (m && m.length >= 3 && (m[3] === undefined || +m[3] > 0.5)) {
                const dark = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) < 110;
                if (document.documentElement.dataset.gptTheme !== (dark ? "dark" : "light")) document.documentElement.dataset.gptTheme = dark ? "dark" : "light";
                return;
            }
        }
    }
    const onDetails = () => /^\/store\/apps\/details\/?$/.test(location.pathname);
    const onSearch = () => /^\/store\/search\/?$/.test(location.pathname);
    const detailsPkg = () => (onDetails() ? new URLSearchParams(location.search).get("id") : null);

    // After in-app navigation Play keeps the previous page in the DOM (hidden),
    // so only ever use visible elements.
    const titleEl = () => [...document.querySelectorAll("h1")].find(visible) || null;

    // ---- Finding Install buttons -------------------------------------------------
    // Google shows different buttons depending on page, login and install state
    // ("Install", "Install on more devices", "Installed", "Buy", "Pre-register"…)
    // in different languages, so we never match on text. Instead we look for the
    // container Google wraps its Install button in (it carries the package name in
    // data-item-id) holding a filled (coloured) button.
    const isFilled = b => {
        const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g);
        if (!m || m.length < 3 || (m[3] !== undefined && +m[3] === 0)) return false;
        return !(+m[0] > 235 && +m[1] > 235 && +m[2] > 235); // white = an outlined button
    };
    const pkgOf = el => ((el.getAttribute("data-item-id") || "").match(/"([A-Za-z][\w]*(?:\.[\w]+)+)"/) || [])[1] || null;

    // Returns [{ el, btn, pkg }]: `el` is what the bar is placed relative to,
    // `btn` is the real button whose size we copy.
    function installTargets() {
        const out = [], want = detailsPkg();
        if (!want && !onSearch()) return out;
        for (const el of document.querySelectorAll("[data-item-id]")) {
            const pkg = pkgOf(el);
            if (!pkg || (want && pkg !== want) || !visible(el)) continue;
            const btn = [...el.querySelectorAll("button")].find(b => visible(b) && isFilled(b));
            if (btn) out.push({ el, btn, pkg });
        }
        if (!out.length && want) {
            // Fallback: the first filled button just below the app title.
            const h1 = titleEl();
            if (h1) {
                const top = h1.getBoundingClientRect().bottom;
                const btn = [...document.querySelectorAll("button")]
                    .filter(b => !b.closest(".gpt-bar, #gpt-settings") && visible(b) && isFilled(b))
                    .map(b => ({ b, r: b.getBoundingClientRect() }))
                    .filter(({ r }) => r.top >= top && r.top < top + 400)
                    .sort((x, y) => x.r.top - y.r.top || x.r.left - y.r.left)[0];
                if (btn) out.push({ el: btn.b, btn: btn.b, pkg: want });
            }
        }
        return out;
    }

    // Title of the app a target belongs to.
    function titleFor(t) {
        if (detailsPkg()) { const h = titleEl(); if (h) return h.textContent.trim(); }
        // Search results have no heading: the app name is the first text in the result card.
        let card = t.el;
        for (let i = 0; i < 10 && card.parentElement; i++) {
            card = card.parentElement;
            if (card.querySelector(`a[href*="details?id=${t.pkg}"]`)) break;
        }
        for (const e of card.querySelectorAll("*")) {
            if (e.children.length || e.closest("button, .gpt-bar") || !visible(e)) continue;
            const txt = e.textContent.trim();
            if (txt) return txt;
        }
        return t.pkg;
    }

    // From the Install container, climb to the wrapper the bar should follow.
    // Returns { node, mode } or null:
    //   "inline": node is a direct child of the horizontal row holding Install
    //             (and Share); the bar sits right after it in that row.
    //   "stack":  Install is full width with things stacked under it (narrow
    //             screens); the bar goes in as its own row right after it.
    function slotFrom(start) {
        const sr = start.getBoundingClientRect();
        let node = start, stack = null;
        for (let i = 0; node && node.parentElement && node.parentElement !== document.body && i < 15; i++, node = node.parentElement) {
            const p = node.parentElement, cs = getComputedStyle(p), pr = p.getBoundingClientRect();
            const kids = [...p.children].filter(c => visible(c) && !c.classList.contains("gpt-bar"));
            // A real button row has all of Google's items on one line next to the
            // button. Page-level layout rows (whose columns start far above, or
            // that are much taller) don't qualify.
            const isRow = /flex/.test(cs.display) && /^row/.test(cs.flexDirection) && kids.length >= 1
                && pr.width > node.getBoundingClientRect().width + 100
                && kids.every(c => Math.abs(c.getBoundingClientRect().top - sr.top) < 40)
                && (kids.length >= 2 || pr.height < sr.height * 2);
            if (isRow) return { node, mode: "inline" };
            if (!stack && kids.length >= 2 && pr.height < sr.height * 8) stack = { node, mode: "stack" };
        }
        return stack;
    }

    // If the bar doesn't fit beside Install (it wrapped), put it on its own line
    // below the whole button row instead.
    const tooNarrow = new Set();
    function belowRow(node) {
        let r = node.parentElement;
        while (r.parentElement && r.parentElement !== document.body) {
            const cs = getComputedStyle(r.parentElement);
            if (!(/flex/.test(cs.display) && /^row/.test(cs.flexDirection))) break;
            r = r.parentElement;
        }
        return { node: r, mode: "below" };
    }

    // ---- Button bar -----------------------------------------------------------------
    // Material icons
    const ICON_COPY = "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z";
    const ICON_DONE = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
    const ICON_FAIL = "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
    const ICON_DRAG = "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z";
    function icon(d) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        svg.append(path);
        return svg;
    }
    function gearIcon() {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z");
        svg.append(path);
        return svg;
    }

    function buildBar(t, title, key) {
        const bar = document.createElement("div");
        bar.className = "gpt-bar";
        bar.dataset.key = key;
        // Copy Google's own button metrics so ours match.
        const cs = getComputedStyle(t.btn), h = t.btn.getBoundingClientRect().height;
        if (h >= 24 && h <= 72) bar.style.setProperty("--gpt-h", Math.round(h) + "px");
        if (cs.borderRadius && !/%/.test(cs.borderRadius)) bar.style.setProperty("--gpt-r", cs.borderRadius.split(" ")[0]);
        if (parseFloat(cs.fontSize) > 0) bar.style.setProperty("--gpt-fs", cs.fontSize);
        if (cs.letterSpacing && cs.letterSpacing !== "normal") bar.style.setProperty("--gpt-ls", cs.letterSpacing);
        for (const l of ordered().filter(isOn)) {
            const a = document.createElement(l.copy ? "button" : "a");
            a.className = "gpt-btn";
            a._link = l;
            a.dataset.k = l.key;
            if (l.copy) {
                a.type = "button";
                a.classList.add("gpt-copy");
                const sep = document.createElement("span"), fmt = document.createElement("span");
                sep.className = "gpt-sep";
                fmt.className = "gpt-fmt";
                a.append(icon(ICON_COPY), sep, fmt);
                labelCopy(a);
                a.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); copyInfo(a, bar); });
                a.addEventListener("wheel", onCopyWheel, { passive: false });
            } else {
                a.textContent = l.label;
                a.title = l.name;
                a.href = l.url({ pkg: t.pkg, title });
                a.target = "_blank";
                a.rel = "noopener noreferrer";
            }
            a.style.backgroundColor = l.color;
            bar.append(a);
        }
        const gear = document.createElement("button");
        gear.type = "button";
        gear.className = "gpt-gear";
        gear.title = "Store Tweaks settings";
        gear.setAttribute("aria-label", "Store Tweaks settings");
        gear.append(gearIcon());
        gear.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggleSettings(gear); });
        hoverClose(gear);
        bar.append(gear);
        return bar;
    }

    function labelCopy(btn) {
        const f = FORMATS[fmtIndex()];
        btn.querySelector(".gpt-fmt").textContent = f.key;
        btn.title = `Copy app info as ${f.name}\nShift + scroll to change format`;
        btn.setAttribute("aria-label", `Copy app info as ${f.name}`);
    }
    // Shift + mouse wheel over Copy cycles through the formats. One step per
    // notch; the short cooldown stops a trackpad from spinning through them all.
    let lastWheel = 0;
    function onCopyWheel(e) {
        if (!e.shiftKey) return;
        e.preventDefault();
        const d = e.deltaY || e.deltaX; // some browsers turn Shift + wheel into a sideways scroll
        const now = Date.now();
        if (!d || now - lastWheel < 120) return;
        lastWheel = now;
        setFormat(FORMATS[(fmtIndex() + (d > 0 ? 1 : -1) + FORMATS.length) % FORMATS.length].key);
    }

    // Copy button: gathers the app's details when clicked (so it is never stale),
    // formats them and puts them on the clipboard.
    function copyInfo(btn, bar) {
        const pkg = bar.dataset.key.split("|")[0], title = bar.dataset.title || pkg;
        // The developer link only exists on the app's own page.
        const devEl = detailsPkg() ? [...document.querySelectorAll('a[href*="/store/apps/dev"]')].find(visible) : null;
        const dev = devEl ? devEl.textContent.trim() : "";
        const fmt = FORMATS[fmtIndex()];
        const text = fmt.text({ pkg, title, dev, url: `https://play.google.com/store/apps/details?id=${enc(pkg)}` });
        // Swap the copy icon for a tick (or a cross) for a moment; the size never changes.
        const done = ok => {
            const path = btn.querySelector("path");
            clearTimeout(btn._t);
            if (path) path.setAttribute("d", ok ? ICON_DONE : ICON_FAIL);
            btn.setAttribute("aria-label", ok ? "Copied" : "Copy failed");
            btn._t = setTimeout(() => { if (path) path.setAttribute("d", ICON_COPY); labelCopy(btn); }, 1400);
        };
        const fallback = () => {
            const ta = document.createElement("textarea");
            ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
            document.body.append(ta); ta.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (_) { /* ignore */ }
            ta.remove(); done(ok);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback);
        else fallback();
    }

    let floatSince = 0; // when we first failed to find any install button on this page
    let lastPage = "";

    // Links that go through Google's redirector (google.com/url?q=TARGET) are
    // pointed straight at TARGET, so there is no extra hop and nothing is
    // reported to Google when you click.
    const REDIRECT_HOST = /^(www\.)?google\.(com?\.)?[a-z]{2,3}$/;
    function unwrapRedirects() {
        if (enabled.unwrap === false) return;
        for (const a of document.querySelectorAll('a[href*="/url?"]')) {
            let u;
            try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { continue; }
            if (!REDIRECT_HOST.test(u.hostname) || u.pathname !== "/url") continue;
            const to = u.searchParams.get("q") || u.searchParams.get("url");
            if (to && /^https?:\/\//i.test(to)) a.setAttribute("href", to);
        }
    }

    // Add, move or remove the bars so there is exactly one after each Install
    // button on the page. Safe to call repeatedly.
    function update() {
        syncTheme();
        unwrapRedirects();
        const page = location.pathname + location.search;
        if (page !== lastPage) { lastPage = page; floatSince = 0; }
        const existing = [...document.querySelectorAll(".gpt-bar")];
        const targets = installTargets();
        const keep = new Set();

        const jobs = targets.map(t => {
            const title = titleFor(t) || t.pkg;
            const fitKey = [t.pkg, title, rev, window.innerWidth].join("|");
            let slot = slotFrom(t.el);
            if (slot && slot.mode === "inline" && tooNarrow.has(fitKey)) slot = belowRow(slot.node);
            return { t, title, fitKey, slot, key: t.pkg + "|" + rev };
        });

        // No install button yet: the page may still be rendering, so wait before floating.
        if (!jobs.length && detailsPkg()) {
            if (!floatSince) floatSince = Date.now();
            if (Date.now() - floatSince < 2000) {
                for (const b of existing) b.remove(); // never leave a stale bar up
                schedule(500);
                return;
            }
            jobs.push({ t: { pkg: detailsPkg(), btn: document.body }, title: getTitleSafe(), slot: null, key: detailsPkg() + "|" + rev, fitKey: "" });
        } else floatSince = 0;

        // Bars are updated in place (title, layout mode, position) and only rebuilt when
        // the app or the settings change, so nothing flashes while the page settles.
        const MODES = ["gpt-inline", "gpt-stack", "gpt-below", "gpt-float"];
        for (const j of jobs) {
            let bar = existing.find(b => b.dataset.key === j.key && !keep.has(b));
            const mode = "gpt-" + (j.slot ? j.slot.mode : "float");
            if (!bar) {
                bar = buildBar(j.t, j.title, j.key);
                bar.dataset.title = j.title;
            } else if (bar.dataset.title !== j.title) {
                bar.dataset.title = j.title;
                for (const a of bar.querySelectorAll("a.gpt-btn")) a.href = a._link.url({ pkg: j.t.pkg, title: j.title });
            }
            keep.add(bar);
            if (!bar.classList.contains(mode)) { bar.classList.remove(...MODES); bar.classList.add(mode); }
            if (j.slot) { if (bar.previousElementSibling !== j.slot.node || !bar.isConnected) j.slot.node.after(bar); }
            else if (bar.parentElement !== document.body) document.body.append(bar);
            // Wrapped onto more than one line? Then it didn't fit; move it below.
            if (j.slot && j.slot.mode === "inline" && bar.offsetHeight > bar.querySelector(".gpt-btn").offsetHeight + 12) {
                tooNarrow.add(j.fitKey); schedule(0);
            }
        }
        for (const b of existing) if (!keep.has(b)) b.remove();
    }
    function getTitleSafe() { const h = titleEl(); return h ? h.textContent.trim() : detailsPkg(); }

    // ---- Settings panel -------------------------------------------------------------
    let closeTimer = 0;
    function closeSettings() { clearTimeout(closeTimer); const p = document.getElementById("gpt-settings"); if (p) p.remove(); }
    // Close as soon as the mouse is off both the panel and the gear (with a short
    // grace period so you can move from one to the other).
    function hoverClose(el) {
        el.addEventListener("mouseenter", () => clearTimeout(closeTimer));
        el.addEventListener("mouseleave", () => {
            if (!document.getElementById("gpt-settings")) return;
            clearTimeout(closeTimer);
            closeTimer = setTimeout(() => { if (!dragging) closeSettings(); }, 250);
        });
    }
    // Reordering: drag a row by its handle (mouse, pen or touch), or focus the
    // handle and press the up/down arrow keys. Saved when you let go.
    let dragging = false;
    function saveOrder(list) {
        const order = [...list.children].map(r => r.dataset.key);
        if (JSON.stringify(order) === JSON.stringify(ordered().map(l => l.key))) return;
        enabled = Object.assign({}, enabled, { order });
        save(enabled); rev++; update();
    }
    function dragRow(row, handle, list) {
        handle.addEventListener("pointerdown", e => {
            if (e.button !== 0) return;
            e.preventDefault();
            dragging = true;
            row.classList.add("gpt-dragging");
            // Listen on the window, not the handle: moving the row in the DOM would
            // drop pointer capture and strand the drag halfway.
            const move = ev => {
                if (ev.pointerId !== e.pointerId) return;
                // Put the row before the first other row whose middle is below the pointer.
                for (const r of list.children) {
                    if (r === row) continue;
                    const b = r.getBoundingClientRect();
                    if (ev.clientY < b.top + b.height / 2) { if (row.nextElementSibling !== r) list.insertBefore(row, r); return; }
                }
                if (list.lastElementChild !== row) list.append(row);
            };
            const end = ev => {
                if (ev.pointerId !== e.pointerId) return;
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", end, true);
                window.removeEventListener("pointercancel", end, true);
                row.classList.remove("gpt-dragging");
                dragging = false;
                if (list.isConnected) saveOrder(list);
            };
            window.addEventListener("pointermove", move, true);
            window.addEventListener("pointerup", end, true);
            window.addEventListener("pointercancel", end, true);
        });
        handle.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); });
        handle.addEventListener("keydown", e => {
            if (e.key === "ArrowUp" && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
            else if (e.key === "ArrowDown" && row.nextElementSibling) row.nextElementSibling.after(row);
            else return;
            e.preventDefault();
            handle.focus();
            saveOrder(list);
        });
    }
    function placePanel(panel, anchor) {
        const w = panel.offsetWidth, h = panel.offsetHeight;
        if (!anchor || !anchor.isConnected) { panel.style.right = "16px"; panel.style.bottom = "16px"; return; }
        const r = anchor.getBoundingClientRect();
        const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
        // Below the gear if it fits, otherwise above. Overlap by 2px so there is no gap to cross.
        const top = r.bottom + h + 8 <= window.innerHeight ? r.bottom - 2 : Math.max(8, r.top - h + 2);
        panel.style.left = left + "px";
        panel.style.top = top + "px";
    }
    function toggleSettings(anchor) {
        if (document.getElementById("gpt-settings")) { closeSettings(); return; }
        const panel = document.createElement("div");
        panel.id = "gpt-settings";
        const title = document.createElement("div");
        title.className = "gpt-title";
        title.textContent = "Store Tweaks";
        const sub = document.createElement("div");
        sub.className = "gpt-sub";
        sub.textContent = "Show next to Install · drag ☰ to reorder";
        const list = document.createElement("div");
        list.className = "gpt-list";
        panel.append(title, sub, list);
        for (const l of ordered()) {
            const row = document.createElement("div");
            row.className = "gpt-row";
            row.dataset.key = l.key;
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = isOn(l);
            box.addEventListener("change", () => { enabled = Object.assign({}, enabled, { [l.key]: box.checked }); save(enabled); rev++; update(); });
            const dot = document.createElement("span");
            dot.className = "gpt-dot";
            dot.style.background = l.color;
            label.append(box, dot, l.name);
            const handle = document.createElement("span");
            handle.className = "gpt-handle";
            handle.tabIndex = 0;
            handle.title = "Drag to reorder (or focus and use the arrow keys)";
            handle.setAttribute("role", "button");
            handle.setAttribute("aria-label", `Move ${l.name}`);
            handle.append(icon(ICON_DRAG));
            dragRow(row, handle, list);
            row.append(label, handle);
            list.append(row);
        }
        const subF = document.createElement("div");
        subF.className = "gpt-sub";
        subF.textContent = "Copy format · or Shift + scroll on Copy";
        panel.append(subF);
        const cur = FORMATS[fmtIndex()].key;
        for (const f of FORMATS) {
            const label = document.createElement("label");
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "gpt-format";
            radio.value = f.key;
            radio.checked = f.key === cur;
            radio.addEventListener("change", () => { if (radio.checked) setFormat(f.key); });
            const tag = document.createElement("span");
            tag.className = "gpt-tag";
            tag.textContent = f.key;
            label.append(radio, f.name, tag);
            panel.append(label);
        }
        const sub2 = document.createElement("div");
        sub2.className = "gpt-sub";
        sub2.textContent = "Links";
        const uLabel = document.createElement("label");
        const uBox = document.createElement("input");
        uBox.type = "checkbox";
        uBox.checked = enabled.unwrap !== false;
        uBox.addEventListener("change", () => { enabled = Object.assign({}, enabled, { unwrap: uBox.checked }); save(enabled); update(); });
        uLabel.append(uBox, "Skip Google redirect links");
        panel.append(sub2, uLabel);
        hoverClose(panel);
        document.body.append(panel);
        placePanel(panel, anchor);
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); }, true);
    document.addEventListener("click", e => {
        if (!e.target.closest || !e.target.closest("#gpt-settings, .gpt-gear")) closeSettings();
    }, true);
    window.addEventListener("scroll", closeSettings, { passive: true });
    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Store Tweaks settings", () => toggleSettings(document.querySelector(".gpt-gear")));
    }

    // ---- Main loop -------------------------------------------------------------------
    // Play swaps pages without reloading, so re-check whenever the page changes.
    // Batched, because Play mutates the DOM constantly.
    let timer = 0;
    function schedule(delay) {
        if (timer) return;
        timer = setTimeout(() => { timer = 0; try { update(); } catch (err) { console.error("[Google Play Store Tweaks]", err); } }, delay || 100);
    }
    new MutationObserver(() => schedule()).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", () => schedule());
    window.addEventListener("resize", () => schedule(200));
    schedule(0);
})();
