// Reads app/theme-tokens.css (the single source of the theme colours) and checks, for every theme and every status palette, that the colours the HUD pairs together are readable:
// text 4.5:1 (WCAG AA), component edges and status fills 3:1, and that the colour-blind status palettes stay apart under simulated colour blindness.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACCENT_PRESETS, NEON_COLORS, deriveAccent, schemeOf, STATUS_PALETTES, THEME_IDS, type ThemeId } from "./theme.ts";
import { blend, contrast, deltaE, parseChannels, parseHex, simulate, type Deficiency, type Rgb } from "./themeColor.ts";

const CSS = readFileSync(new URL("../app/theme-tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Tokens = Map<string, string>;
const blocks = new Map<string, Tokens>(); // selector -> its declarations
for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().replace(/\s+/g, " ");
  const t = blocks.get(sel) ?? new Map<string, string>();
  for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) t.set(d[1], d[2].trim());
  blocks.set(sel, t);
}
const themeBlock = (id: ThemeId): Tokens => blocks.get(id === "neon" ? ':root, [data-theme="neon"]' : `[data-theme="${id}"]`) ?? new Map();
const statusBlock = (id: string, light: boolean): Tokens | undefined => blocks.get(light ? `[data-scheme="light"][data-status="${id}"]` : `[data-status="${id}"]`);

/** Tokens a theme must define itself: nothing may leak in from Neon. */
const REQUIRED = [
  "--bg", "--bg-elev", "--panel-2", "--sunken", "--panel-solid", "--void",
  "--panel-rgb", "--panel-k", "--scrim-rgb", "--shade-rgb", "--shade-k", "--fg-rgb",
  "--accent", "--accent-rgb", "--accent-hi", "--accent-hi-rgb", "--accent-ink",
  "--line-rgb", "--line-a", "--line-strong-a",
  "--text", "--text-rgb", "--text-2", "--text-3", "--text-dim", "--dim-rgb", "--text-faint",
  "--ok", "--ok-rgb", "--ok-text", "--warn", "--warn-rgb", "--warn-text", "--on-warn",
  "--bad", "--bad-rgb", "--bad-text", "--on-bad", "--bad-solid", "--info", "--info-rgb", "--info-text",
  "--on-solid", "--hi", "--focus", "--focus-w",
  "--scene-backdrop", "--studio-centre", "--studio-mid", "--studio-line", "--plan-paper", "--plan-line", "--plan-rule", "--halo-a",
] as const;

/** The tokens in force for a theme with a status palette applied (what the page computes). */
function effective(id: ThemeId, status: string): Tokens {
  const t = new Map(themeBlock(id));
  if (status !== "standard") for (const [k, v] of statusBlock(status, false) ?? []) t.set(k, v);
  if (status !== "standard" && schemeOf(id) === "light") for (const [k, v] of statusBlock(status, true) ?? []) t.set(k, v);
  return t;
}

function color(t: Tokens, name: string): Rgb {
  let v = t.get(name);
  assert.ok(v !== undefined, `${name} is not defined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) v = t.get(ref[1]) ?? "";
  const c = parseHex(v) ?? parseChannels(v);
  assert.ok(c, `${name}: "${v}" is not a colour`);
  return c;
}
const num = (t: Tokens, name: string) => Number(t.get(name));

/** Surfaces text can sit on: the page, raised and sunken areas, and the usual translucent panel over the page. */
function surfaces(t: Tokens): Record<string, Rgb> {
  const bg = color(t, "--bg");
  return { bg, "bg-elev": color(t, "--bg-elev"), "panel-2": color(t, "--panel-2"), sunken: color(t, "--sunken"), "panel-solid": color(t, "--panel-solid"), panel: blend(color(t, "--panel-rgb"), Math.min(1, 0.94 * num(t, "--panel-k")), bg), glass: blend(color(t, "--panel-rgb"), Math.min(1, 0.55 * num(t, "--panel-k")), bg) };
}

test("every theme defines every token itself", () => {
  for (const id of THEME_IDS) {
    const t = themeBlock(id);
    const missing = REQUIRED.filter((k) => !t.has(k));
    assert.deepEqual(missing, [], `${id} is missing tokens`);
  }
  const htmlThemes = [...blocks.keys()].flatMap((k) => /^\[data-theme="(\w+)"\]$/.exec(k)?.[1] ?? []);
  assert.deepEqual(htmlThemes.sort(), THEME_IDS.filter((i) => i !== "neon").sort(), "a theme block exists for every theme id (Neon is :root)");
});

test("hex and channel tokens of the same colour agree", () => {
  const pairs: [string, string][] = [["--accent", "--accent-rgb"], ["--accent-hi", "--accent-hi-rgb"], ["--text", "--text-rgb"], ["--text-dim", "--dim-rgb"], ["--ok", "--ok-rgb"], ["--warn", "--warn-rgb"], ["--bad", "--bad-rgb"], ["--info", "--info-rgb"]];
  for (const id of THEME_IDS) for (const status of ["standard", ...STATUS_PALETTES.slice(1)]) {
    const t = effective(id, status);
    for (const [hex, rgb] of pairs) assert.deepEqual(color(t, hex), color(t, rgb), `${id}/${status}: ${hex} and ${rgb} are different colours`);
  }
});

for (const id of THEME_IDS) for (const status of STATUS_PALETTES) {
  test(`readable: ${id} with ${status} status colours`, () => {
    const t = effective(id, status);
    const surf = surfaces(t);
    const fails: string[] = [];
    const need = (fg: string, bgName: string, min: number) => {
      const r = contrast(color(t, fg), surf[bgName]);
      if (r < min) fails.push(`${fg} on ${bgName}: ${r.toFixed(2)} < ${min}`);
    };
    // text: 4.5:1 on every surface it can land on
    for (const fg of ["--text", "--text-2", "--text-3", "--text-dim", "--accent", "--ok-text", "--warn-text", "--bad-text", "--info-text", "--hi"])
      for (const bg of Object.keys(surf)) need(fg, bg, 4.5);
    // placeholders and disabled text: 3:1 (WCAG exempts disabled controls; placeholders are decorative hints)
    for (const bg of ["bg", "panel"]) need("--text-faint", bg, 3);
    // graphics and component boundaries: 3:1
    for (const fg of ["--ok", "--warn", "--bad", "--info", "--focus"]) for (const bg of ["bg", "panel"]) need(fg, bg, 3);
    const panel = surf.panel;
    const edge = blend(color(t, "--line-rgb"), num(t, "--line-strong-a"), panel);
    if (contrast(edge, panel) < 3) fails.push(`--border-strong on panel: ${contrast(edge, panel).toFixed(2)} < 3`);
    // text on solid fills
    const onFill = (ink: string, fill: string, min = 4.5) => {
      const r = contrast(color(t, ink), color(t, fill));
      if (r < min) fails.push(`${ink} on ${fill}: ${r.toFixed(2)} < ${min}`);
    };
    onFill("--accent-ink", "--accent"); onFill("--accent-ink", "--accent-hi");
    // the plan sheet: drawn lines and labels on the paper, and the ruled grid (a guide, not text)
    const sheet = color(t, "--plan-paper");
    if (contrast(color(t, "--plan-line"), sheet) < 4.5) fails.push("--plan-line on --plan-paper");
    if (contrast(color(t, "--plan-rule"), sheet) < 3) fails.push("--plan-rule on --plan-paper");
    onFill("--on-warn", "--warn"); onFill("--on-bad", "--bad"); onFill("--on-solid", "--bad-solid");
    assert.deepEqual(fails, [], `${id}/${status}`);
  });
}

test("the high contrast theme reaches AAA (7:1) for its text", () => {
  const t = effective("contrast", "standard");
  const surf = surfaces(t);
  for (const fg of ["--text", "--text-2", "--text-3", "--text-dim", "--accent", "--ok-text", "--warn-text", "--bad-text", "--info-text"])
    for (const bg of Object.keys(surf)) assert.ok(contrast(color(t, fg), surf[bg]) >= 7, `${fg} on ${bg}`);
});

test("the colour-blind status palettes keep ok, warn and bad apart under simulated colour blindness", () => {
  const kinds: Record<string, Deficiency[]> = { redgreen: ["protanopia", "deuteranopia"], blueyellow: ["tritanopia"] };
  for (const id of THEME_IDS) for (const status of ["redgreen", "blueyellow"]) {
    const t = effective(id, status);
    const c = [color(t, "--ok"), color(t, "--warn"), color(t, "--bad")];
    for (const kind of kinds[status]) {
      const s = c.map((x) => simulate(x, kind));
      const d = [deltaE(s[0], s[1]), deltaE(s[0], s[2]), deltaE(s[1], s[2])];
      assert.ok(Math.min(...d) >= 30, `${id}/${status}/${kind}: ok, warn and bad are too alike (${d.map((x) => x.toFixed(0)).join(", ")})`);
    }
  }
});

test("accent presets are readable on every theme that lets you pick one", () => {
  for (const id of THEME_IDS.filter((i) => i !== "contrast")) {
    const t = effective(id, "standard");
    const surf = surfaces(t);
    for (const p of ACCENT_PRESETS) {
      const a = deriveAccent(p.hue, schemeOf(id), { all: Object.values(surf), panel: surf.panel, edgeAlpha: t.get("--line-rgb") === "var(--accent-rgb)" ? num(t, "--line-strong-a") : undefined });
      assert.ok(a.ok, `${id}/${p.label}`);
      if (!a.ok) continue;
      const c = parseHex(a.hex)!;
      for (const bg of Object.keys(surf)) assert.ok(contrast(c, surf[bg]) >= 4.5, `${id}/${p.label} on ${bg}`);
      assert.ok(contrast(c, parseHex(a.ink)!) >= 4.5, `${id}/${p.label} ink`);
      // themes whose lines follow the accent: the strong edge must stay visible with the new accent too
      if (t.get("--line-rgb") === "var(--accent-rgb)") assert.ok(contrast(blend(c, a.edgeAlpha ?? num(t, "--line-strong-a"), surf.panel), surf.panel) >= 3, `${id}/${p.label} border`);
    }
  }
});

test("every legacy tint is defined for Neon and for the other themes", () => {
  const legacy = readFileSync(new URL("../app/theme-legacy.css", import.meta.url), "utf8");
  const neon = new Set([...legacy.split("html[data-theme]")[0].matchAll(/(--lg-[\w-]+):/g)].map((m) => m[1]));
  const others = new Set([...legacy.split("html[data-theme]")[1].matchAll(/(--lg-[\w-]+):/g)].map((m) => m[1]));
  assert.deepEqual([...neon].sort(), [...others].sort());
  assert.ok(neon.size > 0);
});

test("the built-in Neon colours used before the page has read its CSS equal the Neon tokens", () => {
  const t = themeBlock("neon");
  const hex = (n: string) => t.get(n);
  assert.deepEqual(
    { bg: NEON_COLORS.bg, text: NEON_COLORS.text, textDim: NEON_COLORS.textDim, accent: NEON_COLORS.accent, ok: NEON_COLORS.ok, warn: NEON_COLORS.warn, bad: NEON_COLORS.bad, sceneBackdrop: NEON_COLORS.sceneBackdrop, studioCentre: NEON_COLORS.studioCentre, studioMid: NEON_COLORS.studioMid, studioLine: NEON_COLORS.studioLine, panelSolid: NEON_COLORS.panel },
    { bg: hex("--bg"), text: hex("--text"), textDim: hex("--text-dim"), accent: hex("--accent"), ok: hex("--ok"), warn: hex("--warn"), bad: hex("--bad"), sceneBackdrop: hex("--scene-backdrop"), studioCentre: hex("--studio-centre"), studioMid: hex("--studio-mid"), studioLine: hex("--studio-line"), panelSolid: hex("--panel-solid") },
  );
});
