// ==UserScript==
// @name        Google Play – Toolbox
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Adds link buttons (APKMirror, Android Police, AppBrain, Beta, Exodus Privacy) next to the Install button on the Google Play Store website.
// @author      AryanBhanot
// @match       https://play.google.com/store/*
// @version     0.5.1
// @license     MIT
// @homepageURL https://github.com/AryanBhanot/monkey-business
// @supportURL  https://github.com/AryanBhanot/monkey-business/issues
// @updateURL   https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/google-play-toolbox.user.js
// @downloadURL https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/google-play-toolbox.user.js
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
    const LINKS = [
        { key: "apkmirror", label: "APKM", name: "APKMirror", color: "#ff8b14", url: c => `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${enc(c.pkg)}` },
        { key: "androidpolice", label: "AP", name: "Android Police", color: "#202124", url: c => `https://www.androidpolice.com/?s=${enc(c.title)}` },
        { key: "appbrain", label: "AB", name: "AppBrain", color: "#3f51b5", url: c => `https://www.appbrain.com/app/${enc(c.pkg)}` },
        { key: "beta", label: "Beta", name: "Beta testing page", color: "#8e24aa", url: c => `https://play.google.com/apps/testing/${enc(c.pkg)}` },
        { key: "exodus", label: "Exodus", name: "Exodus Privacy report", color: "#1565c0", url: c => `https://reports.exodus-privacy.eu.org/en/search/${enc(c.pkg)}/` },
    ];

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
.gpt-bar.gpt-stack .gpt-btn { padding: 0 10px; } /* phones: keep everything on one line */
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
        for (const l of LINKS.filter(isOn)) {
            const a = document.createElement("a");
            a.className = "gpt-btn";
            a._link = l;
            a.dataset.k = l.key;
            a.textContent = l.label;
            a.title = l.name;
            a.href = l.url({ pkg: t.pkg, title });
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.style.backgroundColor = l.color;
            bar.append(a);
        }
        const gear = document.createElement("button");
        gear.type = "button";
        gear.className = "gpt-gear";
        gear.title = "Toolbox settings";
        gear.setAttribute("aria-label", "Toolbox settings");
        gear.append(gearIcon());
        gear.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggleSettings(gear); });
        hoverClose(gear);
        bar.append(gear);
        return bar;
    }

    let floatSince = 0; // when we first failed to find any install button on this page
    let lastPage = "";

    // Add, move or remove the bars so there is exactly one after each Install
    // button on the page. Safe to call repeatedly.
    function update() {
        syncTheme();
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
                for (const a of bar.querySelectorAll(".gpt-btn")) a.href = a._link.url({ pkg: j.t.pkg, title: j.title });
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
            closeTimer = setTimeout(closeSettings, 250);
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
        title.textContent = "Toolbox buttons";
        const sub = document.createElement("div");
        sub.className = "gpt-sub";
        sub.textContent = "Show next to Install";
        panel.append(title, sub);
        for (const l of LINKS) {
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = isOn(l);
            box.addEventListener("change", () => { enabled = Object.assign({}, enabled, { [l.key]: box.checked }); save(enabled); rev++; update(); });
            const dot = document.createElement("span");
            dot.className = "gpt-dot";
            dot.style.background = l.color;
            label.append(box, dot, l.name);
            panel.append(label);
        }
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
        GM_registerMenuCommand("Toolbox settings", () => toggleSettings(document.querySelector(".gpt-gear")));
    }

    // ---- Main loop -------------------------------------------------------------------
    // Play swaps pages without reloading, so re-check whenever the page changes.
    // Batched, because Play mutates the DOM constantly.
    let timer = 0;
    function schedule(delay) {
        if (timer) return;
        timer = setTimeout(() => { timer = 0; try { update(); } catch (err) { console.error("[Google Play Toolbox]", err); } }, delay || 100);
    }
    new MutationObserver(() => schedule()).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", () => schedule());
    window.addEventListener("resize", () => schedule(200));
    schedule(0);
})();
