// Material Design Icons (the icon set Home Assistant itself uses: `mdi:lightbulb`) for the device markers. Pure: names, the strict SVG check every body goes through,
// reading the Iconify API's answers, and the small bounded lists the browser keeps. The node test runner loads this file directly (.ts imports).
// Why a strict check: an icon body comes from a third-party service, is kept in localStorage and travels inside plan files and guest pages, so it is re-checked wherever it
// is read, and only the few shapes an icon needs (path, circle, rect, g with numeric or fixed-word attributes) can pass; the text that is drawn is rebuilt from the parts.
import { isRecord } from "./guards.ts";

/** `lightbulb-group`: lower-case words joined by hyphens, as Home Assistant and Iconify write them. */
export const MDI_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_NAME = 60;
/** The icons one plan carries (the manually chosen ones: lib/mdiPlan.ts). */
export const MAX_PLAN_ICONS = 200;
/** The icons the browser keeps for next time. */
export const MAX_CACHED = 200;
const MAX_BODY = 6000;
const MAX_DEPTH = 4;

export type MdiIcon = { body: string; width: number; height: number };

export const isMdiName = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_NAME && MDI_NAME.test(v);

/** The name inside `mdi:name`, or null for anything else (another icon set, a made-up value, a non-string). */
export function mdiName(ref: unknown): string | null {
  if (typeof ref !== "string" || !ref.startsWith("mdi:")) return null;
  const name = ref.slice(4);
  return isMdiName(name) ? name : null;
}

export const mdiRef = (name: string): string => `mdi:${name}`;

const NUMBER = /^-?(\d{1,4}(\.\d{1,4})?|\.\d{1,4})$/;
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]{1,6000}$/;

type Attr = (v: string) => boolean;
const numeric: Attr = (v) => NUMBER.test(v);
const unit: Attr = (v) => NUMBER.test(v) && Number(v) >= 0 && Number(v) <= 1;
const words = (...ok: string[]): Attr => (v) => ok.includes(v);
const COMMON: Record<string, Attr> = { fill: words("currentColor", "none"), opacity: unit, "fill-opacity": unit, "fill-rule": words("evenodd", "nonzero"), "clip-rule": words("evenodd", "nonzero") };
const ELEMENTS: Record<string, Record<string, Attr>> = {
  path: { ...COMMON, d: (v) => PATH_DATA.test(v) },
  circle: { ...COMMON, cx: numeric, cy: numeric, r: numeric },
  rect: { ...COMMON, x: numeric, y: numeric, width: numeric, height: numeric, rx: numeric, ry: numeric },
  g: { ...COMMON },
};
const ORDER = ["d", "cx", "cy", "r", "x", "y", "width", "height", "rx", "ry", "fill", "fill-rule", "clip-rule", "opacity", "fill-opacity"];

const TAG = /\s*<\s*(\/?)\s*([a-z]+)((?:\s+[a-z-]+\s*=\s*"[^"<>]*")*)\s*(\/?)\s*>/y;
const ATTR = /\s+([a-z-]+)\s*=\s*"([^"<>]*)"/g;

/**
 * The icon's SVG content in canonical form (every attribute checked, written in a fixed order, fill left to the drawing), or null when it holds anything else:
 * a script, a style, a link, an event handler, an unknown element or attribute, bad numbers, unbalanced groups, too much text.
 */
export function cleanMdiBody(body: unknown): string | null {
  if (typeof body !== "string" || body.length === 0 || body.length > MAX_BODY) return null;
  let out = "";
  let depth = 0;
  let at = 0;
  let any = false;
  for (;;) {
    TAG.lastIndex = at;
    const m = TAG.exec(body);
    if (!m) break;
    at = TAG.lastIndex;
    const [, closing, tag, attrText, selfClose] = m;
    if (!Object.hasOwn(ELEMENTS, tag)) return null;
    const allowed = ELEMENTS[tag];
    if (closing) {
      if (tag !== "g" || attrText.trim() || selfClose || depth === 0) return null;
      depth--;
      out += "</g>";
      continue;
    }
    if (tag !== "g" && !selfClose) return null; // shapes are written as <path .../>: no children, no closing tag to track
    const found: Record<string, string> = {};
    for (const a of attrText.matchAll(ATTR)) {
      const [, key, value] = a;
      if (!Object.hasOwn(allowed, key) || !allowed[key](value) || Object.hasOwn(found, key)) return null;
      found[key] = value;
    }
    const attrs = ORDER.filter((k) => k in found && !(k === "fill" && found[k] === "currentColor")).map((k) => ` ${k}="${found[k]}"`).join("");
    if (tag === "g") {
      if (selfClose) continue; // an empty group draws nothing
      if (++depth > MAX_DEPTH) return null;
      out += `<g${attrs}>`;
    } else {
      out += `<${tag}${attrs}/>`;
      any = true;
    }
  }
  if (at !== body.length && body.slice(at).trim()) return null; // something that is not a tag was left over
  return any && depth === 0 ? out : null;
}

const size = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 512 ? v : null);

/** One icon as stored (in a plan, the browser's cache, an API answer), or null when it is not a clean one. */
export function cleanMdiIcon(raw: unknown): MdiIcon | null {
  if (!isRecord(raw)) return null;
  const body = cleanMdiBody(raw.body);
  const width = size(raw.width);
  const height = size(raw.height);
  return body && width && height ? { body, width, height } : null;
}

/**
 * The icon called `name` in an Iconify icon-set answer (`GET /mdi.json?icons=<names>`: `{ icons: { name: { body, width?, height? } }, aliases, width, height, not_found }`).
 * A name that is an alias of another icon (Home Assistant still uses renamed ones) gives the parent's drawing; one that is flipped or turned is not used.
 */
export function mdiFromData(data: unknown, name: string): MdiIcon | null {
  if (!isRecord(data) || !isMdiName(name)) return null;
  const icons = isRecord(data.icons) ? data.icons : {};
  const aliases = isRecord(data.aliases) ? data.aliases : {};
  const alias = aliases[name];
  const entry = isRecord(alias) && typeof alias.parent === "string" ? icons[alias.parent] : icons[name];
  const turned = (e: unknown) => isRecord(e) && (e.rotate !== undefined || e.hFlip !== undefined || e.vFlip !== undefined);
  if (!isRecord(entry) || turned(entry) || turned(alias)) return null;
  return cleanMdiIcon({ body: entry.body, width: entry.width ?? (isRecord(alias) ? alias.width : undefined) ?? data.width ?? 24, height: entry.height ?? (isRecord(alias) ? alias.height : undefined) ?? data.height ?? 24 });
}

/** The names in an Iconify search answer (`{ icons: ["mdi:lamp", ...] }`): only valid `mdi:` names, no repeats, at most `max`. */
export function mdiSearchNames(data: unknown, max: number): string[] {
  const list = isRecord(data) && Array.isArray(data.icons) ? data.icons : [];
  const names = list.flatMap((r) => mdiName(r) ?? []);
  return [...new Set(names)].slice(0, max);
}

/** What the search box may send on: lower-case words, digits and hyphens, one line, short. Null for nothing usable. */
export function searchTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.toLowerCase().replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return t.length >= 2 ? t : null;
}

/** The names of a `?names=a,b,c` request: valid, no repeats, at most `max`; null when any is not a name (the whole request is refused). */
export function namesOf(raw: unknown, max: number): string[] | null {
  if (typeof raw !== "string" || !raw) return null;
  const parts = [...new Set(raw.split(","))];
  if (parts.length > max || !parts.every(isMdiName)) return null;
  return parts;
}

// ---- the browser's bounded memory of icons -------------------------------------------------------------------------------------------------------------

export type MdiCache = { order: string[]; icons: Record<string, MdiIcon> };
export const EMPTY_CACHE: MdiCache = { order: [], icons: {} };

/** The stored cache (localStorage text), re-checked entry by entry: whatever is not a clean icon is dropped, and the list is cut to the cap. */
export function readCache(text: string | null): MdiCache {
  if (!text) return EMPTY_CACHE;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY_CACHE;
  }
  const stored = isRecord(raw) && isRecord(raw.icons) ? raw.icons : {};
  const order = isRecord(raw) && Array.isArray(raw.order) ? [...new Set(raw.order.filter(isMdiName))].slice(-MAX_CACHED) : [];
  const icons: Record<string, MdiIcon> = {};
  for (const n of order) {
    const icon = cleanMdiIcon(stored[n]);
    if (icon) icons[n] = icon;
  }
  const kept = [...new Set(order)].filter((n) => n in icons).slice(-MAX_CACHED);
  return { order: kept, icons: Object.fromEntries(kept.map((n) => [n, icons[n]])) };
}

/** The cache with `add` put at the newest end; the oldest go when it is over `cap`. The same object back when nothing changed. */
export function cacheWith(cache: MdiCache, add: Readonly<Record<string, MdiIcon>>, cap = MAX_CACHED): MdiCache {
  const clean = Object.fromEntries(Object.entries(add).flatMap(([name, raw]) => {
    const icon = isMdiName(name) ? cleanMdiIcon(raw) : null;
    return icon ? [[name, icon]] : [];
  }));
  const names = Object.keys(clean);
  if (!names.length || names.length === 1 && cache.order.at(-1) === names[0] && JSON.stringify(cache.icons[names[0]]) === JSON.stringify(clean[names[0]])) return cache;
  const order = [...cache.order.filter((n) => !names.includes(n)), ...names].slice(-Math.min(MAX_CACHED, Math.max(1, cap)));
  return { order, icons: Object.fromEntries(order.map((n) => [n, clean[n] ?? cache.icons[n]])) };
}

/** Recently chosen icon names (newest first), `name` put in front, no repeats, at most `max`. */
export const recentWith = (recent: readonly string[], name: string, max = 16): string[] => [name, ...recent.filter((n) => n !== name)].slice(0, max);

/** Where device markers take their icon from when the owner has not picked one: Home Assistant's (the entity's own icon or a default for its kind), or Doshy's own set. */
export type IconSource = "ha" | "doshy";
export type IconSettings = { source: IconSource; recent: string[] };
export const ICON_DEFAULTS: IconSettings = { source: "ha", recent: [] };

/** The stored settings, re-checked: an unknown source is the default, the recent list keeps only valid names. */
export function cleanIconSettings(raw: unknown): IconSettings {
  const r = isRecord(raw) ? raw : {};
  const recent = Array.isArray(r.recent) ? [...new Set(r.recent.filter(isMdiName))].slice(0, 16) : [];
  return { source: r.source === "doshy" ? "doshy" : "ha", recent };
}
