// ==UserScript==
// @name        Google Play – Toolbox
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Adds link buttons (APKMirror, Android Police, AppBrain, Beta, Exodus Privacy) next to the Install button on the Google Play Store website.
// @author      AryanBhanot
// @match       https://play.google.com/store/*
// @version     0.4.0
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
        { key: "androidpolice", label: "AP", name: "Android Police", color: "#111111", url: c => `https://www.androidpolice.com/?s=${enc(c.title)}` },
        { key: "appbrain", label: "AB", name: "AppBrain", color: "#3f51b5", url: c => `https://www.appbrain.com/app/${enc(c.pkg)}` },
        { key: "beta", label: "Beta", name: "Beta testing page (join or leave)", color: "#8e24aa", url: c => `https://play.google.com/apps/testing/${enc(c.pkg)}` },
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
    let rev = 0; // bumped on every settings change so the bar is rebuilt

    const style = document.createElement("style");
    style.textContent = `
#gpt-bar { position: relative; z-index: 3; /* above the hero-banner overlay on apps with a trailer */
    display: inline-flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 8px; min-width: 0; }
#gpt-bar.gpt-stack { display: flex; justify-content: center; margin: 12px 0; }
#gpt-bar.gpt-below { display: flex; margin: 12px 0 0; }
#gpt-bar.gpt-float { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; margin: 0; padding: 8px;
    background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.3); }
.gpt-btn { display: inline-flex; align-items: center; height: 36px; padding: 0 10px; border-radius: 8px; color: #fff !important;
    font: 500 14px/1 "Google Sans", Roboto, Arial, sans-serif; text-decoration: none !important; white-space: nowrap; box-sizing: border-box; }
.gpt-btn:hover { filter: brightness(1.12); }
#gpt-gear { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: #e8eaed; color: #3c4043;
    font-size: 20px; line-height: 36px; cursor: pointer; }
#gpt-gear:hover { background: #dadce0; }
#gpt-settings { position: fixed; z-index: 2147483001; width: 260px; padding: 14px 16px; background: #fff; color: #202124; box-sizing: border-box;
    border-radius: 12px; box-shadow: 0 2px 14px rgba(0,0,0,.35); font: 14px/1.4 Roboto, Arial, sans-serif; text-align: left; }
#gpt-settings b { display: block; margin-bottom: 8px; font-size: 15px; }
#gpt-settings label { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
`;
    document.head.append(style);

    // Package name of the app on the current page, or null on other pages.
    function currentPkg() {
        if (!/^\/store\/apps\/details\/?$/.test(location.pathname)) return null;
        return new URLSearchParams(location.search).get("id");
    }

    const visible = el => el.getClientRects().length > 0;

    // After in-app navigation Play keeps the previous page in the DOM (hidden),
    // so always use the visible title.
    const titleEl = () => [...document.querySelectorAll("h1")].find(visible) || null;
    function getTitle() {
        const h1 = titleEl();
        return h1 ? h1.textContent.trim() : "";
    }

    // ---- Finding the Install button ---------------------------------------
    // Google shows different buttons depending on login and install state
    // ("Install", "Install on more devices", "Installed", "Buy", "Pre-register"…)
    // in different languages, so we never match on text. Candidates, best first:
    //   1. Google's install container (data-is-free + data-item-id for this app)
    //   2. the first filled (coloured) button below the app title
    //   3. the first visible button below the app title
    function installCandidates(pkg) {
        const out = [];
        for (const b of document.querySelectorAll("[data-is-free][data-item-id]")) {
            if (b.getAttribute("data-item-id").includes(`"${pkg}"`) && visible(b)) out.push(b);
        }
        const h1 = titleEl();
        if (h1) {
            const top = h1.getBoundingClientRect().bottom;
            const btns = [...document.querySelectorAll("button, a[role=button]")]
                .filter(b => !b.closest("#gpt-bar, #gpt-settings") && visible(b))
                .map(b => ({ b, r: b.getBoundingClientRect() }))
                .filter(({ r }) => r.top >= top && r.top < top + 400 && r.width > 0)
                .sort((x, y) => x.r.top - y.r.top || x.r.left - y.r.left)
                .map(x => x.b);
            const filled = btns.find(b => { const c = getComputedStyle(b).backgroundColor; return c && c !== "transparent" && !/,\s*0\)$/.test(c); });
            if (filled) out.push(filled);
            if (btns[0]) out.push(btns[0]);
        }
        return out;
    }

    // From the Install button, climb to the wrapper the bar should follow.
    // Returns { node, mode } or null:
    //   "inline": node is a direct child of the horizontal row holding Install
    //             and Share (desktop); the bar sits right after it in that row.
    //   "stack":  Install is full width with things stacked under it (narrow
    //             screens); the bar goes in as its own row right after it.
    function slotFrom(start) {
        const sr = start.getBoundingClientRect();
        let node = start, stack = null;
        for (let i = 0; node && node.parentElement && node.parentElement !== document.body && i < 15; i++, node = node.parentElement) {
            const p = node.parentElement, cs = getComputedStyle(p), pr = p.getBoundingClientRect();
            const kids = [...p.children].filter(c => visible(c) && c.id !== "gpt-bar");
            // A real button row has all of Google's items on one line next to the
            // button. Judged without our bar, so the bar wrapping can't flip the result,
            // and page-level layout rows (whose columns start far above) don't qualify.
            const isRow = /flex/.test(cs.display) && /^row/.test(cs.flexDirection) && kids.length >= 2
                && pr.width > node.getBoundingClientRect().width + 100
                && kids.every(c => Math.abs(c.getBoundingClientRect().top - sr.top) < 40);
            if (isRow) return { node, mode: "inline" };
            if (!stack && kids.length >= 2 && pr.height < sr.height * 8) stack = { node, mode: "stack" };
        }
        return stack;
    }

    function findInstallSlot(pkg) {
        for (const c of installCandidates(pkg)) {
            const slot = slotFrom(c);
            if (slot) return slot;
        }
        return null;
    }

    // If the bar doesn't fit beside Install (it wrapped), put it on its own line
    // below the whole button row instead. Remembered per page + window width so
    // the placement can't flip back and forth.
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

    // ---- Button bar ---------------------------------------------------------
    let floatSince = 0; // when we first failed to find a slot for this page
    let lastPkg = null;

    function buildBar(pkg, title, key) {
        const bar = document.createElement("div");
        bar.id = "gpt-bar";
        bar.dataset.key = key;
        for (const l of LINKS.filter(isOn)) {
            const a = document.createElement("a");
            a.className = "gpt-btn";
            a.textContent = l.label;
            a.title = l.name;
            a.href = l.url({ pkg, title });
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.style.background = l.color;
            bar.append(a);
        }
        const gear = document.createElement("button");
        gear.id = "gpt-gear";
        gear.type = "button";
        gear.title = "Toolbox settings";
        gear.setAttribute("aria-label", "Toolbox settings");
        gear.textContent = "⚙";
        gear.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggleSettings(gear); });
        hoverClose(gear);
        bar.append(gear);
        return bar;
    }

    // Add (or move, or remove) the button bar. Safe to call repeatedly.
    function update() {
        const pkg = currentPkg();
        let bar = document.getElementById("gpt-bar");
        if (pkg !== lastPkg) { lastPkg = pkg; floatSince = 0; }
        if (!pkg) { if (bar) bar.remove(); return; }

        const title = getTitle() || pkg;
        const fitKey = [pkg, title, rev, window.innerWidth].join("|");
        let slot = findInstallSlot(pkg);
        if (slot && slot.mode === "inline" && tooNarrow.has(fitKey)) slot = belowRow(slot.node);
        const key = [pkg, title, rev, slot ? slot.mode : "float"].join("|");

        if (!slot) {
            // The page may still be rendering; give it a moment before floating.
            if (!floatSince) floatSince = Date.now();
            if (Date.now() - floatSince < 2000) {
                if (bar && bar.dataset.key !== key) bar.remove(); // don't leave the previous app's links up
                schedule(500);
                return;
            }
        } else floatSince = 0;

        if (bar && bar.dataset.key === key && bar.isConnected) {
            if (slot ? bar.previousElementSibling === slot.node : bar.parentElement === document.body) return;
        }

        if (bar) bar.remove();
        bar = buildBar(pkg, title, key);
        if (slot) { bar.classList.add("gpt-" + slot.mode); slot.node.after(bar); }
        else { bar.classList.add("gpt-float"); document.body.append(bar); }

        // Wrapped onto more than one line? Then it didn't fit; move it below.
        if (slot && slot.mode === "inline" && bar.offsetHeight > 48) { tooNarrow.add(fitKey); schedule(0); }
    }

    // ---- Settings panel -------------------------------------------------------
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
        const head = document.createElement("b");
        head.textContent = "Toolbox buttons";
        panel.append(head);
        for (const l of LINKS) {
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = isOn(l);
            box.addEventListener("change", () => { enabled = Object.assign({}, enabled, { [l.key]: box.checked }); save(enabled); rev++; update(); });
            label.append(box, l.name);
            panel.append(label);
        }
        hoverClose(panel);
        document.body.append(panel);
        placePanel(panel, anchor || document.getElementById("gpt-gear"));
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); }, true);
    document.addEventListener("click", e => {
        if (!e.target.closest || !e.target.closest("#gpt-settings, #gpt-gear")) closeSettings();
    }, true);
    window.addEventListener("scroll", closeSettings, { passive: true });
    if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand("Toolbox settings", () => toggleSettings());

    // ---- Main loop ----------------------------------------------------------
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
