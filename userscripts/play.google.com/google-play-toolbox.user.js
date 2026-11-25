// ==UserScript==
// @name        Google Play – Toolbox
// @namespace   https://github.com/AryanBhanot/monkey-business
// @description Adds an APKMirror search button to app pages on the Google Play Store website.
// @author      AryanBhanot
// @match       https://play.google.com/store/*
// @version     0.1.0
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

    // Package name of the app on the current page, or null on other pages.
    function currentPkg() {
        if (!/^\/store\/apps\/details\/?$/.test(location.pathname)) return null;
        return new URLSearchParams(location.search).get("id");
    }

    // Add (or update, or remove) the button. Safe to call repeatedly.
    function update() {
        const pkg = currentPkg();
        let btn = document.getElementById("gpt-apkmirror");
        if (!pkg) { if (btn) btn.remove(); return; }

        const href = "https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=" + encodeURIComponent(pkg);
        if (!btn) {
            btn = document.createElement("a");
            btn.id = "gpt-apkmirror";
            btn.textContent = "APKMirror";
            btn.target = "_blank";
            btn.rel = "noopener noreferrer";
            btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;padding:10px 16px;" +
                "border-radius:8px;background:#ff8b14;color:#fff;font:500 14px Arial,sans-serif;text-decoration:none;" +
                "box-shadow:0 2px 8px rgba(0,0,0,.3)";
        }
        btn.href = href;
        if (!btn.isConnected) document.body.append(btn);
    }

    // Play swaps pages without reloading, so re-check whenever the page changes.
    new MutationObserver(update).observe(document.documentElement, { childList: true, subtree: true });
    update();
})();
