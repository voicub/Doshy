import assert from "node:assert/strict";
import test from "node:test";
import { autoIconName } from "./mdiAuto.ts";
import { cacheWith, cleanMdiBody, cleanMdiIcon, EMPTY_CACHE, isMdiName, mdiFromData, mdiName, mdiSearchNames, namesOf, readCache, recentWith, searchTerm } from "./mdi.ts";

const BULB = '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7M9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9z"/>';

test("names: only lower-case words joined by hyphens, as Home Assistant writes them", () => {
  assert.ok(isMdiName("lightbulb-group") && isMdiName("numeric-1-box"));
  for (const bad of ["", "Lightbulb", "a--b", "-a", "a-", "../etc", "a b", "a/b", "x".repeat(61), 7, null]) assert.equal(isMdiName(bad), false, String(bad));
  assert.equal(mdiName("mdi:door-open"), "door-open");
  assert.equal(mdiName("hass:door"), null);
  assert.equal(mdiName("mdi:Door"), null);
  assert.equal(mdiName("door"), null);
});

test("a real icon body passes and comes back with the fill left to the drawing", () => {
  const clean = cleanMdiBody(BULB);
  assert.ok(clean?.startsWith('<path d="M12 2a7'));
  assert.ok(!clean?.includes("fill"));
  assert.equal(cleanMdiBody(clean), clean, "cleaning twice changes nothing");
});

test("nothing that could run or load anything gets through the body check", () => {
  const bad = [
    '<script>alert(1)</script>',
    '<path d="M0 0" onload="alert(1)"/>',
    '<path d="M0 0" style="fill:red"/>',
    '<path d="M0 0" href="https://example.com"/>',
    '<path d="M0 0" xlink:href="#x"/>',
    '<image href="https://example.com/a.png"/>',
    '<use href="#a"/>',
    '<foreignObject><div/></foreignObject>',
    '<path d="M0 0 <script>"/>',
    '<path d="javascript:alert(1)"/>',
    '<path d="M0 0" fill="url(#a)"/>',
    '<path d="M0 0" d="M1 1"/>',
    '<path d="M0 0"></path>',
    '<g><path d="M0 0"/>',
    '</g><path d="M0 0"/>',
    '<g><g><g><g><g><path d="M0 0"/></g></g></g></g></g>',
    '<circle cx="1" cy="2" r="abc"/>',
    '<path d="M0 0"/>junk',
    "",
    "<g></g>",
  ];
  for (const b of bad) assert.equal(cleanMdiBody(b), null, b);
  assert.equal(cleanMdiBody(`<path d="${"M0 0".repeat(3000)}"/>`), null, "too long");
});

test("circles, rectangles and groups with numeric or fixed-word attributes are kept", () => {
  const body = '<g fill-rule="evenodd" opacity=".5"><circle cx="12" cy="12" r="3"/><rect x="1" y="1" width="4" height="4" rx="1"/></g>';
  assert.equal(cleanMdiBody(body), body);
});

test("an icon needs a clean body and a sane size", () => {
  assert.ok(cleanMdiIcon({ body: BULB, width: 24, height: 24 }));
  assert.equal(cleanMdiIcon({ body: BULB, width: 0, height: 24 }), null);
  assert.equal(cleanMdiIcon({ body: BULB, width: 24 }), null);
  assert.equal(cleanMdiIcon({ body: "<script/>", width: 24, height: 24 }), null);
  assert.equal(cleanMdiIcon("x"), null);
});

test("Iconify icon data: the icon, the set's default size, an alias of another icon, and the ones that cannot be used", () => {
  const data = { prefix: "mdi", width: 24, height: 24, icons: { lightbulb: { body: BULB }, wide: { body: BULB, width: 32 }, flipped: { body: BULB, hFlip: true } }, aliases: { bulb: { parent: "lightbulb" }, turned: { parent: "lightbulb", rotate: 1 } }, not_found: ["nope"] };
  assert.deepEqual(mdiFromData(data, "lightbulb")?.width, 24);
  assert.equal(mdiFromData(data, "wide")?.width, 32);
  assert.equal(mdiFromData(data, "bulb")?.body, mdiFromData(data, "lightbulb")?.body);
  assert.equal(mdiFromData(data, "flipped"), null);
  assert.equal(mdiFromData(data, "turned"), null);
  assert.equal(mdiFromData(data, "nope"), null);
  assert.equal(mdiFromData(data, "../x"), null);
  assert.equal(mdiFromData(null, "lightbulb"), null);
  assert.equal(mdiFromData({ icons: { x: { body: "<script/>" } } }, "x"), null);
});

test("search answers: valid mdi names only, without repeats, capped", () => {
  const found = mdiSearchNames({ icons: ["mdi:lamp", "mdi:lamp", "mdi-light:lamp", "mdi:Bad Name", 5, "mdi:desk-lamp", "mdi:oil-lamp"] }, 3);
  assert.deepEqual(found, ["lamp", "desk-lamp", "oil-lamp"]);
  assert.deepEqual(mdiSearchNames({ icons: "x" }, 5), []);
  assert.deepEqual(mdiSearchNames(null, 5), []);
});

test("what a request may carry: a short plain search word, a short list of names", () => {
  assert.equal(searchTerm("  Desk   LAMP! "), "desk lamp");
  assert.equal(searchTerm("a"), null);
  assert.equal(searchTerm(5), null);
  assert.equal(searchTerm("x".repeat(200))?.length, 40);
  assert.deepEqual(namesOf("lamp,fan,lamp", 5), ["lamp", "fan"]);
  assert.equal(namesOf("lamp,../x", 5), null, "one bad name refuses the list");
  assert.equal(namesOf("a,b,c", 2), null, "too many");
  assert.equal(namesOf("", 5), null);
});

test("the browser's memory is bounded, newest last, and re-checked when read back", () => {
  const icon = { body: cleanMdiBody(BULB) ?? "", width: 24, height: 24 };
  let cache = EMPTY_CACHE;
  for (let i = 0; i < 5; i++) cache = cacheWith(cache, { [`icon-${i}`]: icon }, 3);
  assert.deepEqual(cache.order, ["icon-2", "icon-3", "icon-4"]);
  assert.deepEqual(Object.keys(cache.icons).sort(), cache.order);
  assert.equal(cacheWith(cache, { "icon-4": icon }, 3), cache, "nothing new: the same object, so nothing is written again");
  assert.deepEqual(cacheWith(cache, { "icon-2": icon }, 3).order, ["icon-3", "icon-4", "icon-2"], "using one again makes it the newest");
  assert.equal(cacheWith(cache, { "../x": icon }, 3), cache, "a bad name is never kept");

  const stored = JSON.stringify({ order: ["good", "evil", "gone", "good"], icons: { good: icon, evil: { body: "<script/>", width: 24, height: 24 } } });
  assert.deepEqual(readCache(stored).order, ["good"], "a damaged or hand-edited entry is dropped, a repeat is kept once");
  assert.deepEqual(readCache("not json"), EMPTY_CACHE);
  assert.deepEqual(readCache(null), EMPTY_CACHE);
});

test("cache entries are canonical drawings, including dimensions, and prototype keys cannot stand in for SVG attributes", () => {
  const icon = { body: BULB, width: 24, height: 24 };
  const cache = cacheWith(EMPTY_CACHE, { bulb: icon });
  assert.equal(cache.icons.bulb.body, cleanMdiBody(BULB));
  const resized = cacheWith(cache, { bulb: { ...icon, width: 32 } });
  assert.equal(resized.icons.bulb.width, 32);
  assert.equal(cleanMdiBody('<path constructor=\"M0 0\"/>'), null);
  assert.equal(cleanMdiBody('<constructor d=\"M0 0\"/>'), null);
});

test("recent icons: newest first, no repeats, bounded", () => {
  assert.deepEqual(recentWith(["a", "b", "c"], "b", 3), ["b", "a", "c"]);
  assert.deepEqual(recentWith(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
});

test("automatic icons: the entity's own mdi icon wins, otherwise a default by domain and device class that follows the state", () => {
  assert.equal(autoIconName("light.hall", "on", { icon: "mdi:lightbulb-group" }), "lightbulb-group");
  assert.equal(autoIconName("light.hall", "on", { icon: "hass:bulb" }), "lightbulb", "another icon set is not carried");
  assert.equal(autoIconName("light.hall", "off", {}), "lightbulb");
  assert.equal(autoIconName("binary_sensor.front", "on", { device_class: "door" }), "door-open");
  assert.equal(autoIconName("binary_sensor.front", "off", { device_class: "door" }), "door-closed");
  assert.equal(autoIconName("binary_sensor.win", "on", { device_class: "window" }), "window-open");
  assert.equal(autoIconName("binary_sensor.x", "off", {}), "radiobox-blank");
  assert.equal(autoIconName("cover.curtain", "closed", { device_class: "curtain" }), "curtains-closed");
  assert.equal(autoIconName("cover.curtain", "open", { device_class: "curtain" }), "curtains");
  assert.equal(autoIconName("lock.front", "unlocked", {}), "lock-open-variant");
  assert.equal(autoIconName("sensor.t", "21", { device_class: "temperature" }), "thermometer");
  assert.equal(autoIconName("media_player.tv", "on", { device_class: "tv" }), "television");
  assert.equal(autoIconName("switch.socket", "on", { device_class: "outlet" }), "power-plug");
  assert.equal(autoIconName("zzz.thing", "on", {}), undefined, "a domain without a default keeps the dashboard's own marker");
  assert.equal(autoIconName("sensor.t", "21", { device_class: "temperature" }, true), undefined, "attribute only: no table");
  assert.equal(autoIconName("sensor.t", "21", { icon: "mdi:flash" }, true), "flash");
});
