// ==UserScript==
// @name        Play Store Tweaks
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Extra links, shortcuts and fixes for the Google Play Store
// @author      AryanBhanot
// @icon        https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/icons/play-store-tweaks.png?v=0.10.0
// @match       https://play.google.com/store/*
// @version     0.16.2
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
    // Default order; the user can drag them into any order in settings, together with
    // Google's own Install, Share and Wishlist buttons (`google`) and any number of line breaks.
    const LINKS = [
        { key: "install", name: "Install", color: "#01875f", google: true, fixed: true, first: true }, // can be moved, never hidden
        { key: "lang", name: "Language & region", color: "#00796b", lang: true }, // opens a menu, not a link
        { key: "beta", label: "Beta", name: "Beta testing page", color: "#8e24aa", url: c => `https://play.google.com/apps/testing/${enc(c.pkg)}` },
        { key: "copy", name: "Copy app info", color: "#455a64", copy: true },
        { key: "share", name: "Share", color: "#5f6368", google: true },
        { key: "wishlist", name: "Wishlist", color: "#5f6368", google: true },
        { key: "apkmirror", label: "APKM", name: "APKMirror", color: "#ff8b14", same: true, url: c => `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${enc(c.pkg)}` },
        { key: "androidpolice", label: "AP", name: "Android Police", color: "#e01a4f", same: true, url: c => `https://www.androidpolice.com/?s=${enc(c.title)}` }, // their logo red
        { key: "appbrain", label: "AB", name: "AppBrain", color: "#3f51b5", same: true, url: c => `https://www.appbrain.com/app/${enc(c.pkg)}` },
        { key: "exodus", label: "Exodus", name: "Exodus Privacy report", color: "#1565c0", url: c => `https://reports.exodus-privacy.eu.org/en/search/${enc(c.pkg)}/` },
    ];
    // Default layout: one row with the main buttons (Share and Wishlist stay Google's), a line
    // break, then the lookup sites.
    const DEFAULT_ORDER = ["install", "lang", "beta", "copy", "share", "wishlist", "br1", "apkmirror", "androidpolice", "appbrain", "exodus"];
    // Line breaks live in the saved order as "br1", "br2", ...
    const isBreakKey = k => /^br\d+$/.test(k);
    const breakItem = key => ({ key, br: true, name: "Line break" });

    // What "Copy" puts on the clipboard: the ticked fields, in the user's order, written
    // out in the chosen format. `key` is the short tag shown on the button.
    const FIELDS = [
        { key: "name", name: "Name" },
        { key: "dev", name: "Developer" },
        { key: "pkg", name: "ID" },
        { key: "url", name: "Link" },
    ];
    const escHtml = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    // `parts` is [{ key, v }] in order. In the link formats, when both the name and the link
    // are wanted the name becomes the link text (at the name's place) instead of repeating it.
    function inline(parts, i, w) {
        if (parts.length === 1 && parts[0].key !== "url") return parts[0].v; // just the ID (or name): copy it bare
        const merge = parts.some(p => p.key === "name") && parts.some(p => p.key === "url");
        return parts.filter(p => !(merge && p.key === "url"))
            .map((p, n) => p.key === "name" ? (merge ? w.link(p.v, i.url) : w.esc(p.v))
                : p.key === "url" ? w.link(p.v, p.v, true)
                : p.key === "dev" ? (n ? "by " : "") + w.esc(p.v)
                : n ? `(${w.code(p.v)})` : w.code(p.v))
            .join(" ");
    }
    const FORMATS = [
        { key: "md", name: "Markdown", text: (p, i) => inline(p, i, { esc: s => s.replace(/[[\]*_`\\]/g, "\\$&"), code: s => `\`${s}\``, link: (t, u, bare) => (bare ? u : `[${t.replace(/[[\]\\]/g, "\\$&")}](${u})`) }) },
        { key: "txt", name: "Plain text", text: p => p.map(x => x.v).join("\n") },
        { key: "bb", name: "BBCode", text: (p, i) => inline(p, i, { esc: s => s, code: s => s, link: (t, u, bare) => (bare ? `[url]${u}[/url]` : `[url=${u}]${t}[/url]`) }) },
        { key: "html", name: "HTML", text: (p, i) => inline(p, i, { esc: escHtml, code: escHtml, link: (t, u) => `<a href="${escHtml(u)}">${escHtml(t)}</a>` }) },
        { key: "json", name: "JSON", text: p => JSON.stringify(Object.fromEntries(p.map(x => [{ name: "name", dev: "developer", pkg: "id", url: "url" }[x.key], x.v])), null, 2) },
        { key: "post", name: "Forum post (BBCode)", text: (p, i) => forumPost(i) },
    ];
    // A ready-to-post BBCode block: icon, name and developer, category, rating, price, age
    // rating, the short description and the ID. All of it comes from the data Play puts in the
    // app page for search engines; on search results only the name, developer and link are known.
    function forumPost(i) {
        const j = i.ld || {}, r = j.aggregateRating, o = Array.isArray(j.offers) ? j.offers[0] : j.offers;
        const dev = i.dev || (j.author && j.author.name) || "";
        const out = [];
        if (j.image) out.push(`[img]${j.image}=s128[/img]`);
        out.push(`[b][url=${i.url}]${i.name}[/url][/b]` + (dev ? ` by ${dev}` : ""));
        const facts = [];
        if (j.applicationCategory) facts.push(j.applicationCategory.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()));
        if (r && +r.ratingValue) facts.push(`${(+r.ratingValue).toFixed(1)}★` + (+r.ratingCount ? ` (${(+r.ratingCount).toLocaleString("en")} ratings)` : ""));
        if (o && o.price !== undefined) facts.push(+o.price ? `${o.price} ${o.priceCurrency || ""}`.trim() : "Free");
        if (j.contentRating) facts.push(j.contentRating);
        if (facts.length) out.push(facts.join(" · "));
        if (j.description) out.push(`[quote]${j.description.trim()}[/quote]`);
        out.push(`ID: [code]${i.pkg}[/code]`);
        return out.join("\n");
    }
    // Play's search-engine data for this app page (only when it is really about this app:
    // after in-app navigation the old page's data can still be there).
    function appData(pkg) {
        if (detailsPkg() !== pkg) return null;
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const j = JSON.parse(s.textContent);
                if (j && j["@type"] === "SoftwareApplication" && new URL(j.url).searchParams.get("id") === pkg) return j;
            } catch (_) { /* not ours */ }
        }
        return null;
    }
    // Names used before: 0.8 renamed these; 0.10 replaced "link only" / "package only" with the field filter.
    const OLD_FORMATS = { markdown: "md", bbcode: "bb", plain: "txt", url: "txt", id: "txt" };

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
    // Until 0.10 Copy came before Beta by default. If that old default was never changed,
    // forget it so the new default applies.
    if (Array.isArray(enabled.order) && enabled.order.join() === "copy,beta,apkmirror,androidpolice,appbrain,exodus") {
        enabled = Object.assign({}, enabled);
        delete enabled.order;
        save(enabled);
    }
    // 0.13 had a single "br" entry with an on/off tick; it becomes a real line break (or goes).
    if (Array.isArray(enabled.order) && enabled.order.includes("br")) {
        const on = enabled.br === true;
        enabled = Object.assign({}, enabled, { order: enabled.order.flatMap(k => (k === "br" ? (on ? ["br1"] : []) : [k])) });
        delete enabled.br;
        save(enabled);
    }
    const setOpts = o => { enabled = Object.assign({}, enabled, o); save(enabled); };
    const isOn = l => l.fixed || enabled[l.key] !== false; // everything is on by default
    let rev = 0; // bumped on every settings change so the bars are rebuilt
    // `all` in the order saved under `orderKey` (anything never ordered goes last, in default order).
    function sortBy(all, orderKey) {
        const saved = Array.isArray(enabled[orderKey]) ? enabled[orderKey] : [];
        // Never-ordered items go last in default order, except ones marked `first` (Install, which was always first).
        const pos = x => { const i = saved.indexOf(x.key); return i >= 0 ? i : x.first ? -1 : 1000 + all.indexOf(x); };
        return all.slice().sort((a, b) => pos(a) - pos(b));
    }
    const offIn = offKey => x => !(Array.isArray(enabled[offKey]) && enabled[offKey].includes(x.key));
    // Buttons and line breaks in the saved order. Anything never ordered goes last in default
    // order, except Install (`first`), which was always first.
    function ordered() {
        const saved = Array.isArray(enabled.order) ? enabled.order : DEFAULT_ORDER;
        const out = [], seen = new Set();
        for (const k of saved) {
            if (seen.has(k)) continue;
            const l = isBreakKey(k) ? breakItem(k) : LINKS.find(x => x.key === k);
            if (l) { out.push(l); seen.add(k); }
        }
        for (const l of LINKS) if (!seen.has(l.key)) { if (l.first) out.unshift(l); else out.push(l); }
        return out;
    }
    const setOrder = keys => { enabled = Object.assign({}, enabled, { order: keys }); save(enabled); rev++; update(); };
    // Formats in the user's order, and the ones left ticked (the ones scrolling over Copy cycles through).
    const fmtOrdered = () => sortBy(FORMATS, "fmtOrder");
    const fmtOn = offIn("fmtOff");
    function fmtActive() {
        const on = fmtOrdered().filter(fmtOn);
        return on.length ? on : fmtOrdered(); // never end up with nothing to copy
    }
    // Fields (name, developer, ...) in the user's order, and whether each is copied.
    const fieldsOrdered = () => sortBy(FIELDS, "fieldOrder");
    const fieldOn = offIn("fieldOff");
    function curFormat() {
        const k = OLD_FORMATS[enabled.copyFormat] || enabled.copyFormat;
        const act = fmtActive();
        return act.find(f => f.key === k) || act[0];
    }
    function setFormat(k) {
        enabled = Object.assign({}, enabled, { copyFormat: k });
        save(enabled);
        refreshFormats();
    }
    function refreshFormats() {
        for (const b of document.querySelectorAll(".gpt-copy")) labelCopy(b);
        const menu = document.getElementById("gpt-formats");
        if (menu) for (const r of menu.querySelectorAll(".gpt-row")) r.classList.toggle("gpt-current", r.dataset.key === curFormat().key);
    }

    // ---- Styles -------------------------------------------------------------
    // Sizes (height, radius, font) are copied from Google's own Install button
    // at build time through the --gpt-* variables, so the bar always matches it.
    const style = document.createElement("style");
    style.textContent = `
.gpt-bar { --gpt-h: 36px; --gpt-r: 8px; --gpt-fs: 14px; --gpt-ls: .15px;
    --gpt-accent: #01875f; --gpt-outline: #747775; --gpt-hover: rgba(1,135,95,.08);
    position: relative; z-index: 3; /* above the hero-banner overlay on apps with a trailer */
    display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
/* The slice: Google's own button row. Our bar dissolves into it (display: contents) and every
   item, Google's included, is placed with CSS order; a line break is a full-width empty item.
   Google's elements are never moved in the page. */
.gpt-slice { flex-wrap: wrap !important; align-items: center !important; column-gap: 0 !important; row-gap: 8px !important; }
/* Spacing is a right margin on the items we know (a gap would also pad Google's invisible helpers) */
.gpt-slice .gpt-other { margin: 0 !important; }
.gpt-slice .gpt-item { margin: 0 8px 0 0 !important; }
.gpt-bar.gpt-inline > * { margin: 0 8px 0 0; }
.gpt-bar.gpt-inline > .gpt-break { margin: 0; }
.gpt-contents { display: contents !important; }
.gpt-hidden { display: none !important; }
.gpt-bar.gpt-inline { display: contents; }
.gpt-bar.gpt-inline > * { position: relative; z-index: 3; }
.gpt-break { flex: 0 0 100%; height: 0; }
/* Phones (Install full width) and the corner fallback: our buttons only, line by line */
.gpt-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.gpt-bar.gpt-stack { align-items: center; margin: 12px 0; }
.gpt-bar.gpt-stack .gpt-line { justify-content: center; gap: 6px; }
.gpt-bar.gpt-stack .gpt-btn { padding: 0 10px; } /* phones: tighter */
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
/* Like Google's Install button: it DARKENS and gains a small shadow. The strength matches
   the darkest Install hover Play uses (#01875f -> about #095943, i.e. #202124 at ~45%). */
.gpt-btn:hover, .gpt-btn:focus-visible { box-shadow: inset 0 0 0 999px rgba(32,33,36,.42), 0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15); }
.gpt-btn:active { box-shadow: inset 0 0 0 999px rgba(32,33,36,.52); }
.gpt-gear { width: var(--gpt-h); min-width: 0; min-height: 0; padding: 0; margin: 0; background: transparent; border: 1px solid var(--gpt-outline); color: var(--gpt-accent); }
.gpt-gear:hover { background: var(--gpt-hover); }
.gpt-gear:active { background: rgba(1,135,95,.16); }
.gpt-btn:focus-visible, .gpt-gear:focus-visible { outline: 2px solid var(--gpt-accent); outline-offset: 2px; }
.gpt-gear svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; }
/* Copy: [icon | format] */
.gpt-bar .gpt-btn.gpt-copy, .gpt-bar .gpt-btn.gpt-lang { gap: 6px; padding: 0 9px 0 10px; }
.gpt-copy svg, .gpt-lang svg { width: 18px; height: 18px; flex: none; fill: currentColor; pointer-events: none; }
.gpt-copy .gpt-sep, .gpt-lang .gpt-sep { width: 1px; height: 50%; background: rgba(255,255,255,.5); flex: none; pointer-events: none; }
/* No fixed width: the button is only as wide as the current tag (md is narrower than html) */
.gpt-copy .gpt-fmt, .gpt-lang .gpt-fmt { font-size: calc(var(--gpt-fs) - 2px); letter-spacing: .2px; pointer-events: none; }
/* A visible scrollbar on screenshot galleries (setting scrollbar-width overrides Play's ::-webkit-scrollbar { display: none }) */
html[data-gpt-gallery="on"] [data-gpt-scrollbar] { scrollbar-width: thin !important; scrollbar-color: rgba(95,99,104,.55) transparent; padding-bottom: 6px; }
html[data-gpt-gallery="on"][data-gpt-theme="dark"] [data-gpt-scrollbar] { scrollbar-color: rgba(189,193,198,.5) transparent; }
/* Language & region menu: two small wheels (language, country); the middle row is the choice */
#gpt-lang { width: 268px; }
#gpt-lang .gpt-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6px; padding: 0 12px 4px; }
#gpt-lang .gpt-col { min-width: 0; }
#gpt-lang .gpt-col .gpt-sub { padding-left: 4px; }
.gpt-wheel { position: relative; height: 130px; overflow: hidden; outline: none; cursor: default; user-select: none; touch-action: none;
    -webkit-mask-image: linear-gradient(transparent, #000 32%, #000 68%, transparent); mask-image: linear-gradient(transparent, #000 32%, #000 68%, transparent); }
.gpt-wheel::before { content: ""; position: absolute; left: 0; right: 0; top: 52px; height: 26px; border-radius: 6px; background: rgba(1,135,95,.12); pointer-events: none; }
.gpt-wheel:focus-visible::before { box-shadow: inset 0 0 0 2px var(--gpt-accent); }
.gpt-wheel-in { position: absolute; left: 0; right: 0; top: 0; transition: transform .14s ease-out; }
.gpt-wi { height: 26px; line-height: 26px; padding: 0 8px; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.gpt-wi.gpt-sel { color: var(--gpt-accent); font-weight: 500; }
#gpt-lang .gpt-apply { display: block; box-sizing: border-box; min-width: 0; min-height: 0; margin: 4px 12px 8px auto; padding: 6px 18px; border: 0; border-radius: 16px; background: var(--gpt-accent); color: #fff;
    font: 500 13px/20px "Google Sans", Roboto, Arial, sans-serif; cursor: pointer; }
#gpt-lang .gpt-apply:hover { filter: brightness(.9); }
html[data-gpt-theme="dark"] #gpt-lang .gpt-apply { color: #202124; }
html[data-gpt-theme="dark"] .gpt-wheel::before { background: rgba(129,201,149,.16); }
@media (prefers-reduced-motion: reduce) { .gpt-wheel-in { transition: none; } }
/* Settings rows: [checkbox dot name ........ drag handle] */
.gpt-panel { max-height: calc(100vh - 16px); overflow-y: auto; overscroll-behavior: contain; }
.gpt-panel .gpt-tag { margin-left: auto; color: var(--gpt-sub); font: 12px/16px ui-monospace, Consolas, monospace; }
.gpt-panel .gpt-list { position: relative; }
.gpt-panel .gpt-row { display: flex; align-items: center; }
.gpt-panel .gpt-row label { flex: 1; padding-right: 4px; }
.gpt-panel .gpt-row label:hover { background: none; }
.gpt-panel .gpt-row:hover { background: rgba(1,135,95,.08); }
.gpt-panel .gpt-handle { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin-right: 10px; border-radius: 6px;
    color: var(--gpt-sub); cursor: grab; touch-action: none; user-select: none; }
.gpt-panel .gpt-handle:hover, .gpt-panel .gpt-handle:focus-visible { background: rgba(60,64,67,.12); color: var(--gpt-fg); outline: none; }
.gpt-panel .gpt-handle svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; }
.gpt-panel .gpt-row { transition: box-shadow .15s; user-select: none; }
.gpt-panel .gpt-row.gpt-dragging { background: var(--gpt-bg); box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15); position: relative; z-index: 2; will-change: transform; }
.gpt-panel.gpt-busy, .gpt-panel.gpt-busy * { user-select: none; cursor: grabbing !important; }
/* copy-format menu rows: [checkbox  name .... tag  handle]; the one in use is highlighted */
.gpt-panel .gpt-fcheck { margin-left: 20px; flex: none; }
.gpt-panel .gpt-pick { flex: 1; display: flex; align-items: center; gap: 8px; padding: 7px 4px 7px 12px; cursor: pointer; outline: none; }
.gpt-panel .gpt-pick:focus-visible { background: rgba(1,135,95,.12); }
.gpt-panel .gpt-row.gpt-current { box-shadow: inset 3px 0 0 var(--gpt-accent); }
.gpt-panel .gpt-row.gpt-current .gpt-pick { color: var(--gpt-accent); font-weight: 500; }
.gpt-panel .gpt-hint { padding-top: 10px; }
/* Title row with a Reset button on the right */
.gpt-panel .gpt-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.gpt-panel .gpt-reset { box-sizing: border-box; min-width: 0; min-height: 0; margin: -4px -8px -4px 0; padding: 4px 8px; border: 0; border-radius: 6px; background: none; color: var(--gpt-accent);
    font: 500 13px/20px "Google Sans", Roboto, Arial, sans-serif; cursor: pointer; }
.gpt-panel .gpt-reset:hover, .gpt-panel .gpt-reset:focus-visible { background: rgba(1,135,95,.08); outline: none; }
/* What to copy: one line of small chips, ticked and dragged sideways (the whole chip is the handle) */
#gpt-formats { width: 320px; }
.gpt-panel .gpt-chips { position: relative; display: flex; gap: 5px; padding: 4px 16px 6px; }
.gpt-panel label.gpt-chip { gap: 4px; padding: 4px 8px 4px 6px; border: 1px solid var(--gpt-line2); border-radius: 8px; background: var(--gpt-bg);
    font-size: 13px; line-height: 18px; white-space: nowrap; cursor: grab; user-select: none; touch-action: none; transition: background-color .15s, border-color .15s; }
.gpt-panel label.gpt-chip input { width: 15px; height: 15px; }
.gpt-panel label.gpt-chip:hover { background: rgba(1,135,95,.08); }
.gpt-panel label.gpt-chip.gpt-on { border-color: var(--gpt-accent); }
.gpt-panel label.gpt-chip.gpt-dragging { position: relative; z-index: 2; cursor: grabbing; box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15); will-change: transform; }
html[data-gpt-theme="dark"] .gpt-panel .gpt-row:hover { background: rgba(129,201,149,.12); }
html[data-gpt-theme="dark"] .gpt-panel .gpt-handle:hover { background: rgba(255,255,255,.1); }
html[data-gpt-theme="dark"] .gpt-panel .gpt-row label:hover { background: none; }
.gpt-panel { --gpt-bg: #fff; --gpt-fg: #202124; --gpt-sub: #5f6368; --gpt-line: #e8eaed; --gpt-line2: #c4c7c5; --gpt-accent: #01875f;
    position: fixed; z-index: 2147483001; width: 280px; padding: 8px 0 10px; box-sizing: border-box; background: var(--gpt-bg); color: var(--gpt-fg);
    border-radius: 12px; box-shadow: 0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15);
    font: 14px/20px "Google Sans", Roboto, Arial, sans-serif; text-align: left; }
.gpt-panel .gpt-title { padding: 8px 20px 10px; font-size: 16px; font-weight: 500; border-bottom: 1px solid var(--gpt-line); }
.gpt-panel .gpt-sub { padding: 8px 20px 4px; color: var(--gpt-sub); font-size: 12px; }
.gpt-panel label { display: flex; align-items: center; gap: 12px; padding: 7px 20px; cursor: pointer; }
.gpt-panel label:hover { background: rgba(1,135,95,.08); }
.gpt-panel input { width: 18px; height: 18px; margin: 0; accent-color: var(--gpt-accent); cursor: pointer; }
.gpt-panel .gpt-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
/* Play styles every button (min-size 40px, content-box); undo that inside our menus */
.gpt-panel button { box-sizing: border-box; min-width: 0; min-height: 0; margin: 0; font: inherit; }
.gpt-panel .gpt-note { margin-left: auto; color: var(--gpt-sub); font-size: 12px; }
.gpt-panel input:disabled { opacity: .45; cursor: default; }
/* Line-break rows: a dashed rule with its name, a remove button and the handle */
.gpt-panel .gpt-brline { flex: 1; display: flex; align-items: center; gap: 10px; padding: 7px 4px 7px 20px; color: var(--gpt-sub); font-size: 12px; }
.gpt-panel .gpt-brline::before, .gpt-panel .gpt-brline::after { content: ""; flex: 1; border-top: 1px dashed var(--gpt-line2); }
.gpt-panel .gpt-x { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px;
    background: none; color: var(--gpt-sub); cursor: pointer; }
.gpt-panel .gpt-x:hover, .gpt-panel .gpt-x:focus-visible { background: rgba(60,64,67,.12); color: var(--gpt-fg); outline: none; }
.gpt-panel .gpt-x svg { width: 18px; height: 18px; fill: currentColor; pointer-events: none; }
.gpt-panel .gpt-add { display: block; margin: 4px 12px 0; padding: 4px 8px; border: 0; border-radius: 6px; background: none; color: var(--gpt-accent);
    font: 500 13px/20px "Google Sans", Roboto, Arial, sans-serif; cursor: pointer; }
.gpt-panel .gpt-add:hover, .gpt-panel .gpt-add:focus-visible { background: rgba(1,135,95,.08); outline: none; }
.gpt-panel .gpt-row.gpt-flash { animation: gpt-flash 1.4s ease-out; }
@keyframes gpt-flash { from { background: rgba(1,135,95,.25); } to { background: transparent; } }
html[data-gpt-theme="dark"] .gpt-panel .gpt-x:hover { background: rgba(255,255,255,.1); }
html[data-gpt-theme="dark"] .gpt-panel .gpt-add:hover { background: rgba(129,201,149,.12); }
html[data-gpt-theme="dark"] .gpt-bar { --gpt-accent: #81c995; --gpt-outline: #8e918f; --gpt-hover: rgba(129,201,149,.12); }
html[data-gpt-theme="dark"] .gpt-bar.gpt-float { background: #2d2f31; }
html[data-gpt-theme="dark"] .gpt-gear:active { background: rgba(129,201,149,.2); }
html[data-gpt-theme="dark"] .gpt-panel { --gpt-bg: #2d2f31; --gpt-fg: #e3e3e3; --gpt-sub: #c4c7c5; --gpt-line: #444746; --gpt-line2: #5f6368; --gpt-accent: #81c995; }
html[data-gpt-theme="dark"] .gpt-panel .gpt-reset:hover, html[data-gpt-theme="dark"] .gpt-panel label.gpt-chip:hover { background: rgba(129,201,149,.12); }
html[data-gpt-theme="dark"] .gpt-panel label:hover { background: rgba(129,201,149,.12); }
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
                    .filter(b => !b.closest(".gpt-bar, .gpt-panel") && visible(b) && isFilled(b))
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
            const p = node.parentElement;
            if (p.classList.contains("gpt-slice")) return { node, mode: "inline" }; // already ours (it may wrap now)
            const cs = getComputedStyle(p), pr = p.getBoundingClientRect();
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


    // ---- Button bar -----------------------------------------------------------------
    // Material icons
    const ICON_COPY = "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z";
    const ICON_LANG = "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 0 1 5.08 16zm2.95-8H5.08a7.987 7.987 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.1-.66-.16-1.32-.16-2 0-.68.06-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z";
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

    // One bar per app. Inline (next to Install in Google's button row), the bar dissolves into
    // that row and arrange() places every item with CSS order. Elsewhere (phones, where Install
    // is full width, or the corner fallback) it holds only our buttons, line by line.
    function buildBar(t, title, key, inline) {
        const bar = document.createElement("div");
        bar.className = "gpt-bar";
        bar.dataset.key = key;
        // Copy Google's own button metrics so ours match.
        const cs = getComputedStyle(t.btn), h = t.btn.getBoundingClientRect().height;
        if (h >= 24 && h <= 72) bar.style.setProperty("--gpt-h", Math.round(h) + "px");
        if (cs.borderRadius && !/%/.test(cs.borderRadius)) bar.style.setProperty("--gpt-r", cs.borderRadius.split(" ")[0]);
        if (parseFloat(cs.fontSize) > 0) bar.style.setProperty("--gpt-fs", cs.fontSize);
        if (cs.letterSpacing && cs.letterSpacing !== "normal") bar.style.setProperty("--gpt-ls", cs.letterSpacing);
        if (inline) {
            for (const l of ordered()) {
                if (l.br) { const b = document.createElement("div"); b.className = "gpt-break"; b.dataset.k = l.key; bar.append(b); }
                else if (!l.google && isOn(l)) bar.append(button(bar, l, t, title));
            }
            const gear = gearButton();
            gear.style.order = "99999"; // always last
            bar.append(gear);
        } else {
            // Our buttons only, split into lines at the breaks (empty lines dropped).
            const lines = [[]];
            for (const l of ordered()) {
                if (l.br) { if (lines[lines.length - 1].length) lines.push([]); }
                else if (!l.google && isOn(l)) lines[lines.length - 1].push(button(bar, l, t, title));
            }
            lines[lines.length - 1].push(gearButton());
            for (const x of lines) if (x.length) { const d = document.createElement("div"); d.className = "gpt-line"; d.append(...x); bar.append(d); }
        }
        return bar;
    }

    // Google's items in the button row `row`: Install (the wrapper `installNode`), Share (found
    // by its icon, so any language works), Wishlist (tied to the app's ID) and anything else.
    // A wrapper holding several of them (Share + Wishlist) is dissolved so each is its own item.
    const SHARE_ICON = 'path[d^="M18 16.08"]';
    function googleItems(row, installNode, bar, pkg) {
        const found = { install: installNode }, other = [];
        for (const c of row.children) {
            if (c === installNode || c === bar || c.classList.contains("gpt-bar")) continue;
            const groups = [...c.children].filter(x => x.querySelector("button"));
            if (!c.classList.contains("gpt-contents") && groups.length > 1) c.classList.add("gpt-contents");
            for (const p of c.classList.contains("gpt-contents") ? [...c.children] : [c]) {
                const kind = p.querySelector(SHARE_ICON) ? "share"
                    : p.querySelector("button") && (p.matches(`[data-p*='"${pkg}"']`) || p.querySelector(`[data-p*='"${pkg}"']`)) ? "wishlist" : null;
                if (kind && !found[kind]) found[kind] = p; else other.push(p);
            }
        }
        return { found, other };
    }

    // Put every item of the slice in the saved order. Line breaks that would make an empty
    // line (at the start or end, or twice in a row) are left out.
    function arrange(row, installNode, bar, pkg) {
        if (!row.classList.contains("gpt-slice")) row.classList.add("gpt-slice");
        const { found, other } = googleItems(row, installNode, bar, pkg);
        const ours = new Map([...bar.children].filter(e => e.dataset.k).map(e => [e.dataset.k, e]));
        const seq = [];
        for (const l of ordered()) {
            const el = l.google ? found[l.key] : ours.get(l.key);
            if (!el) continue;
            if (l.google) { const show = isOn(l); el.classList.toggle("gpt-hidden", !show); if (!show) continue; }
            seq.push({ l, el });
        }
        const kept = [];
        for (const s of seq) {
            const redundant = s.l.br && (!kept.length || kept[kept.length - 1].l.br);
            if (redundant) s.el.classList.add("gpt-hidden"); else kept.push(s);
        }
        while (kept.length && kept[kept.length - 1].l.br) kept.pop().el.classList.add("gpt-hidden");
        const setOrder = (el, n) => { if (el.style.order !== String(n)) el.style.order = String(n); };
        kept.forEach((s, i) => { if (s.l.br) s.el.classList.remove("gpt-hidden"); setOrder(s.el, i * 10); });
        for (const k of ["install", "share", "wishlist"]) if (found[k] && !found[k].classList.contains("gpt-item")) found[k].classList.add("gpt-item");
        const at = kept.findIndex(s => s.l.key === "install");
        // Unknown Google items stay next to Install. Their own margins were for Google's layout
        // (an empty helper there carries a 69px one), so they get ours, or none while empty.
        for (const el of other) {
            setOrder(el, Math.max(at, 0) * 10 + 5);
            if (!el.classList.contains("gpt-other")) el.classList.add("gpt-other");
            const r = el.getBoundingClientRect();
            el.classList.toggle("gpt-item", r.width > 0 && r.height > 0);
        }
        // Don't run under the big app icon that sits to the right of the header on wide pages.
        const rr = row.getBoundingClientRect(), right = row.parentElement.getBoundingClientRect().right; // the parent: our own max-width must not change the test
        let limit = 0;
        for (const img of document.querySelectorAll('img[src*="play-lh.googleusercontent.com"]')) {
            if (row.contains(img) || !visible(img)) continue;
            const b = img.getBoundingClientRect();
            if (b.width >= 96 && b.left > rr.left + 120 && b.left < right &&b.top < rr.bottom + 40 && b.bottom > rr.top - 40) limit = limit ? Math.min(limit, b.left) : b.left;
        }
        // APKM, AP and AB share one width: the widest of them (measured with the minimum cleared).
        const same = [...bar.querySelectorAll(".gpt-same")];
        for (const b of same) b.style.minWidth = "";
        const w = Math.ceil(Math.max(0, ...same.map(b => b.getBoundingClientRect().width)));
        if (w) for (const b of same) b.style.minWidth = w + "px";
        const mw = limit ? Math.floor(limit - rr.left - 24) + "px" : "";
        if (row.style.maxWidth !== mw) row.style.maxWidth = mw;
    }

    function gearButton() {
        const gear = document.createElement("button");
        gear.type = "button";
        gear.className = "gpt-gear";
        gear.title = "Play Store Tweaks settings";
        gear.setAttribute("aria-label", "Play Store Tweaks settings");
        gear.append(gearIcon());
        gear.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggleSettings(gear); });
        return gear;
    }

    function button(bar, l, t, title) {
        {
            const a = document.createElement(l.copy || l.lang ? "button" : "a");
            a.className = "gpt-btn";
            a._link = l;
            a.dataset.k = l.key;
            if (l.lang) {
                a.type = "button";
                a.classList.add("gpt-lang");
                const sep = document.createElement("span"), tag = document.createElement("span");
                sep.className = "gpt-sep";
                tag.className = "gpt-fmt";
                a.append(icon(ICON_LANG), sep, tag);
                labelLang(a);
                a.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (a._wasOpen) a._wasOpen = false; else toggleLang(a); });
                a.addEventListener("pointerdown", () => { a._wasOpen = !!document.getElementById("gpt-lang"); }, true);
                a.addEventListener("wheel", onLangWheel, { passive: false });
                a.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); toggleLang(a); });
            } else if (l.copy) {
                a.type = "button";
                a.classList.add("gpt-copy");
                const sep = document.createElement("span"), fmt = document.createElement("span");
                sep.className = "gpt-sep";
                fmt.className = "gpt-fmt";
                a.append(icon(ICON_COPY), sep, fmt);
                labelCopy(a);
                a.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); copyInfo(a, bar); });
                a.addEventListener("wheel", onCopyWheel, { passive: false });
                a.addEventListener("contextmenu", e => { e.preventDefault(); e.stopPropagation(); toggleFormats(a); });
            } else {
                a.textContent = l.label;
                a.title = l.name;
                a.href = l.url({ pkg: t.pkg, title });
                a.target = "_blank";
                a.rel = "noopener noreferrer";
            }
            a.style.backgroundColor = l.color;
            if (l.same) a.classList.add("gpt-same");
            return a;
        }
    }

    function labelCopy(btn) {
        const f = curFormat();
        btn.querySelector(".gpt-fmt").textContent = f.key;
        btn.title = `Copy app info as ${f.name}\nScroll or right-click to change format`;
        btn.setAttribute("aria-label", `Copy app info as ${f.name}`);
    }
    // Mouse wheel over Copy cycles through the formats. One step per
    // notch; the short cooldown stops a trackpad from spinning through them all.
    // Wheel input is summed up until it adds to a full notch (100), then one step, then a
    // cooldown, so a free-spinning wheel or trackpad moves one choice at a time.
    const wheelState = () => ({ step: 0, evt: 0, acc: 0 });
    const buttonWheel = wheelState();
    function wheelDir(e, st = buttonWheel, cooldown = 250) {
        const d = e.deltaY || e.deltaX; // some browsers turn Shift + wheel into a sideways scroll
        const now = Date.now();
        if (!d) return 0;
        if (now - st.evt > 300) st.acc = 0; // a pause forgets a half notch
        st.evt = now;
        if (now - st.step < cooldown) return 0;
        st.acc += e.deltaMode === 1 ? d * 40 : d; // lines -> pixels
        if (Math.abs(st.acc) < 100) return 0;
        const dir = st.acc > 0 ? 1 : -1;
        st.acc = 0; st.step = now;
        return dir;
    }
    function onCopyWheel(e) {
        e.preventDefault();
        const dir = wheelDir(e);
        if (!dir) return;
        const act = fmtActive(), i = act.indexOf(curFormat());
        setFormat(act[(i + dir + act.length) % act.length].key);
    }

    // Copy button: gathers the app's details when clicked (so it is never stale),
    // formats them and puts them on the clipboard.
    function copyInfo(btn, bar) {
        const pkg = bar.dataset.key.split("|")[0], title = bar.dataset.title || pkg;
        // The developer link only exists on the app's own page.
        const devEl = detailsPkg() ? [...document.querySelectorAll('a[href*="/store/apps/dev"]')].find(visible) : null;
        const dev = devEl ? devEl.textContent.trim() : "";
        const info = { name: title, dev, pkg, url: `https://play.google.com/store/apps/details?id=${enc(pkg)}`, ld: appData(pkg) };
        // Ticked fields in order, skipping empty ones (no developer on search results).
        let parts = fieldsOrdered().filter(fieldOn).map(f => ({ key: f.key, v: info[f.key] })).filter(p => p.v);
        if (!parts.length) parts = [{ key: "pkg", v: pkg }];
        const text = curFormat().text(parts, info);
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

    // Screenshot galleries scroll sideways but Play hides their scrollbar; show a thin one.
    function markGalleries() {
        const on = enabled.gallery === false ? "off" : "on";
        if (document.documentElement.dataset.gptGallery !== on) document.documentElement.dataset.gptGallery = on;
        if (on === "off") return;
        for (const img of document.querySelectorAll('img[role="button"][src*="play-lh.googleusercontent.com"]')) {
            const list = img.closest('[role="list"]');
            if (list && !list.hasAttribute("data-gpt-scrollbar")) list.setAttribute("data-gpt-scrollbar", "");
        }
    }

    // Add, update or remove the bars so there is exactly one per Install button on the
    // page. Safe to call repeatedly.
    function update() {
        syncTheme();
        unwrapRedirects();
        markGalleries();
        const page = location.pathname + location.search;
        if (page !== lastPage) { lastPage = page; floatSince = 0; }
        const existing = [...document.querySelectorAll(".gpt-bar")];
        const targets = installTargets();
        const keep = new Set();

        const jobs = targets.map(t => {
            const title = titleFor(t) || t.pkg;
            const slot = slotFrom(t.el);
            const mode = slot ? slot.mode : "float";
            return { t, title, slot, mode, key: [t.pkg, rev, mode].join("|") };
        });

        // No install button yet: the page may still be rendering, so wait before floating.
        if (!jobs.length && detailsPkg()) {
            if (!floatSince) floatSince = Date.now();
            if (Date.now() - floatSince < 2000) {
                for (const b of existing) b.remove(); // never leave a stale bar up
                schedule(500);
                return;
            }
            jobs.push({ t: { pkg: detailsPkg(), btn: document.body }, title: getTitleSafe(), slot: null, mode: "float", key: [detailsPkg(), rev, "float"].join("|") });
        } else floatSince = 0;

        // Bars are updated in place (title, position) and only rebuilt when the app, the
        // layout mode or the settings change, so nothing flashes while the page settles.
        for (const j of jobs) {
            let bar = existing.find(b => b.dataset.key === j.key && !keep.has(b));
            if (!bar) {
                bar = buildBar(j.t, j.title, j.key, j.mode === "inline");
                bar.classList.add("gpt-" + j.mode);
                bar.dataset.title = j.title;
            } else if (bar.dataset.title !== j.title) {
                bar.dataset.title = j.title;
                for (const a of bar.querySelectorAll("a.gpt-btn")) a.href = a._link.url({ pkg: j.t.pkg, title: j.title });
            }
            keep.add(bar);
            if (j.mode === "inline") {
                const row = j.slot.node.parentElement;
                if (bar.parentElement !== row) row.append(bar);
                arrange(row, j.slot.node, bar, j.t.pkg);
            } else if (j.slot) { if (bar.previousElementSibling !== j.slot.node || !bar.isConnected) j.slot.node.after(bar); }
            else if (bar.parentElement !== document.body) document.body.append(bar);
        }
        for (const b of existing) if (!keep.has(b)) b.remove();
    }
    function getTitleSafe() { const h = titleEl(); return h ? h.textContent.trim() : detailsPkg(); }

    // ---- Settings panels ---------------------------------------------------------------
    // Two panels share one look: the settings (gear) and the copy-format menu (right-click
    // on Copy). Only one is open at a time.
    let closeTimer = 0;
    function closeSettings() { clearTimeout(closeTimer); closeTimer = 0; for (const p of document.querySelectorAll(".gpt-panel")) p.remove(); }
    // Close once the mouse has been off both the panel and what opened it for a moment
    // (so you can move from one to the other, or overshoot a little). Watches every pointer
    // move rather than enter/leave events, which never fire for a panel rebuilt under a
    // still cursor (as after Reset).
    document.addEventListener("pointermove", e => {
        const p = document.querySelector(".gpt-panel");
        if (!p || e.pointerType === "touch") return;
        const t = e.target;
        if (p.contains(t) || (p._anchor && p._anchor.contains(t))) { clearTimeout(closeTimer); closeTimer = 0; }
        else if (!closeTimer) closeTimer = setTimeout(() => { closeTimer = 0; if (!dragging) closeSettings(); }, 800);
    }, true);

    // Reordering: drag a row by its handle (mouse, pen or touch), or focus the handle and
    // press the up/down arrow keys. The row you hold follows the pointer; the others slide
    // out of the way (FLIP animation) and the order is saved when you let go.
    let dragging = false;
    const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    const keysOf = list => [...list.children].map(r => r.dataset.key);
    // Run `mutate` (which reorders the rows) and slide every row (except `skip`) from where
    // it was to where it ended up.
    function flip(list, mutate, skip, axis) {
        const side = axis === "X" ? "left" : "top", T = "translate" + (axis || "Y");
        const before = new Map();
        for (const r of list.children) if (r !== skip) before.set(r, r.getBoundingClientRect()[side]);
        mutate();
        if (reduceMotion()) return;
        for (const [r, at] of before) {
            if (r.getAnimations) for (const a of r.getAnimations()) a.cancel(); // read the real slot, not a half-finished slide
            const d = at - r.getBoundingClientRect()[side];
            if (d && r.animate) r.animate([{ transform: `${T}(${d}px)` }, { transform: `${T}(0)` }], { duration: 200, easing: "cubic-bezier(.2,0,0,1)" });
        }
    }
    // Sideways version for the chips: the whole chip is the handle, so a press only becomes
    // a drag once the pointer has moved a few pixels (otherwise it is a normal click/tick).
    function dragChip(chip, wrap, commit) {
        chip.addEventListener("pointerdown", e => {
            if (e.button !== 0) return;
            let on = false, grab = 0;
            const follow = x => { chip.style.transform = `translateX(${x - wrap.getBoundingClientRect().left - grab - chip.offsetLeft}px) scale(1.04)`; };
            const move = ev => {
                if (ev.pointerId !== e.pointerId) return;
                if (!on) {
                    if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
                    on = dragging = true;
                    grab = e.clientX - chip.getBoundingClientRect().left;
                    chip.classList.add("gpt-dragging");
                    const panel = chip.closest(".gpt-panel");
                    if (panel) panel.classList.add("gpt-busy");
                }
                ev.preventDefault();
                const centre = ev.clientX - wrap.getBoundingClientRect().left - grab + chip.offsetWidth / 2;
                let next = null;
                for (const c of wrap.children) { if (c !== chip && centre < c.offsetLeft + c.offsetWidth / 2) { next = c; break; } }
                const inPlace = next ? chip.nextElementSibling === next : wrap.lastElementChild === chip;
                if (!inPlace) flip(wrap, () => { if (next) wrap.insertBefore(chip, next); else wrap.append(chip); }, chip, "X");
                follow(ev.clientX);
            };
            const end = ev => {
                if (ev.pointerId !== e.pointerId) return;
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", end, true);
                window.removeEventListener("pointercancel", end, true);
                if (!on) return; // just a click
                const from = chip.getBoundingClientRect().left;
                chip.style.transform = "";
                chip.classList.remove("gpt-dragging");
                const panel = chip.closest(".gpt-panel");
                if (panel) panel.classList.remove("gpt-busy");
                if (!reduceMotion() && chip.animate) {
                    const d = from - chip.getBoundingClientRect().left;
                    if (d) chip.animate([{ transform: `translateX(${d}px) scale(1.04)` }, { transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,0,0,1)" });
                }
                dragging = false;
                // The release would also count as a click on the chip and flip its tick: swallow it.
                const swallow = c => { c.preventDefault(); c.stopPropagation(); };
                window.addEventListener("click", swallow, { capture: true, once: true });
                setTimeout(() => window.removeEventListener("click", swallow, true), 0);
                if (wrap.isConnected) commit(keysOf(wrap));
            };
            window.addEventListener("pointermove", move, true);
            window.addEventListener("pointerup", end, true);
            window.addEventListener("pointercancel", end, true);
        });
        // Keyboard: with the chip's checkbox focused, left/right arrows move it.
        chip.addEventListener("keydown", e => {
            let go;
            if (e.key === "ArrowLeft" && chip.previousElementSibling) go = () => wrap.insertBefore(chip, chip.previousElementSibling);
            else if (e.key === "ArrowRight" && chip.nextElementSibling) go = () => chip.nextElementSibling.after(chip);
            else return;
            e.preventDefault();
            const f = document.activeElement;
            flip(wrap, go, null, "X");
            if (f) f.focus();
            commit(keysOf(wrap));
        });
    }
    function dragRow(row, handle, list, commit) {
        // The whole row drags. Pressing the handle starts at once; pressing anywhere else only
        // becomes a drag after the pointer moves a few pixels, so ticking and clicking still work.
        row.addEventListener("pointerdown", e => {
            if (e.button !== 0) return;
            const fromHandle = handle.contains(e.target);
            if (fromHandle) e.preventDefault();
            const panel = row.closest(".gpt-panel");
            let on = false, grab = 0;
            const start = () => {
                on = dragging = true;
                grab = e.clientY - row.getBoundingClientRect().top; // where on the row you took hold
                row.classList.add("gpt-dragging");
                if (panel) panel.classList.add("gpt-busy");
            };
            if (fromHandle) start();
            // The row's own slot (offsetTop) ignores transforms, so this is the offset from
            // its slot to the pointer; it stays correct however the other rows move.
            const follow = y => { row.style.transform = `translateY(${y - list.getBoundingClientRect().top - grab - row.offsetTop}px) scale(1.02)`; };
            if (fromHandle) follow(e.clientY);
            // Listen on the window, not the handle: moving the row in the DOM would
            // drop pointer capture and strand the drag halfway.
            const move = ev => {
                if (ev.pointerId !== e.pointerId) return;
                if (!on) {
                    if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
                    start();
                }
                ev.preventDefault();
                const centre = ev.clientY - list.getBoundingClientRect().top - grab + row.offsetHeight / 2;
                let next = null;
                for (const r of list.children) { if (r !== row && centre < r.offsetTop + r.offsetHeight / 2) { next = r; break; } }
                const inPlace = next ? row.nextElementSibling === next : list.lastElementChild === row;
                if (!inPlace) flip(list, () => { if (next) list.insertBefore(row, next); else list.append(row); }, row);
                follow(ev.clientY);
            };
            const end = ev => {
                if (ev.pointerId !== e.pointerId) return;
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", end, true);
                window.removeEventListener("pointercancel", end, true);
                if (!on) return; // just a click
                // Drop: settle from where you let go into the slot.
                const from = row.getBoundingClientRect().top;
                row.style.transform = "";
                row.classList.remove("gpt-dragging");
                if (panel) panel.classList.remove("gpt-busy");
                if (!reduceMotion() && row.animate) {
                    const d = from - row.getBoundingClientRect().top;
                    if (d) row.animate([{ transform: `translateY(${d}px) scale(1.02)` }, { transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,0,0,1)" });
                }
                dragging = false;
                // The release would also count as a click (ticking a box, picking a format): swallow it.
                const swallow = c => { c.preventDefault(); c.stopPropagation(); };
                window.addEventListener("click", swallow, { capture: true, once: true });
                setTimeout(() => window.removeEventListener("click", swallow, true), 0);
                if (list.isConnected) commit(keysOf(list));
            };
            window.addEventListener("pointermove", move, true);
            window.addEventListener("pointerup", end, true);
            window.addEventListener("pointercancel", end, true);
        });
        handle.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); });
        handle.addEventListener("keydown", e => {
            let go;
            if (e.key === "ArrowUp" && row.previousElementSibling) go = () => list.insertBefore(row, row.previousElementSibling);
            else if (e.key === "ArrowDown" && row.nextElementSibling) go = () => row.nextElementSibling.after(row);
            else return;
            e.preventDefault();
            flip(list, go, null);
            handle.focus();
            commit(keysOf(list));
        });
    }
    function makeHandle(row, list, name, commit) {
        const handle = document.createElement("span");
        handle.className = "gpt-handle";
        handle.tabIndex = 0;
        handle.title = "Drag to reorder (or focus and use the arrow keys)";
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", `Move ${name}`);
        handle.append(icon(ICON_DRAG));
        dragRow(row, handle, list, commit);
        return handle;
    }

    // Opens below `anchor` (or above if there is no room), right-aligned with it, or
    // left-aligned when `alignLeft`.
    function placePanel(panel, anchor, alignLeft) {
        panel._anchor = anchor;
        const w = panel.offsetWidth, h = panel.offsetHeight;
        if (!anchor || !anchor.isConnected) { panel.style.right = "16px"; panel.style.bottom = "16px"; return; }
        const r = anchor.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
        let left = Math.min(Math.max(8, alignLeft ? r.left : r.right - w), W - w - 8), top;
        // Below the anchor if it fits, else above (overlapping by 2px so there is no gap to
        // cross), else beside it, so the panel never covers what opened it.
        if (r.bottom + h + 8 <= H) top = r.bottom - 2;
        else if (r.top - h - 8 >= 0) top = r.top - h + 2;
        else {
            top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), H - h - 8);
            left = r.right + w + 8 <= W ? r.right - 2 : Math.max(8, r.left - w + 2);
        }
        panel.style.left = left + "px";
        panel.style.top = Math.max(8, top) + "px";
    }
    const subhead = text => { const s = document.createElement("div"); s.className = "gpt-sub"; s.textContent = text; return s; };
    // A panel with a title, a Reset button (which forgets `resetKeys` and calls `afterReset`),
    // a subheading and an (empty) list of rows.
    function newPanel(id, titleText, subText, resetKeys, afterReset) {
        const panel = document.createElement("div");
        panel.id = id;
        panel.className = "gpt-panel";
        const title = document.createElement("div");
        title.className = "gpt-title";
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "gpt-reset";
        reset.textContent = "Reset";
        reset.title = "Back to the default settings for this menu";
        reset.addEventListener("click", e => {
            e.preventDefault();
            enabled = Object.assign({}, enabled);
            for (const k of resetKeys) delete enabled[k];
            save(enabled);
            afterReset();
        });
        title.append(titleText);
        if (resetKeys) title.append(reset);
        const list = document.createElement("div");
        list.className = "gpt-list";
        panel.append(title, subhead(subText), list);
        return { panel, list };
    }

    function toggleSettings(anchor) {
        if (document.getElementById("gpt-settings")) { closeSettings(); return; }
        closeSettings();
        const resetKeys = ["order", "unwrap", "gallery", ...LINKS.map(l => l.key)];
        const { panel, list } = newPanel("gpt-settings", "Play Store Tweaks", "Drag to arrange · untick to hide", resetKeys, () => {
            // The bars are rebuilt, so reopen on the new gear of the same app.
            const pkg = anchor && anchor.closest(".gpt-bar") ? anchor.closest(".gpt-bar").dataset.key.split("|")[0] : "";
            rev++; update(); closeSettings();
            const bar = [...document.querySelectorAll(".gpt-bar")].find(b => b.dataset.key.split("|")[0] === pkg);
            toggleSettings(bar ? bar.querySelector(".gpt-gear") : document.querySelector(".gpt-gear"));
        });
        const commit = keys => { if (JSON.stringify(keys) !== JSON.stringify(ordered().map(l => l.key))) setOrder(keys); };
        // One row per item: [tick · dot · name · "Google" ...... handle], or for a line break
        // [- - - Line break - - -  ×  handle]. Every row drags, from anywhere on it.
        const rowFor = l => {
            const row = document.createElement("div");
            row.className = "gpt-row";
            row.dataset.key = l.key;
            if (l.br) {
                row.classList.add("gpt-brrow");
                const line = document.createElement("span");
                line.className = "gpt-brline";
                line.textContent = "Line break";
                const x = document.createElement("button");
                x.type = "button";
                x.className = "gpt-x";
                x.title = "Remove this line break";
                x.setAttribute("aria-label", "Remove line break");
                x.append(icon(ICON_FAIL));
                x.addEventListener("click", e => { e.preventDefault(); flip(list, () => row.remove(), null); commit(keysOf(list)); });
                row.append(line, x, makeHandle(row, list, "line break", commit));
                return row;
            }
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = isOn(l);
            box.disabled = !!l.fixed;
            if (l.fixed) label.title = "Google's Install button can be moved but not hidden";
            box.addEventListener("change", () => { setOpts({ [l.key]: box.checked }); rev++; update(); });
            const dot = document.createElement("span");
            dot.className = "gpt-dot";
            dot.style.background = l.color;
            label.append(box, dot, l.name);
            if (l.google) { const g = document.createElement("span"); g.className = "gpt-note"; g.textContent = "Google"; label.append(g); }
            row.append(label, makeHandle(row, list, l.name, commit));
            return row;
        };
        for (const l of ordered()) list.append(rowFor(l));
        // New line breaks go in the middle, so the effect shows at once; then drag it into place.
        const add = document.createElement("button");
        add.type = "button";
        add.className = "gpt-add";
        add.textContent = "+ Add line break";
        add.addEventListener("click", () => {
            const keys = keysOf(list);
            const key = "br" + (Math.max(0, ...keys.filter(isBreakKey).map(k => +k.slice(2))) + 1);
            const row = rowFor(breakItem(key));
            flip(list, () => list.insertBefore(row, list.children[Math.ceil(keys.length / 2)] || null), row);
            row.classList.add("gpt-flash");
            commit(keysOf(list));
        });
        panel.append(add);
        const sub2 = subhead("Page");
        // A plain on/off option (on by default).
        const option = (key, text) => {
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = enabled[key] !== false;
            box.addEventListener("change", () => { setOpts({ [key]: box.checked }); update(); });
            label.append(box, text);
            return label;
        };
        const uLabel = option("unwrap", "Skip Google redirect links");
        const gLabel = option("gallery", "Scrollbar on screenshot galleries");
        const tip = document.createElement("div");
        tip.className = "gpt-sub gpt-hint";
        tip.textContent = "Tip: right-click Copy or the globe for more options.";
        panel.append(sub2, uLabel, gLabel, tip);
        document.body.append(panel);
        placePanel(panel, anchor);
    }

    // Right-click on Copy: what to copy (tick and drag the field chips), then the format:
    // pick it (click a name), choose which formats scrolling cycles through (tick), and
    // put them in the order you like (drag).
    function toggleFormats(anchor) {
        if (document.getElementById("gpt-formats")) { closeSettings(); return; }
        closeSettings();
        const { panel, list } = newPanel("gpt-formats", "Copy", "Format · click to use · tick for scroll",
            ["copyFormat", "fmtOrder", "fmtOff", "fieldOrder", "fieldOff"], () => { refreshFormats(); closeSettings(); toggleFormats(anchor); });
        // What to copy: one line of chips above the formats.
        const chips = document.createElement("div");
        chips.className = "gpt-chips";
        for (const f of fieldsOrdered()) {
            const chip = document.createElement("label");
            chip.className = "gpt-chip";
            chip.dataset.key = f.key;
            chip.title = "Tick to copy it · drag to reorder";
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = fieldOn(f);
            chip.classList.toggle("gpt-on", box.checked);
            box.addEventListener("change", () => {
                const off = new Set(Array.isArray(enabled.fieldOff) ? enabled.fieldOff : []);
                if (box.checked) off.delete(f.key); else off.add(f.key);
                if (FIELDS.every(x => off.has(x.key))) box.checked = true; // keep at least one
                else setOpts({ fieldOff: [...off] });
                chip.classList.toggle("gpt-on", box.checked);
            });
            chip.append(box, f.name);
            dragChip(chip, chips, keys => setOpts({ fieldOrder: keys }));
            chips.append(chip);
        }
        list.previousElementSibling.before(subhead("Include · drag to reorder"), chips); // above the "Format" heading
        const commit = keys => {
            if (JSON.stringify(keys) === JSON.stringify(fmtOrdered().map(f => f.key))) return;
            enabled = Object.assign({}, enabled, { fmtOrder: keys });
            save(enabled);
        };
        for (const f of fmtOrdered()) {
            const row = document.createElement("div");
            row.className = "gpt-row";
            row.dataset.key = f.key;
            const box = document.createElement("input");
            box.type = "checkbox";
            box.className = "gpt-fcheck";
            box.checked = fmtOn(f);
            box.title = "Include in scroll cycling";
            box.setAttribute("aria-label", `Include ${f.name} in scroll cycling`);
            box.addEventListener("change", () => {
                const off = new Set(Array.isArray(enabled.fmtOff) ? enabled.fmtOff : []);
                if (box.checked) off.delete(f.key); else off.add(f.key);
                if (FORMATS.every(x => off.has(x.key))) { box.checked = true; return; } // keep at least one
                enabled = Object.assign({}, enabled, { fmtOff: [...off] });
                save(enabled);
                refreshFormats();
            });
            const pick = document.createElement("span");
            pick.className = "gpt-pick";
            pick.setAttribute("role", "button");
            pick.tabIndex = 0;
            const name = document.createElement("span");
            name.textContent = f.name;
            const tag = document.createElement("span");
            tag.className = "gpt-tag";
            tag.textContent = f.key;
            pick.append(name, tag);
            const choose = () => {
                if (!fmtOn(f)) { box.checked = true; box.dispatchEvent(new Event("change")); }
                setFormat(f.key);
            };
            pick.addEventListener("click", choose);
            pick.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
            row.append(box, pick, makeHandle(row, list, f.name, commit));
            list.append(row);
        }
        document.body.append(panel);
        refreshFormats();
        placePanel(panel, anchor, true);
    }
    // Language & region: reopen this same page with another hl= (language) or gl= (country).
    // Scroll over the globe button to cycle countries (Shift + scroll for languages), or
    // right-click it for two small wheels.
    const LANGS = ["en", "es", "fr", "de", "pt-BR", "it", "ru", "ja", "ko", "zh-CN", "zh-TW", "ar", "hi", "tr", "id", "nl", "pl"];
    const REGIONS = ["US", "GB", "CA", "AU", "IN", "DE", "FR", "ES", "IT", "BR", "MX", "JP", "KR", "RU", "TR", "ID", "NL", "PL"];
    const same = (a, b) => a.replace("_", "-").toLowerCase() === b.replace("_", "-").toLowerCase();
    // What the address says (the page's own default when it says nothing).
    function pageLocale() {
        const q = new URLSearchParams(location.search);
        return { hl: q.get("hl") || "", gl: q.get("gl") || "" };
    }
    function displayName(type, code) {
        if (!code) return "Default";
        try { return new Intl.DisplayNames(["en"], { type }).of(code) || code; } catch (_) { return code; }
    }
    // The values for hl / gl: "" (no override) first, then the common ones, then the current one if it is none of them.
    function choices(kind) {
        const codes = [""], cur = pageLocale()[kind];
        for (const c of [...(kind === "hl" ? LANGS : REGIONS), cur]) if (c && !codes.some(x => same(x, c))) codes.push(c);
        return codes;
    }
    // Reload with these parameters set ("" removes one).
    function go(values) {
        const u = new URL(location.href);
        for (const [k, v] of Object.entries(values)) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
        if (u.href !== location.href) location.assign(u.href);
    }
    // The button shows the country (or the language if there is none); while scrolling, the new choice.
    function labelLang(btn) {
        const p = btn._pend || pageLocale();
        const code = btn._shown !== undefined ? btn._shown : p.gl || p.hl.split(/[-_]/)[0];
        btn.querySelector(".gpt-fmt").textContent = (code || "").toLowerCase();
        btn.querySelector(".gpt-sep").style.display = code ? "" : "none";
        btn.title = "Language & country\nScroll: country · Shift + scroll: language\nClick or right-click: menu (pick Default to reset)";
        btn.setAttribute("aria-label", "Language and country");
    }
    // Scrolling previews a choice on the button and reloads once you stop for a moment.
    function onLangWheel(e) {
        e.preventDefault();
        const dir = wheelDir(e);
        if (!dir) return;
        const btn = e.currentTarget, kind = e.shiftKey ? "hl" : "gl";
        const p = btn._pend || (btn._pend = pageLocale());
        const list = choices(kind), i = list.findIndex(c => same(c, p[kind]));
        p[kind] = list[(i + dir + list.length) % list.length];
        btn._shown = p[kind] || "–";
        labelLang(btn);
        clearTimeout(btn._go);
        btn._go = setTimeout(() => { btn._pend = null; btn._shown = undefined; go(p); labelLang(btn); }, 800);
    }

    // Right-click menu: a wheel each for language and country. Scroll (or click, or use the
    // arrow keys) to put the one you want in the middle, then Apply.
    function toggleLang(anchor) {
        if (document.getElementById("gpt-lang")) { closeSettings(); return; }
        closeSettings();
        const { panel, list } = newPanel("gpt-lang", "Language & region", "Scroll each wheel, then Apply", null);
        const now = pageLocale(), get = {};
        const apply = () => go({ hl: get.hl(), gl: get.gl() });
        const wheel = (title, kind, type) => {
            const col = document.createElement("div");
            col.className = "gpt-col";
            col.append(subhead(title));
            const codes = choices(kind);
            let idx = Math.max(0, codes.findIndex(c => same(c, now[kind])));
            const w = document.createElement("div"), inner = document.createElement("div");
            w.className = "gpt-wheel";
            w.tabIndex = 0;
            w.setAttribute("role", "listbox");
            w.setAttribute("aria-label", title);
            inner.className = "gpt-wheel-in";
            const items = codes.map((c, i) => {
                const it = document.createElement("div");
                it.className = "gpt-wi";
                it.setAttribute("role", "option");
                it.textContent = displayName(type, c);
                it.addEventListener("click", () => set(i));
                return it;
            });
            const set = i => {
                idx = (i + codes.length) % codes.length;
                inner.style.transform = `translateY(${(2 - idx) * 26}px)`;
                items.forEach((it, n) => { it.classList.toggle("gpt-sel", n === idx); it.setAttribute("aria-selected", n === idx); });
            };
            const ws = wheelState();
            w.addEventListener("wheel", e => {
                e.preventDefault();
                const dir = wheelDir(e, ws, 120);
                if (dir) set(idx + dir);
            }, { passive: false });
            w.addEventListener("keydown", e => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); set(idx + (e.key === "ArrowDown" ? 1 : -1)); }
                else if (e.key === "Enter") { e.preventDefault(); apply(); }
            });
            inner.append(...items);
            w.append(inner);
            col.append(w);
            list.append(col);
            set(idx);
            get[kind] = () => codes[idx];
        };
        wheel("Language", "hl", "language");
        wheel("Country", "gl", "region");
        const ok = document.createElement("button");
        ok.type = "button";
        ok.className = "gpt-apply";
        ok.textContent = "Apply";
        ok.addEventListener("click", apply);
        panel.append(ok);
        document.body.append(panel);
        placePanel(panel, anchor, true);
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); }, true);
    document.addEventListener("click", e => {
        if (!e.target.closest || !e.target.closest(".gpt-panel, .gpt-gear")) closeSettings();
    }, true);
    window.addEventListener("scroll", closeSettings, { passive: true });
    if (typeof GM_registerMenuCommand === "function") {
        // These open next to the buttons on the page (or in the corner if there are none).
        const open = (fn, sel) => () => { closeSettings(); fn(document.querySelector(sel)); };
        GM_registerMenuCommand("Buttons & links…", open(toggleSettings, ".gpt-gear"));
        GM_registerMenuCommand("Copy options…", open(toggleFormats, ".gpt-copy"));
        GM_registerMenuCommand("Language & region…", open(toggleLang, ".gpt-lang"));
    }

    // ---- Main loop -------------------------------------------------------------------
    // Play swaps pages without reloading, so re-check whenever the page changes.
    // Batched, because Play mutates the DOM constantly.
    let timer = 0;
    function schedule(delay) {
        if (timer) return;
        timer = setTimeout(() => { timer = 0; try { update(); } catch (err) { console.error("[Play Store Tweaks]", err); } }, delay || 100);
    }
    new MutationObserver(() => schedule()).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", () => schedule());
    window.addEventListener("resize", () => schedule(200));
    schedule(0);
})();
