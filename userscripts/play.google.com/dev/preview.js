// Local test page for Play Store Tweaks: http://localhost:8770/store/apps/details?id=com.whatsapp
//
// Fetches the real Play page, drops its security headers (which block injected scripts),
// and adds the userscript (read fresh from disk on every load) with small GM_* stand-ins
// that save to localStorage. Everything else is passed through to play.google.com.
//
//   node userscripts/play.google.com/dev/preview.js [port]
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const PORT = +process.argv[2] || 8770;
const SCRIPT = path.join(__dirname, "..", "play-store-tweaks.user.js");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SHIMS = `
window.GM_getValue = (k, d) => { const v = localStorage.getItem("gm:" + k); return v === null ? d : JSON.parse(v); };
window.GM_setValue = (k, v) => localStorage.setItem("gm:" + k, JSON.stringify(v));
window.GM_registerMenuCommand = () => {};
`;
const DROP = new Set(["content-security-policy", "content-security-policy-report-only", "content-encoding", "content-length",
    "transfer-encoding", "strict-transport-security", "set-cookie", "alt-svc", "cross-origin-opener-policy", "cross-origin-resource-policy"]);

http.createServer(async (req, res) => {
    try {
        const up = await fetch("https://play.google.com" + req.url, {
            method: req.method,
            headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", accept: req.headers.accept || "*/*", "content-type": req.headers["content-type"] || "" },
            body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
            duplex: "half",
            redirect: "manual",
        });
        const headers = {};
        for (const [k, v] of up.headers) if (!DROP.has(k)) headers[k] = k === "location" ? v.replace("https://play.google.com", "") : v;
        const type = up.headers.get("content-type") || "";
        if (!type.includes("text/html")) {
            res.writeHead(up.status, headers);
            res.end(Buffer.from(await up.arrayBuffer()));
            return;
        }
        const inject = `<script>${SHIMS}</script><script>${fs.readFileSync(SCRIPT, "utf8").replace(/<\/script/gi, "<\\/script")}</script>`;
        const html = (await up.text()).replace(/<\/body>/i, () => inject + "</body>");
        res.writeHead(up.status, headers);
        res.end(html);
    } catch (err) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(String(err));
    }
}).listen(PORT, () => console.log(`Play preview on http://localhost:${PORT}/store/apps/details?id=com.whatsapp`));
