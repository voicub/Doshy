import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEmbedUrl, mixedContent, normalizeHeight } from "../custom_components/doshy/www/doshy-card-url.js";

const base = { defaultUrl: "http://doshy.local:3000", pageProtocol: "http:" };
const params = (url) => Object.fromEntries(new URL(url).searchParams);

test("an empty card shows the integration's address as an embedded, view-only scene", () => {
  const r = buildEmbedUrl({}, base);
  assert.equal(r.ok, true);
  const u = new URL(r.url);
  assert.equal(u.origin, "http://doshy.local:3000");
  assert.deepEqual(params(r.url), { embed: "1" });
});

test("the card's own url wins over the integration's, and its path is kept", () => {
  const r = buildEmbedUrl({ url: "https://doshy.example.com/home/" }, base);
  assert.equal(r.ok, true);
  assert.equal(new URL(r.url).origin + new URL(r.url).pathname, "https://doshy.example.com/home/");
});

test("no address anywhere is an error, not a broken frame", () => {
  assert.equal(buildEmbedUrl({}, { pageProtocol: "http:" }).ok, false);
  assert.equal(buildEmbedUrl({ url: "" }, { defaultUrl: null }).ok, false);
});

test("only http and https addresses without a login are accepted", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://doshy", "doshy.local:3000", "//doshy", "http://user:pw@doshy.local", 42, {}]) {
    assert.equal(buildEmbedUrl({ url }, base).ok, false, String(url));
  }
});

test("plan ids are letters, digits, - and _", () => {
  assert.equal(params(buildEmbedUrl({ plan: 2 }, base).url).plan, "2");
  assert.equal(params(buildEmbedUrl({ plan: "up-stairs_1" }, base).url).plan, "up-stairs_1");
  for (const plan of ["a b", "1&embed=0", "../x", "1;2", "é"]) assert.equal(buildEmbedUrl({ plan }, base).ok, false, plan);
});

test("view: 3d and overview show the whole plan, room:<name> one room, anything else is refused", () => {
  assert.equal(params(buildEmbedUrl({ view: "3d" }, base).url).view, undefined);
  assert.equal(params(buildEmbedUrl({ view: "overview" }, base).url).view, "overview");
  assert.equal(params(buildEmbedUrl({ view: "room:Living Room" }, base).url).view, "room:Living Room");
  assert.equal(params(buildEmbedUrl({ view: " room: Kitchen " }, base).url).view, "room:Kitchen");
  for (const view of ["room:", "rooms:Kitchen", "2d", "room:" + "x".repeat(81), "room:a\nb", 3]) assert.equal(buildEmbedUrl({ view }, base).ok, false, String(view));
});

test("a room name cannot add parameters of its own", () => {
  const r = buildEmbedUrl({ view: "room:Kitchen&interactive=1#x", plan: 1 }, base);
  assert.equal(r.ok, true);
  assert.equal(params(r.url).interactive, undefined);
  assert.equal(params(r.url).view, "room:Kitchen&interactive=1#x");
  assert.equal(new URL(r.url).hash, "");
});

test("taps are off unless interactive is true; without kiosk the whole app opens", () => {
  assert.equal(params(buildEmbedUrl({}, base).url).interactive, undefined);
  assert.equal(params(buildEmbedUrl({ interactive: "yes" }, base).url).interactive, undefined);
  assert.equal(params(buildEmbedUrl({ interactive: true }, base).url).interactive, "1");
  const full = buildEmbedUrl({ kiosk: false, interactive: true, view: "room:Kitchen", plan: 3 }, base);
  assert.deepEqual(params(full.url), { plan: "3" });
});

test("the theme follows Home Assistant unless the card says dark or light", () => {
  assert.equal(params(buildEmbedUrl({}, { ...base, dark: true }).url).theme, "dark");
  assert.equal(params(buildEmbedUrl({}, { ...base, dark: false }).url).theme, "light");
  assert.equal(params(buildEmbedUrl({}, base).url).theme, undefined);
  assert.equal(params(buildEmbedUrl({ theme: "light" }, { ...base, dark: true }).url).theme, "light");
  assert.equal(params(buildEmbedUrl({ theme: "auto" }, { ...base, dark: true }).url).theme, "dark");
  assert.equal(buildEmbedUrl({ theme: "pink" }, base).ok, false);
});

test("a url that already has a query keeps it, and the card's parameters win", () => {
  const r = buildEmbedUrl({ url: "http://doshy.local:3000/?a=1&embed=0", plan: 2 }, base);
  assert.deepEqual(params(r.url), { a: "1", embed: "1", plan: "2" });
});

test("a bad height is refused", () => {
  assert.equal(buildEmbedUrl({ height: "tall" }, base).ok, false);
  assert.equal(buildEmbedUrl({ height: 5 }, base).ok, false);
  assert.equal(buildEmbedUrl({ height: 400 }, base).ok, true);
});

test("height: pixels or an aspect ratio, 16 / 9 when unset", () => {
  assert.deepEqual(normalizeHeight(undefined), { kind: "ratio", ratio: "16 / 9" });
  assert.deepEqual(normalizeHeight(400), { kind: "px", px: 400 });
  assert.deepEqual(normalizeHeight("400"), { kind: "px", px: 400 });
  assert.deepEqual(normalizeHeight(" 400PX "), { kind: "px", px: 400 });
  assert.deepEqual(normalizeHeight("4/3"), { kind: "ratio", ratio: "4 / 3" });
  assert.deepEqual(normalizeHeight("1.5 / 1"), { kind: "ratio", ratio: "1.5 / 1" });
  for (const bad of [0, -300, 99, 3001, NaN, Infinity, "0/1", "1/0", "16:9", "16/", "abc", "400em", "1001/1", true, {}, []]) assert.equal(normalizeHeight(bad), null, String(bad));
});

test("mixed content: a plain http Doshy on an https page is flagged, except on this very computer", () => {
  assert.equal(mixedContent("https:", "http://doshy.local:3000/"), true);
  assert.equal(mixedContent("https:", "https://doshy.local/"), false);
  assert.equal(mixedContent("http:", "http://doshy.local:3000/"), false);
  assert.equal(mixedContent("https:", "http://localhost:3000/"), false);
  assert.equal(mixedContent("https:", "http://127.0.0.1:3000/"), false);
  assert.equal(mixedContent("https:", "not a url"), false);
});

test("the result says whether the finished address is mixed content", () => {
  assert.equal(buildEmbedUrl({}, { defaultUrl: "http://doshy.local:3000", pageProtocol: "https:" }).mixed, true);
  assert.equal(buildEmbedUrl({ url: "https://doshy.example.com" }, { defaultUrl: "http://doshy.local:3000", pageProtocol: "https:" }).mixed, false);
});
