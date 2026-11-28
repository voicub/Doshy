import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { ACCENT_VAR_NAMES, accentVars, cleanTheme, deriveAccent, resolveTheme, schemeOf, surfacesFrom, THEME_BOOT_SCRIPT, THEME_CHOICES, THEME_DEFAULTS, THEME_IDS, THEME_STORAGE_KEY, type SystemPrefs } from "./theme.ts";
import { contrast, parseHex } from "./themeColor.ts";

test("stored settings are cleaned, whatever was stored", () => {
  assert.deepEqual(cleanTheme(null), THEME_DEFAULTS);
  assert.deepEqual(cleanTheme("daylight"), THEME_DEFAULTS);
  assert.deepEqual(cleanTheme({ theme: "pink", status: "x", accent: "red" }), THEME_DEFAULTS);
  assert.deepEqual(cleanTheme({ theme: "daylight", status: "redgreen", accent: 395.4 }), { theme: "daylight", status: "redgreen", accent: 35 });
  assert.equal(cleanTheme({ accent: -30 }).accent, 330);
  assert.equal(cleanTheme({ accent: Number.NaN }).accent, null);
});

test("Auto follows the system: more contrast beats light, light beats dark; a choice ignores the system", () => {
  const sys = (prefersLight: boolean, prefersMoreContrast: boolean): SystemPrefs => ({ prefersLight, prefersMoreContrast });
  assert.equal(resolveTheme("auto", sys(false, false)), "neon");
  assert.equal(resolveTheme("auto", sys(true, false)), "daylight");
  assert.equal(resolveTheme("auto", sys(true, true)), "contrast");
  assert.equal(resolveTheme("auto", sys(false, true)), "contrast");
  assert.equal(resolveTheme("amber", sys(true, true)), "amber");
});

test("an accent that cannot be read on the theme is refused in plain words", () => {
  const mid = parseHex("#808080")!; // no lightness of any hue reaches 4.5:1 on mid grey with both inks
  const r = deriveAccent(200, "dark", { all: [mid], panel: mid });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /hard to read/);
});

test("a derived accent is readable and its ink is readable on it; reset removes every variable it set", () => {
  const bg = parseHex("#05070a")!;
  const r = deriveAccent(300, "dark", { all: [bg], panel: bg, edgeAlpha: 0.45 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(contrast(parseHex(r.hex)!, bg) >= 4.5);
  assert.ok(contrast(parseHex(r.hex)!, parseHex(r.ink)!) >= 4.5);
  for (const k of Object.keys(accentVars(r))) assert.ok(ACCENT_VAR_NAMES.includes(k), `${k} would stay behind after a reset`);
});

test("surfaces are read from computed tokens; a missing token gives null", () => {
  const tokens: Record<string, string> = { "--bg": "#05070a", "--panel-rgb": "6 9 12", "--bg-elev": "#0b0f14", "--panel-2": "#0a1218", "--sunken": "#070b0f", "--panel-solid": "#080c10", "--line-rgb": "90 215 255", "--accent-rgb": "90 215 255", "--line-strong-a": "0.45" };
  const s = surfacesFrom((n) => tokens[n] ?? "");
  assert.ok(s);
  assert.equal(s.all.length, 6);
  assert.equal(s.edgeAlpha, 0.45);
  assert.equal(surfacesFrom((n) => (n === "--bg" ? "" : tokens[n] ?? "")), null);
  assert.equal(surfacesFrom((n) => (n === "--line-rgb" ? "255 255 255" : tokens[n] ?? ""))?.edgeAlpha, undefined);
});

/** Runs the boot script in a fake browser and returns what it wrote on <html>. */
function boot(stored: unknown, sys: SystemPrefs, throws = false) {
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const root = { setAttribute: (k: string, v: string) => (attrs[k] = v), style: { setProperty: (k: string, v: string) => (style[k] = v) } };
  const localStorage = { getItem: (k: string) => { if (throws) throw new Error("blocked"); return k === THEME_STORAGE_KEY && stored !== undefined ? (typeof stored === "string" ? stored : JSON.stringify(stored)) : null; } };
  const matchMedia = (q: string) => ({ matches: q.includes("more") ? sys.prefersMoreContrast : q.includes("light") ? sys.prefersLight : false });
  runInNewContext(THEME_BOOT_SCRIPT, { document: { documentElement: root }, localStorage, window: { matchMedia } });
  return { attrs, style };
}

test("the boot script agrees with resolveTheme for every choice and system setting", () => {
  for (const theme of THEME_CHOICES) for (const prefersLight of [false, true]) for (const prefersMoreContrast of [false, true]) {
    const sys = { prefersLight, prefersMoreContrast };
    const { attrs } = boot({ theme }, sys);
    const want = resolveTheme(theme, sys);
    assert.equal(attrs["data-theme"], want, `${theme} ${JSON.stringify(sys)}`);
    assert.equal(attrs["data-scheme"], schemeOf(want));
  }
});

test("the boot script falls back to Neon on nothing, garbage or blocked storage, and applies status and a matching cached accent only", () => {
  const sys = { prefersLight: true, prefersMoreContrast: false };
  for (const stored of [undefined, "not json", { theme: "pink" }]) assert.equal(boot(stored, sys).attrs["data-theme"], "neon");
  assert.equal(boot(undefined, sys, true).attrs["data-theme"], "neon"); // blocked storage
  assert.equal(boot({ theme: "neon", status: "redgreen" }, sys).attrs["data-status"], "redgreen");
  assert.equal(boot({ theme: "neon", status: "other" }, sys).attrs["data-status"], undefined);
  const vars = { "--accent": "#112233", evil: "x" };
  assert.deepEqual(boot({ theme: "amber", resolved: { theme: "amber", vars } }, sys).style, { "--accent": "#112233" });
  assert.deepEqual(boot({ theme: "amber", resolved: { theme: "daylight", vars } }, sys).style, {}, "a cached accent for another theme is not used");
});

test("every theme id is a choice and has a scheme", () => {
  for (const id of THEME_IDS) assert.ok(THEME_CHOICES.includes(id) && ["light", "dark"].includes(schemeOf(id)));
});
