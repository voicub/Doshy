// HUD themes: which themes exist, what a device stores, how "Auto" resolves, how the accent colour is derived, and the tiny script that applies it all before first paint.
// Pure (no DOM): tested in lib/theme.test.ts. The colours themselves live in app/theme-tokens.css (docs/themes.md); lib/themeStore.ts and components/ThemeClass.tsx apply this on the page.
import { blend, contrast, hslToRgb, parseChannels, parseHex, readableInk, toChannels, toHex, type Rgb } from "./themeColor.ts";

export const THEME_IDS = ["neon", "blueprint", "daylight", "amber", "graphite", "contrast"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ThemeChoice = "auto" | ThemeId;
export const THEME_CHOICES: readonly ThemeChoice[] = ["auto", ...THEME_IDS];

export const THEME_LABEL: Record<ThemeChoice, string> = {
  auto: "Auto (follow the system)",
  neon: "Neon",
  blueprint: "Blueprint",
  daylight: "Daylight",
  amber: "Amber",
  graphite: "Graphite",
  contrast: "High contrast",
};
export const THEME_NOTE: Record<ThemeChoice, string> = {
  auto: "Light in the day, dark at night, and high contrast if your device asks for it.",
  neon: "Dark with a cyan glow. The original look.",
  blueprint: "Deep blue paper with white lines.",
  daylight: "Light and warm, for bright rooms and phones outdoors.",
  amber: "A dark warm terminal.",
  graphite: "Quiet grey, almost no colour.",
  contrast: "Black, white and yellow with thick lines. Easiest to read.",
};

/** The themes with a light background (`data-scheme="light"`): light status colours, native controls and scrollbars follow. */
export const LIGHT_THEMES: readonly ThemeId[] = ["daylight"];
export const schemeOf = (t: ThemeId): "light" | "dark" => (LIGHT_THEMES.includes(t) ? "light" : "dark");

export const STATUS_PALETTES = ["standard", "redgreen", "blueyellow"] as const;
export type StatusPalette = (typeof STATUS_PALETTES)[number];
export const STATUS_LABEL: Record<StatusPalette, string> = { standard: "Standard", redgreen: "Red-green safe", blueyellow: "Blue-yellow safe" };
export const STATUS_NOTE: Record<StatusPalette, string> = {
  standard: "Green, amber and red.",
  redgreen: "Blue, yellow and pink: for red-green colour blindness (the most common kind).",
  blueyellow: "Green, pale yellow and red: for blue-yellow colour blindness.",
};

/** Accent presets: a name and a hue (0..359). The exact shade is picked per theme so it stays readable (deriveAccent). */
export const ACCENT_PRESETS = [
  { label: "Cyan", hue: 195 },
  { label: "Blue", hue: 218 },
  { label: "Green", hue: 148 },
  { label: "Amber", hue: 40 },
  { label: "Rose", hue: 335 },
  { label: "Violet", hue: 268 },
] as const;

export type ThemeSettings = {
  theme: ThemeChoice;
  status: StatusPalette;
  /** Accent hue 0..359, or null for the theme's own accent. */
  accent: number | null;
};
export const THEME_DEFAULTS: ThemeSettings = { theme: "neon", status: "standard", accent: null };
export const THEME_STORAGE_KEY = "doshy-theme";

const isChoice = (v: unknown): v is ThemeChoice => typeof v === "string" && (THEME_CHOICES as readonly string[]).includes(v);
const isStatus = (v: unknown): v is StatusPalette => typeof v === "string" && (STATUS_PALETTES as readonly string[]).includes(v);

/** Whatever was stored (possibly nothing, an old version, or garbage) -> valid settings. */
export function cleanTheme(raw: unknown): ThemeSettings {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const hue = typeof o.accent === "number" && Number.isFinite(o.accent) ? ((Math.round(o.accent) % 360) + 360) % 360 : null;
  return { theme: isChoice(o.theme) ? o.theme : THEME_DEFAULTS.theme, status: isStatus(o.status) ? o.status : THEME_DEFAULTS.status, accent: hue };
}

export type SystemPrefs = { prefersLight: boolean; prefersMoreContrast: boolean };

/** "Auto" asks the system: more contrast wins, then light, else dark (Neon). An explicit choice ignores the system. */
export function resolveTheme(choice: ThemeChoice, sys: SystemPrefs): ThemeId {
  if (choice !== "auto") return choice;
  return sys.prefersMoreContrast ? "contrast" : sys.prefersLight ? "daylight" : "neon";
}

// ---- accent derivation ----

/** `edgeAlpha`: set when the theme draws its strong borders in the accent colour, so a new accent must keep that edge visible (3:1) too. */
export type Surfaces = { /** Every surface text can land on. */ all: readonly Rgb[]; /** The usual translucent panel over the page (edges are drawn on it). */ panel: Rgb; edgeAlpha?: number };
const INK_DARK: Rgb = [3, 16, 23]; // the Neon accent ink
const INK_LIGHT: Rgb = [255, 255, 255];
/** `edgeAlpha` is only set when the theme's strong borders are the accent and the theme's own opacity would no longer give them 3:1: the stronger opacity to use instead. */
export type AccentResult = { ok: true; hex: string; channels: string; ink: string; edgeAlpha?: number } | { ok: false; message: string };

const AA_TEXT = 4.5;
const SAT = { dark: 1, light: 0.85 } as const;
// Lightness search order: the lightness the Neon cyan has (dark) / that reads well on warm white (light) first, then outward until the text contrast holds.
const LIGHTNESS: Record<"dark" | "light", readonly number[]> = {
  dark: [0.67, 0.7, 0.64, 0.73, 0.61, 0.76, 0.58, 0.79, 0.55, 0.82, 0.52],
  light: [0.38, 0.35, 0.41, 0.32, 0.44, 0.29, 0.47, 0.26, 0.5, 0.23],
};

/** The weakest border opacity at or above the theme's own that keeps an accent-coloured strong border at 3:1 against the panel; undefined when the theme's own already does (or its borders are not the accent). */
function edgeAlphaFor(c: Rgb, s: Surfaces): number | undefined {
  if (s.edgeAlpha === undefined) return undefined;
  for (let a = s.edgeAlpha; a < 1; a += 0.05) if (contrast(blend(c, a, s.panel), s.panel) >= 3) return a === s.edgeAlpha ? undefined : Math.round(a * 100) / 100;
  return 1;
}

/**
 * The accent for `hue` on a theme: the nicest lightness at which the accent is readable as text on every surface of the theme (WCAG AA, 4.5:1) and
 * the ink on top of an accent button is readable too. When no lightness works (it cannot happen on the shipped themes; a future theme could) it says so in plain words.
 */
export function deriveAccent(hue: number, scheme: "dark" | "light", s: Surfaces): AccentResult {
  for (const l of LIGHTNESS[scheme]) {
    const c = hslToRgb(hue, SAT[scheme], l);
    if (s.all.some((bg) => contrast(c, bg) < AA_TEXT)) continue;
    const ink = readableInk(c, INK_DARK, INK_LIGHT);
    if (contrast(c, ink) < AA_TEXT) continue;
    return { ok: true, hex: toHex(c), channels: toChannels(c), ink: toHex(ink), edgeAlpha: edgeAlphaFor(c, s) };
  }
  return { ok: false, message: "That colour is too hard to read on this theme. Pick another colour, or another theme." };
}

/** The inline custom properties that recolour a theme's accent (set on <html>, cached in storage for the boot script). */
export const accentVars = (a: Extract<AccentResult, { ok: true }>): Record<string, string> => ({
  "--accent": a.hex,
  "--accent-rgb": a.channels,
  "--accent-hi": a.hex,
  "--accent-hi-rgb": a.channels,
  "--accent-ink": a.ink,
  "--focus": a.hex,
  ...(a.edgeAlpha === undefined ? {} : { "--line-strong-a": String(a.edgeAlpha) }),
});
/** Everything accentVars can set, so a reset or a theme change can remove it all. */
export const ACCENT_VAR_NAMES: readonly string[] = [...Object.keys(accentVars({ ok: true, hex: "", channels: "", ink: "" })), "--line-strong-a"];

/** Surfaces of the current theme, from the computed values of its background tokens (the translucent panel at its usual 94 %). Null when a token is missing or malformed. */
export function surfacesFrom(get: (name: string) => string): Surfaces | null {
  const bg = parseHex(get("--bg")), pc = parseChannels(get("--panel-rgb"));
  const solids = ["--bg-elev", "--panel-2", "--sunken", "--panel-solid"].map((n) => parseHex(get(n)));
  if (!bg || !pc || solids.some((c) => c === null)) return null;
  const panel = blend(pc, Math.min(1, 0.94 * (Number(get("--panel-k")) || 1)), bg);
  const follows = get("--line-rgb").trim() === get("--accent-rgb").trim();
  return { all: [bg, panel, ...(solids as Rgb[])], panel, edgeAlpha: follows ? Number(get("--line-strong-a")) || undefined : undefined };
}

// ---- stored form and the boot script ----

/** What is stored per device: the settings plus the resolved accent (so the boot script can apply it before React runs). */
export type StoredTheme = ThemeSettings & { resolved?: { theme: ThemeId; vars: Record<string, string> } };

/** The theme's colours as strings, for code that cannot use CSS variables (the 3D scene, canvases): see lib/useThemeColors.ts. */
export type ThemeColors = {
  scheme: "dark" | "light";
  bg: string;
  panel: string;
  text: string;
  textDim: string;
  accent: string;
  ok: string;
  warn: string;
  bad: string;
  /** Scene: the Studio's clear colour and the colours of its floor. */
  sceneBackdrop: string;
  studioCentre: string;
  studioMid: string;
  studioLine: string;
  /** 0..1: how dark the soft shadow around the building is on the Studio floor. */
  haloStrength: number;
};

/** Neon (what the server renders and what the CSS says without a data-theme); a test keeps it equal to app/theme-tokens.css. */
export const NEON_COLORS: ThemeColors = {
  scheme: "dark", bg: "#05070a", panel: "#080c10", text: "#e8f1f7", textDim: "#8aa0ad", accent: "#5ad7ff", ok: "#4fe3a1", warn: "#ffb020", bad: "#ff6a3d",
  sceneBackdrop: "#030406", studioCentre: "#46515f", studioMid: "#1f2630", studioLine: "#a9cde0", haloStrength: 0.6,
};


/**
 * Runs inline in <head>, before first paint: reads this device's choice, resolves Auto, and writes data-theme / data-scheme / data-status (and the cached accent) on <html>.
 * Written as a string because it must not wait for any bundle. Built from the constants above so the lists cannot drift; lib/theme.test.ts runs it against fake browsers.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia,s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"null")||{}}catch(x){}var t=s.theme,ids=${JSON.stringify(THEME_IDS)},light=${JSON.stringify(LIGHT_THEMES)},e="neon";if(ids.indexOf(t)>=0)e=t;else if(t==="auto")e=m("(prefers-contrast: more)").matches?"contrast":m("(prefers-color-scheme: light)").matches?"daylight":"neon";d.setAttribute("data-theme",e);d.setAttribute("data-scheme",light.indexOf(e)>=0?"light":"dark");if(s.status==="redgreen"||s.status==="blueyellow")d.setAttribute("data-status",s.status);var r=s.resolved;if(r&&r.theme===e&&r.vars)for(var k in r.vars)if(k.indexOf("--")===0)d.style.setProperty(k,String(r.vars[k]))}catch(x){}})()`;
