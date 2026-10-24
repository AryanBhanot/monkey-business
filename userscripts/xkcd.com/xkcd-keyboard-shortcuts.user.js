// ==UserScript==
// @name        xkcd – Keyboard Shortcuts
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Keyboard navigation for xkcd.com: arrows or A/D, first/latest, random, alt text, info panel and Explain xkcd (also as a button next to Random).
// @author      AryanBhanot
// @icon        https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/icons/keyboard-shortcuts.png
// @match       https://xkcd.com/*
// @match       https://www.xkcd.com/*
// @version     1.1.0
// @license     MIT
// @homepageURL https://github.com/AryanBhanot/monkey-business
// @supportURL  https://github.com/AryanBhanot/monkey-business/issues
// @updateURL   https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/xkcd-keyboard-shortcuts.user.js
// @downloadURL https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/xkcd-keyboard-shortcuts.user.js
// @run-at      document-end
// @noframes
// @grant       none
// ==/UserScript==

(function () {
    "use strict";

    // Only comic pages ("/" and "/1234/"). Archive, About, JSON feeds etc. are left alone.
    if (!/^\/(\d+\/?)?$/.test(location.pathname)) return;

    // ---- Helpers --------------------------------------------------------
    const q = (s) => document.querySelector(s);
    const navLink = (label) =>
        [...document.querySelectorAll("ul.comicNav a")].find((a) => a.textContent.trim() === label);

    function comicNumber() {
        const m = location.pathname.match(/^\/(\d+)/);
        if (m) return +m[1];
        const prev = q("a[rel=prev]");
        const p = prev && (prev.getAttribute("href") || "").match(/(\d+)/);
        return p ? +p[1] + 1 : null;
    }

    // Navigation works by clicking xkcd's own nav links. If the "xkcd – Instant Navigation"
    // script is installed it picks those clicks up and swaps the page in place; otherwise
    // the click is an ordinary page load. This script never needs to know which.
    function follow(link) {
        if (!link) return false;
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return false;   // "#" = no previous/next comic
        link.click();
        return true;
    }

    // ---- Overlays -------------------------------------------------------
    const style = document.createElement("style");
    style.textContent = `
#xkp-alt, #xkp-info, #xkp-help {
    position: fixed; z-index: 99999; box-sizing: border-box; border-radius: 6px;
    font: 14px/1.5 system-ui, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.35);
}
#xkp-alt {
    left: 50%; top: 50%; transform: translate(-50%, -50%);
    max-width: min(70vw, 760px); padding: 16px 24px; border-radius: 8px;
    font-size: 16px; line-height: 1.5; text-align: center; cursor: pointer;
    background: rgba(0,0,0,.9); color: #fff;
}
#xkp-info, #xkp-help {
    right: 14px; bottom: 14px; padding: 10px 14px; background: #fff; color: #222;
    border: 1px solid #888; font-size: 13px; text-align: left;
}
#xkp-info a { color: #1a5fb4 !important; word-break: break-all; }
#xkp-help { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; align-items: center; }
#xkp-help b {
    justify-self: start; min-width: 22px; padding: 0 7px; box-sizing: border-box; text-align: center;
    font: 600 12px/20px system-ui, sans-serif; color: #222; background: #f2f2f2;
    border: 1px solid #b5b5b5; border-bottom-width: 2px; border-radius: 4px; white-space: nowrap;
}
`;
    (document.head || document.documentElement).appendChild(style);

    const OVERLAY_IDS = ["xkp-alt", "xkp-info", "xkp-help"];

    function closeOverlays() {
        for (const id of OVERLAY_IDS) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }
    }

    function toggleOverlay(id, role, build) {
        const existing = document.getElementById(id);
        if (existing) { existing.remove(); return; }
        const el = document.createElement("div");
        el.id = id;
        el.setAttribute("role", role);
        build(el);
        document.body.append(el);
    }

    function toggleAltText() {
        const img = q("#comic img");
        if (!img || !img.title) return;
        toggleOverlay("xkp-alt", "status", (el) => {
            el.textContent = img.title;
            el.addEventListener("click", () => el.remove());   // click the panel to dismiss it
        });
    }

    function toggleInfo() {
        const n = comicNumber();
        const img = q("#comic img");
        toggleOverlay("xkp-info", "dialog", (el) => {
            el.setAttribute("aria-label", "Comic info");
            const title = q("#ctitle");
            const head = document.createElement("div");
            head.style.fontWeight = "600";
            head.textContent = (n ? "#" + n + " – " : "") + (title ? title.textContent : document.title);
            el.append(head);
            const addLink = (label, href) => {
                if (!/^https:\/\//.test(href)) return;
                const row = document.createElement("div");
                const a = document.createElement("a");
                a.href = href;
                a.textContent = label;
                a.target = "_blank";
                a.rel = "noopener";
                row.append(a);
                el.append(row);
            };
            if (n) addLink("Permalink: xkcd.com/" + n + "/", "https://xkcd.com/" + n + "/");
            if (img && img.currentSrc) addLink("Image file", img.currentSrc);
            if (n) addLink("Explain xkcd", "https://www.explainxkcd.com/wiki/index.php/" + n);
        });
    }

    const HELP_LINES = [
        ["← / →", "Previous / next comic"],
        ["A / D", "Previous / next comic (same as arrows)"],
        ["Home / End", "First / latest comic"],
        ["R", "Random comic"],
        ["T", "Show / hide alt text"],
        ["I", "Info: permalink, image file, Explain xkcd"],
        ["E", "Open Explain xkcd in a new tab"],
        ["H", "Show / hide this help"],
        ["Esc", "Close any open panel"],
    ];

    function toggleHelp() {
        toggleOverlay("xkp-help", "dialog", (el) => {
            el.setAttribute("aria-label", "Keyboard shortcuts");
            for (const [key, desc] of HELP_LINES) {
                const k = document.createElement("b");
                k.textContent = key;
                const d = document.createElement("span");
                d.textContent = desc;
                el.append(k, d);
            }
        });
    }

    // ---- Explain xkcd button --------------------------------------------
    // Adds an "Explain" button after Random in each nav bar. Instant Navigation replaces the
    // nav bars on every comic change, so this runs again after each swap.
    function addExplainButtons() {
        const n = comicNumber();
        if (!n) return;
        for (const rand of document.querySelectorAll('ul.comicNav a[href*="random"]')) {
            const li = rand.closest("li");
            if (!li || (li.nextElementSibling && li.nextElementSibling.classList.contains("xkp-explain"))) continue;
            const item = document.createElement("li");
            item.className = "xkp-explain";
            const a = document.createElement("a");
            a.href = "https://www.explainxkcd.com/wiki/index.php/" + n;
            a.textContent = "Explain";
            a.title = "Explain xkcd (E)";
            a.target = "_blank";
            a.rel = "noopener";
            item.append(a);
            li.after(item);
        }
    }
    addExplainButtons();

    // Close the panels and refresh the button whenever the comic changes (the Instant
    // Navigation script swaps the comic in place, so there is no page load to clear them).
    const mc = document.getElementById("middleContainer");
    if (mc) {
        new MutationObserver(() => {
            closeOverlays();
            addExplainButtons();
        }).observe(mc, { childList: true });
    }

    // ---- Keyboard -------------------------------------------------------
    // Letters are matched by the character typed, and by physical key position on layouts
    // that cannot type Latin letters (Russian, Greek, ...).
    function keyName(e) {
        if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
        const m = /^Key([A-Z])$/.exec(e.code || "");
        return m ? m[1].toLowerCase() : e.key;
    }

    window.addEventListener("keydown", function (e) {
        if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (e.shiftKey) return;

        let link = null;
        switch (keyName(e)) {
            case "ArrowLeft":
            case "a":
                link = q("a[rel=prev]") || q("li.nav-prev a");
                break;
            case "ArrowRight":
            case "d":
                link = q("a[rel=next]") || q("li.nav-next a");
                break;
            case "Home":
                link = navLink("|<");
                break;
            case "End":
                link = navLink(">|");
                break;
            case "r":
                link = q('ul.comicNav a[href*="random"]');
                break;
            case "t":
                e.preventDefault();
                toggleAltText();
                return;
            case "i":
                e.preventDefault();
                toggleInfo();
                return;
            case "e": {
                const n = comicNumber();
                if (n) {
                    e.preventDefault();
                    window.open("https://www.explainxkcd.com/wiki/index.php/" + n, "_blank", "noopener");
                }
                return;
            }
            case "h":
                e.preventDefault();
                toggleHelp();
                return;
            case "Escape":
                closeOverlays();
                return;
            default:
                return;
        }
        if (follow(link)) e.preventDefault();
    });
})();
