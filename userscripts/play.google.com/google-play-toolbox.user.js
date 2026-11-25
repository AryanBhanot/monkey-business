// ==UserScript==
// @name        Google Play – Toolbox
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Adds link buttons (APKMirror, Android Police, AppBrain, Beta, Exodus Privacy) next to the Install button on the Google Play Store website.
// @author      AryanBhanot
// @match       https://play.google.com/store/*
// @version     0.2.0
// @license     MIT
// @homepageURL https://github.com/AryanBhanot/monkey-business
// @supportURL  https://github.com/AryanBhanot/monkey-business/issues
// @updateURL   https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/google-play-toolbox.user.js
// @downloadURL https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/google-play-toolbox.user.js
// @run-at      document-idle
// @noframes
// @grant       none
// ==/UserScript==

(function () {
    "use strict";

    const enc = encodeURIComponent;

    // One entry per button (short label, full name for the tooltip). `url` gets { pkg, title }. Nothing is sent anywhere
    // until you click a button.
    const LINKS = [
        { label: "APKM", name: "APKMirror", color: "#ff8b14", url: c => `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${enc(c.pkg)}` },
        { label: "AP", name: "Android Police", color: "#111111", url: c => `https://www.androidpolice.com/?s=${enc(c.title)}` },
        { label: "AB", name: "AppBrain", color: "#3f51b5", url: c => `https://www.appbrain.com/app/${enc(c.pkg)}` },
        { label: "Beta", name: "Beta testing page (join or leave)", color: "#8e24aa", url: c => `https://play.google.com/apps/testing/${enc(c.pkg)}` },
        { label: "Exodus", name: "Exodus Privacy report", color: "#1565c0", url: c => `https://reports.exodus-privacy.eu.org/en/search/${enc(c.pkg)}/` },
    ];

    const style = document.createElement("style");
    style.textContent = `
#gpt-bar { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 8px; }
#gpt-bar.gpt-float { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; margin: 0; padding: 8px;
    background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.3); }
.gpt-btn { display: inline-flex; align-items: center; height: 36px; padding: 0 10px; border-radius: 8px; color: #fff !important;
    font: 500 14px/1 "Google Sans", Roboto, Arial, sans-serif; text-decoration: none !important; white-space: nowrap; }
.gpt-btn:hover { filter: brightness(1.12); }
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
        // The row holding Install, Share and the wishlist button is a flex
        // container with 3+ children; stop at the child of that row.
        for (let i = 0; node && node.parentElement && i < 12; i++, node = node.parentElement) {
            const p = node.parentElement;
            if (p.children.length >= 3 && getComputedStyle(p).display === "flex") return node;
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

        if (bar && bar.dataset.key === pkg + "|" + title) {
            const ok = slot ? bar.previousElementSibling === slot : bar.classList.contains("gpt-float") && bar.isConnected;
            if (ok) return;
        }

        if (bar) bar.remove();
        bar = document.createElement("div");
        bar.id = "gpt-bar";
        bar.dataset.key = pkg + "|" + title;
        for (const l of LINKS) {
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
        if (slot) slot.after(bar);
        else { bar.classList.add("gpt-float"); document.body.append(bar); }
    }

    // Play swaps pages without reloading, so re-check whenever the page changes.
    new MutationObserver(update).observe(document.documentElement, { childList: true, subtree: true });
    update();
})();
