// ==UserScript==
// @name        Google Play – Toolbox
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Adds link buttons (APKMirror, Android Police, AppBrain, Beta, Exodus Privacy) next to the Install button on the Google Play Store website.
// @author      AryanBhanot
// @match       https://play.google.com/store/*
// @version     0.3.0
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

    // One entry per button (short label, full name for the tooltip). `url` gets { pkg, title }. Nothing is sent anywhere
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
#gpt-bar { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 8px; }
#gpt-bar.gpt-float { position: fixed; right: 60px; bottom: 16px; z-index: 2147483000; margin: 0; padding: 8px;
    background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.3); }
.gpt-btn { display: inline-flex; align-items: center; height: 36px; padding: 0 10px; border-radius: 8px; color: #fff !important;
    font: 500 14px/1 "Google Sans", Roboto, Arial, sans-serif; text-decoration: none !important; white-space: nowrap; }
.gpt-btn:hover { filter: brightness(1.12); }
#gpt-gear { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%;
    background: #26a69a; color: #fff; font-size: 20px; line-height: 36px; cursor: pointer; opacity: .55; box-shadow: 0 1px 6px rgba(0,0,0,.35); }
#gpt-gear:hover { opacity: 1; }
#gpt-settings { position: fixed; right: 16px; bottom: 60px; z-index: 2147483001; width: 260px; padding: 14px 16px; background: #fff; color: #202124;
    border-radius: 12px; box-shadow: 0 2px 14px rgba(0,0,0,.35); font: 14px/1.4 Roboto, Arial, sans-serif; }
#gpt-settings b { display: block; margin-bottom: 8px; font-size: 15px; }
#gpt-settings label { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
`;
    document.head.append(style);

    // Package name of the app on the current page, or null on other pages.
    function currentPkg() {
        if (!/^\/store\/apps\/details\/?$/.test(location.pathname)) return null;
        return new URLSearchParams(location.search).get("id");
    }

    function getTitle() {
        const h1 = document.querySelector("h1");
        return h1 ? h1.textContent.trim() : "";
    }

    // Find Google's Install button, then climb to the wrapper that sits in the
    // same row as Share / wishlist. The bar goes right after that wrapper.
    // Returns null if the layout isn't recognised.
    function findInstallSlot(pkg) {
        // Google wraps the Install button in a container with data-is-free and
        // data-item-id; that is language-independent and ignores the header.
        let node = [...document.querySelectorAll("[data-is-free]")]
            .find(b => (b.getAttribute("data-item-id") || "").includes(pkg));
        // The Install row is a horizontal flex container holding Install and Share
        // (plus wishlist when logged out), clearly wider than the Install wrapper.
        // Stop at the child of that row.
        for (let i = 0; node && node.parentElement && i < 12; i++, node = node.parentElement) {
            const p = node.parentElement, cs = getComputedStyle(p);
            if (p.children.length >= 2 && cs.display === "flex" && cs.flexDirection === "row" && p.offsetWidth > node.offsetWidth + 100) return node;
        }
        return null;
    }

    // Add (or move, or remove) the button bar. Safe to call repeatedly.
    function update() {
        const pkg = currentPkg();
        let bar = document.getElementById("gpt-bar");
        if (!pkg) { if (bar) bar.remove(); return; }

        const title = getTitle() || pkg;
        const slot = findInstallSlot(pkg);

        const key = [pkg, title, rev].join("|");
        if (bar && bar.dataset.key === key) {
            const ok = slot ? bar.previousElementSibling === slot : bar.classList.contains("gpt-float") && bar.isConnected;
            if (ok) return;
        }

        if (bar) bar.remove();
        bar = document.createElement("div");
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
        if (!bar.children.length) return; // everything switched off
        if (slot) slot.after(bar);
        else { bar.classList.add("gpt-float"); document.body.append(bar); }
    }

    // ---- Settings panel -----------------------------------------------------
    function closeSettings() { const p = document.getElementById("gpt-settings"); if (p) p.remove(); }
    function toggleSettings() {
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
        document.body.append(panel);
    }
    function ensureGear() {
        if (document.getElementById("gpt-gear")) return;
        const g = document.createElement("button");
        g.id = "gpt-gear";
        g.type = "button";
        g.title = "Toolbox settings";
        g.textContent = "⚙";
        g.addEventListener("click", toggleSettings);
        document.body.append(g);
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); }, true);
    if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand("Toolbox settings", toggleSettings);

    // Play swaps pages without reloading, so re-check whenever the page changes.
    new MutationObserver(() => { update(); ensureGear(); }).observe(document.documentElement, { childList: true, subtree: true });
    update();
    ensureGear();
})();
