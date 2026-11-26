// Unit tests for the parts of Play Store Tweaks that need no page (copy formats, wheel
// stepping, ordering, language search).
//
//   node --test userscripts/play.google.com/dev/test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../play-store-tweaks.user.js");

const info = { name: "Foo [beta]", dev: "Foo Inc", pkg: "com.foo", url: "https://play.google.com/store/apps/details?id=com.foo" };
const parts = keys => keys.map(key => ({ key, v: info[key] }));
const fmt = key => t.FORMATS.find(f => f.key === key);

test("a lone ID is copied bare in every link format", () => {
    for (const k of ["md", "bb", "html"]) assert.equal(fmt(k).text(parts(["pkg"]), info), "com.foo");
});

test("markdown: the name becomes the link text and is escaped", () => {
    assert.equal(fmt("md").text(parts(["name", "dev", "pkg", "url"]), info),
        "[Foo \\[beta\\]](https://play.google.com/store/apps/details?id=com.foo) by Foo Inc (`com.foo`)");
    assert.equal(fmt("md").text(parts(["pkg", "url"]), info), "`com.foo` https://play.google.com/store/apps/details?id=com.foo");
});

test("bbcode and html", () => {
    assert.equal(fmt("bb").text(parts(["name", "url"]), info), "[url=https://play.google.com/store/apps/details?id=com.foo]Foo [beta][/url]");
    assert.equal(fmt("html").text(parts(["name", "url"]), info), '<a href="https://play.google.com/store/apps/details?id=com.foo">Foo [beta]</a>');
    assert.equal(fmt("html").text([{ key: "name", v: "A&B" }, { key: "pkg", v: "x.y" }], info), "A&amp;B (x.y)");
});

test("plain text and json", () => {
    assert.equal(fmt("txt").text(parts(["name", "pkg"]), info), "Foo [beta]\ncom.foo");
    assert.deepEqual(JSON.parse(fmt("json").text(parts(["name", "dev", "pkg"]), info)), { name: "Foo [beta]", developer: "Foo Inc", id: "com.foo" });
});

test("forum post uses the page data when there is some", () => {
    const ld = { image: "https://img/x", applicationCategory: "VIDEO_PLAYERS", aggregateRating: { ratingValue: "4.46", ratingCount: "12345" },
        offers: [{ price: "0" }], contentRating: "Everyone", description: " Hi " };
    assert.equal(t.forumPost({ ...info, ld }), [
        "[img]https://img/x=s128[/img]",
        "[b][url=https://play.google.com/store/apps/details?id=com.foo]Foo [beta][/url][/b] by Foo Inc",
        "Video players · 4.5★ (12,345 ratings) · Free · Everyone",
        "[quote]Hi[/quote]",
        "ID: [code]com.foo[/code]",
    ].join("\n"));
    assert.equal(t.forumPost({ ...info, dev: "" }), "[b][url=https://play.google.com/store/apps/details?id=com.foo]Foo [beta][/url][/b]\nID: [code]com.foo[/code]");
});

test("button wheel: one step per event, then a cooldown", () => {
    const st = t.wheelState(120, 1);
    assert.equal(t.wheelDir({ deltaY: 100 }, st, 1000), 1);
    assert.equal(t.wheelDir({ deltaY: 100 }, st, 1050), 0); // cooling down
    assert.equal(t.wheelDir({ deltaY: -3 }, st, 1200), -1);
    assert.equal(t.wheelDir({ deltaY: 0, deltaX: 0 }, st, 2000), 0);
    assert.equal(t.wheelDir({ deltaY: 0, deltaX: 5 }, st, 2000), 1); // Shift + wheel turned sideways
});

test("menu wheel: small deltas add up to one notch, a pause forgets them", () => {
    const st = t.wheelState(180, 100);
    assert.equal(t.wheelDir({ deltaY: 40 }, st, 1000), 0);
    assert.equal(t.wheelDir({ deltaY: 40 }, st, 1020), 0);
    assert.equal(t.wheelDir({ deltaY: 40 }, st, 1040), 1);
    assert.equal(t.wheelDir({ deltaY: 60 }, st, 2000), 0);
    assert.equal(t.wheelDir({ deltaY: 60 }, st, 2400), 0); // the pause dropped the first 60
    assert.equal(t.wheelDir({ deltaY: 3, deltaMode: 1 }, st, 2420), 1); // lines count as 40px
});

test("inOrder: saved order, extras, new items last, `first` items first", () => {
    const all = [{ key: "a", first: true }, { key: "b" }, { key: "c" }, { key: "d" }];
    const keys = (saved, extra) => t.inOrder(all, saved, extra).map(x => x.key);
    assert.deepEqual(keys([]), ["a", "b", "c", "d"]);
    assert.deepEqual(keys(["c", "b", "c", "zz"]), ["a", "c", "b", "d"]);
    assert.deepEqual(keys(["c", "a"]), ["c", "a", "b", "d"]);
    assert.deepEqual(keys(["b", "br1", "c"], k => (k === "br1" ? { key: k } : null)), ["a", "b", "br1", "c", "d"]);
});

test("the default layout names every button", () => {
    for (const l of t.LINKS) assert.ok(t.DEFAULT_ORDER.includes(l.key), l.key);
});

test("language and country search", () => {
    assert.equal(t.findCode("hl", "language", "fin"), "fi");
    assert.equal(t.findCode("hl", "language", "DE"), "de");
    assert.equal(t.findCode("gl", "region", "finland"), "FI");
    assert.equal(t.findCode("gl", "region", "united k"), "GB");
    assert.equal(t.findCode("gl", "region", "  "), null);
    assert.equal(t.findCode("gl", "region", "qqqq"), null);
    assert.ok(!t.everything("gl").includes("EU"));
});
