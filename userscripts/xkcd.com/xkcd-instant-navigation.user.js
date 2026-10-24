// ==UserScript==
// @name        xkcd – Instant Navigation
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Prefetches neighbouring xkcd comics and switches between them instantly, without a full page reload.
// @author      AryanBhanot
// @icon        https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/icons/instant-navigation.png
// @match       https://xkcd.com/*
// @match       https://www.xkcd.com/*
// @version     1.0.0
// @license     MIT
// @homepageURL https://github.com/AryanBhanot/monkey-business
// @supportURL  https://github.com/AryanBhanot/monkey-business/issues
// @updateURL   https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/xkcd-instant-navigation.user.js
// @downloadURL https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/xkcd.com/xkcd-instant-navigation.user.js
// @run-at      document-end
// @noframes
// @grant       none
// ==/UserScript==

(function () {
    "use strict";

    const PREFETCH_AHEAD = 2;   // how many comics to prefetch in each direction
    const CACHE_MAX = 14;       // prefetched pages kept in memory
    // Respect the browser's "data saver" mode: still swap pages instantly, but don't prefetch.
    const SAVE_DATA = !!(navigator.connection && navigator.connection.saveData);

    // ---- Helpers --------------------------------------------------------
    const q = (s) => document.querySelector(s);
    const isComicPath = (p) => /^\/(\d+\/?)?$/.test(p);

    function comicNumber() {
        const m = location.pathname.match(/^\/(\d+)/);
        if (m) return +m[1];
        const prev = q("a[rel=prev]");
        const p = prev && (prev.getAttribute("href") || "").match(/(\d+)/);
        return p ? +p[1] + 1 : null;
    }

    // A "plain" comic is one single image (optionally wrapped in a link) with no scripts, canvases
    // or other widgets. Anything else is interactive and needs a real page load to work.
    const plainComic = (scope) => {
        const comic = scope.querySelector("#comic");
        return (
            !!comic &&
            comic.querySelectorAll("img").length === 1 &&
            [...comic.querySelectorAll("*")].every((n) => n.tagName === "IMG" || n.tagName === "A") &&
            !scope.querySelector(
                "#middleContainer script, #middleContainer iframe, #middleContainer canvas, " +
                "#middleContainer style, #middleContainer object, #middleContainer embed"
            )
        );
    };

    const canonical = (href) => {
        const u = new URL(href, location.href);
        return u.origin + u.pathname.replace(/\/?$/, "/");
    };
    // Only same-site comic pages ("/" and "/1234/") are swapped in place; the rest load normally.
    const isSwappable = (href) => {
        try {
            const u = new URL(href, location.href);
            return u.origin === location.origin && isComicPath(u.pathname);
        } catch (_) {
            return false;
        }
    };
    const hrefOf = (a) => {
        const h = a && a.getAttribute("href");
        return h && !h.startsWith("#") ? h : null;   // "#" = no previous/next comic
    };

    // ---- Page cache -----------------------------------------------------
    // canonical URL -> { t, latest, promise }. A plain object, not a Map: comic 1110's own
    // script replaces the page's global Map with an unrelated class.
    const pages = Object.create(null);
    let navToken = 0;
    let prefetchToken = 0;
    let latestNum = null;
    let queuedRandom = null;

    // Fetch a comic page once and keep what we need: title, the page body, and a warmed-up image.
    function loadPage(href) {
        const key = canonical(href);
        const hit = pages[key];
        if (hit && !(hit.latest && Date.now() - hit.t > 60000)) return hit.promise;
        const entry = { t: Date.now(), latest: new URL(key).pathname === "/" };
        entry.promise = fetch(key, { credentials: "omit" })
            .then((r) => {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.text();
            })
            .then((html) => {
                const doc = new DOMParser().parseFromString(html, "text/html");
                const mc = doc.querySelector("#middleContainer");
                const prev = hrefOf(doc.querySelector("a[rel=prev]"));
                const next = hrefOf(doc.querySelector("a[rel=next]"));
                if (!mc || !plainComic(doc)) return { swappable: false, prev, next };   // interactive comic
                const img = doc.querySelector("#comic img");
                const pre = new Image();   // fills the image cache ahead of time
                if (img.getAttribute("srcset")) pre.srcset = img.getAttribute("srcset");
                pre.src = img.getAttribute("src");
                return { swappable: true, title: doc.title, mc, pre, prev, next };
            })
            .catch((err) => {
                if (pages[key] === entry) delete pages[key];
                throw err;
            });
        delete pages[key];
        pages[key] = entry;   // newest entries sit last; the oldest are dropped first
        const keys = Object.keys(pages);
        for (let i = 0; keys.length - i > CACHE_MAX; i++) delete pages[keys[i]];
        return entry.promise;
    }

    async function getLatest() {
        if (latestNum) return latestNum;
        try {
            const r = await fetch("/info.0.json", { credentials: "omit" });
            latestNum = (await r.json()).num || null;
        } catch (_) { /* leave unset; random falls back to xkcd's own link */ }
        return latestNum;
    }

    function pickRandom(latest) {
        const cur = comicNumber();
        for (let i = 0; i < 20; i++) {
            const n = 1 + Math.floor(Math.random() * latest);
            if (n !== cur && n !== 404) return n;
        }
        return 1;
    }

    // Quietly fetch the comics around the current one, plus one random comic for the R key.
    async function prefetchAround() {
        if (SAVE_DATA) return;
        const run = ++prefetchToken;
        const hrefs = { prev: hrefOf(q("a[rel=prev]")), next: hrefOf(q("a[rel=next]")) };
        for (let step = 0; step < PREFETCH_AHEAD; step++) {
            await Promise.all(["prev", "next"].map(async (dir) => {
                if (!hrefs[dir]) return;
                try {
                    const d = await loadPage(hrefs[dir]);
                    hrefs[dir] = d[dir];   // keep walking even past an interactive comic
                } catch (_) {
                    hrefs[dir] = null;
                }
            }));
            if (run !== prefetchToken) return;   // the user has moved on
        }
        // Only line up a new random comic once the previous one has been used (or is the page
        // we are on now); otherwise every navigation would download a comic nobody asked for.
        if (queuedRandom && queuedRandom !== comicNumber()) return;
        const latest = await getLatest();
        if (latest && run === prefetchToken) {
            queuedRandom = pickRandom(latest);
            loadPage("/" + queuedRandom + "/").catch(() => {});
        }
    }

    // ---- Page swap ------------------------------------------------------
    // Resolves once an image has loaded (or failed); immediately if it is already loaded.
    const imageReady = (im) =>
        im.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                  im.addEventListener("load", resolve, { once: true });
                  im.addEventListener("error", resolve, { once: true });
              });

    // Show another comic without reloading the page. Falls back to a normal load on any problem.
    async function goTo(href, push = true) {
        const key = canonical(href);
        const mine = ++navToken;
        let data = null;
        try { data = await loadPage(key); } catch (_) { /* normal load below */ }
        if (data && data.swappable) {
            // If the new image is still arriving, keep showing the current comic for a moment
            // instead of flashing an empty frame.
            await Promise.race([imageReady(data.pre), new Promise((r) => setTimeout(r, 800))]);
        }
        if (mine !== navToken) return;   // a newer navigation took over
        const mc = q("#middleContainer");
        if (!data || !data.swappable || !mc) {
            location.href = key;
            return;
        }
        mc.replaceChildren(...[...data.mc.childNodes].map((n) => document.importNode(n, true)));
        document.title = data.title;
        if (push && canonical(location.href) !== key) history.pushState(null, "", key);
        window.scrollTo(0, 0);
        prefetchAround();
    }

    async function goRandom() {
        const link = q('ul.comicNav a[href*="random"]');
        const latest = await getLatest();
        if (!latest) {
            if (link) location.href = link.href;
            return;
        }
        const n = queuedRandom && queuedRandom !== comicNumber() ? queuedRandom : pickRandom(latest);
        queuedRandom = null;
        goTo("/" + n + "/");
    }

    // ---- Wiring ---------------------------------------------------------
    // Interactive comics need their own scripts to run, so this page is left completely alone.
    if (!isComicPath(location.pathname) || !plainComic(document)) return;

    // Clicks on the comic's nav buttons (including ones sent by the keyboard script's
    // shortcuts) get the instant treatment. Modified clicks keep their normal behaviour.
    document.addEventListener("click", (e) => {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest("ul.comicNav a");
        if (!a) return;
        if (/\/random\//.test(a.getAttribute("href") || "")) {
            e.preventDefault();
            goRandom();
            return;
        }
        const href = hrefOf(a);
        if (href && isSwappable(href)) {
            e.preventDefault();
            goTo(href);
        }
    });

    // The browser's Back/Forward buttons work across swapped pages.
    window.addEventListener("popstate", () => goTo(location.href, false));

    const kick = () => setTimeout(prefetchAround, 300);
    if (document.readyState === "complete") kick();
    else window.addEventListener("load", kick, { once: true });
})();
