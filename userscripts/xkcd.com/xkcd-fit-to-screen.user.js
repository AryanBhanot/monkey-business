// ==UserScript==
// @name        xkcd – Fit to Screen
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Compact layout for xkcd.com: slim header, and the comic scaled to fill the window. Press C to toggle.
// @author      AryanBhanot
// @icon        https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/icons/fit-to-screen.png
// @match       https://xkcd.com/*
// @match       https://www.xkcd.com/*
// @version     1.0.0
// @license     MIT
// @homepageURL https://github.com/AryanBhanot/monkey-business
// @supportURL  https://github.com/AryanBhanot/monkey-business/issues
// @updateURL   https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/xkcd-fit-to-screen.user.js
// @downloadURL https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/xkcd-fit-to-screen.user.js
// @run-at      document-start
// @noframes
// @grant       none
// ==/UserScript==

(function () {
    "use strict";

    // ---- Settings -------------------------------------------------------
    const UPSCALE = true;       // enlarge small comics to fill the window
    const MAX_SCALE = 2.5;      // never enlarge a comic beyond this multiple of its natural size
    const TALL_THRESHOLD = 0.6; // if fitting would shrink a comic below this scale, scroll it instead

    // Only comic pages ("/" and "/1234/"). Archive, About, JSON feeds etc. are left alone.
    if (!/^\/(\d+\/?)?$/.test(location.pathname)) return;

    const root = document.documentElement;
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage unavailable */ } },
    };
    const compactOn = () => store.get("xkp-compact") !== "off";

    // ---- Compact layout (CSS) -------------------------------------------
    const CSS = `
html.xkp, html.xkp body { height: 100%; overflow: hidden; }
html.xkp body {
    position: static !important; left: auto !important; width: auto !important;
    margin: 0 !important; box-sizing: border-box; display: flex; flex-direction: column;
}

/* Header: one slim bar with a small logo and the site links */
html.xkp #topContainer {
    position: static !important; display: flex !important; align-items: center; gap: 14px;
    width: auto !important; height: auto !important; margin: 0 !important; padding: 4px 12px !important;
    flex: none;
}
html.xkp #bgLeft, html.xkp #bgRight, html.xkp #news, html.xkp #slogan { display: none !important; }
html.xkp #topLeft, html.xkp #topRight, html.xkp #masthead {
    position: static !important; float: none !important; width: auto !important; height: auto !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important; background: none !important;
}
html.xkp #topRight { order: 0; }
html.xkp #topLeft { order: 1; }
html.xkp #masthead img { height: 30px !important; width: auto !important; display: block; }
html.xkp #topLeft ul { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 0; padding: 0; list-style: none; }
html.xkp #topLeft li { display: inline !important; margin: 0 !important; padding: 0 !important; font-size: 12px; line-height: 1.4; }

/* Comic panel: fills all the remaining height */
html.xkp #middleContainer {
    position: static !important; left: auto !important; right: auto !important;
    flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;
    width: auto !important; margin: 4px 10px 8px !important; padding: 4px 8px !important; box-sizing: border-box;
    /* Zero out loose text (the "Permanent link to this comic" caption); children set their own sizes. */
    font-size: 0 !important;
}
html.xkp #ctitle { flex: none; font-size: 16px !important; margin: 2px 0 !important; }
html.xkp ul.comicNav { flex: none; margin: 2px 0 4px !important; padding: 0 !important; font-size: 12px; }
html.xkp ul.comicNav a { padding: 2px 10px !important; }
html.xkp #comic ~ ul.comicNav { display: none !important; }
html.xkp #middleContainer > br, html.xkp #middleContainer > a { display: none !important; }
html.xkp #bottom { display: none !important; }
html.xkp #comic {
    position: relative !important; flex: 1 1 0; min-height: 0; display: block;
    width: auto !important; margin: 0 !important; padding: 0 !important;
}
html.xkp #comic img {
    position: absolute; inset: 0; margin: auto; object-fit: contain;
    width: auto; height: auto; max-width: 100%; max-height: 100%;
}
html.xkp.xkp-up #comic img { width: 100%; height: 100%; }
/* Very tall comics stay readable and scroll inside the panel instead of shrinking to a sliver */
html.xkp.xkp-scroll #comic { overflow-y: auto; }
html.xkp.xkp-scroll #comic img {
    position: static; display: block; margin: 0 auto; width: auto; height: auto;
    max-width: 100%; max-height: none;
}
`;
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);

    // Switch the layout on straight away, before the page body exists, to avoid a flash of the
    // stock layout. refresh() corrects this once the page is parsed (interactive comics opt out).
    root.classList.toggle("xkp", compactOn());
    root.classList.toggle("xkp-up", UPSCALE);

    // ---- Sizing ---------------------------------------------------------
    // Cap enlargement of small comics, scroll very tall ones, and leave interactive
    // (multi-image / no-image) comics on xkcd's stock layout.
    let currentImg = null;

    function fit() {
        const img = currentImg;
        const comic = document.getElementById("comic");
        if (!img || !comic || !img.naturalWidth) return;
        if (!root.classList.contains("xkp")) {
            root.classList.remove("xkp-scroll");
            img.style.maxWidth = "";
            img.style.maxHeight = "";
            return;
        }
        const box = comic.getBoundingClientRect();
        const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
        const scroll = scale < TALL_THRESHOLD;
        root.classList.toggle("xkp-scroll", scroll);
        img.style.maxWidth = scroll ? "" : "min(100%, " + Math.round(img.naturalWidth * MAX_SCALE) + "px)";
        img.style.maxHeight = scroll ? "" : "min(100%, " + Math.round(img.naturalHeight * MAX_SCALE) + "px)";
    }

    // Re-fits whenever the comic panel changes size: window resize, browser zoom, header reflow.
    const resizeObserver = new ResizeObserver(fit);

    function refresh() {
        root.classList.toggle("xkp-up", UPSCALE);
        const comic = document.getElementById("comic");
        const imgs = comic ? comic.querySelectorAll("img") : [];
        const img = imgs.length === 1 ? imgs[0] : null;
        currentImg = img;
        root.classList.toggle("xkp", !!img && compactOn());
        resizeObserver.disconnect();
        if (!img) {
            root.classList.remove("xkp-scroll");
            return;
        }
        resizeObserver.observe(comic, { box: "border-box" });
        if (img.complete) fit(); else img.addEventListener("load", fit, { once: true });
    }

    function init() {
        // The comic is replaced wholesale when "xkcd – Instant Navigation" swaps pages in place,
        // so watch for that and re-attach to the new image.
        const mc = document.getElementById("middleContainer");
        if (mc) new MutationObserver(refresh).observe(mc, { childList: true });
        refresh();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    // ---- Keyboard: C toggles the compact layout -------------------------
    window.addEventListener("keydown", function (e) {
        if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        // Match the typed letter, or the physical key on layouts that cannot type Latin letters.
        const isC = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() === "c" : e.code === "KeyC";
        if (!isC) return;
        e.preventDefault();
        store.set("xkp-compact", compactOn() ? "off" : "on");
        refresh();
    });
})();
