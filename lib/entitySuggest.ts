import type { HAState } from "./ha.ts";
import { isPressureEntity } from "./pressure.ts";
import { familyOf, type Family } from "./running.ts";
import { KIND_LABEL, washdataFamilies, washView, wordsOf, type WashKind } from "./washdata.ts";

// Ordering for the full-screen entity picker (compact screens): "Recently used", then "Suggested for this item", then the rest.
// Pure, so the ranking is tested without a browser; the thin localStorage helpers at the bottom keep the last few picks.

export type Candidate = { id: string; name: string; area: string | null; areaId: string | null };
export type Ranked = { recent: Candidate[]; suggested: Candidate[]; rest: Candidate[] };

export const MAX_RECENT = 6;

/** HA domains that usually make sense for a catalog category, best first. Empty = no opinion. */
const FIT: Record<string, readonly string[]> = {
  "Lighting & devices": ["light", "switch"],
  Climate: ["climate", "fan", "humidifier", "switch"],
  Appliances: ["switch", "media_player"],
  "Kitchen & dining": ["switch", "media_player"],
  Office: ["switch", "light", "media_player"],
  Sensors: ["binary_sensor", "sensor"],
  Security: ["lock", "binary_sensor", "siren", "switch"],
  Energy: ["sensor", "switch"],
  "Garage & EV": ["sensor", "switch", "cover"],
  Animals: ["device_tracker", "person", "binary_sensor", "switch", "light"],
  Outdoor: ["light", "switch"],
  Garden: ["switch", "sensor"],
};
const DEFAULT_FIT: readonly string[] = ["light", "switch"];

export const domainsForCategory = (cat: string | undefined): readonly string[] => (cat ? (FIT[cat] ?? DEFAULT_FIT) : DEFAULT_FIT);

const PLURAL: Record<string, string> = {
  light: "Lights", switch: "Switches", sensor: "Sensors", binary_sensor: "On/off sensors", cover: "Blinds & doors", climate: "Climate", fan: "Fans",
  media_player: "Speakers & TVs", lock: "Locks", siren: "Sirens", humidifier: "Humidifiers", vacuum: "Vacuums", input_boolean: "Toggles",
  automation: "Automations", remote: "Remotes", water_heater: "Water heaters", device_tracker: "Trackers", person: "People",
};
/** Plain-words name of a domain chip ("light" -> "Lights"). */
export const domainLabel = (domain: string): string => PLURAL[domain] ?? domain.replace(/_/g, " ");

const byFit = (fit: readonly string[]) => (a: Candidate, b: Candidate) => {
  const fa = fit.indexOf(a.id.split(".")[0]);
  const fb = fit.indexOf(b.id.split(".")[0]);
  return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || a.name.localeCompare(b.name);
};

export type RankOpts = {
  /** Area ids of the item's room: entities there are "suggested". */
  prefer: readonly string[];
  /** Domains that fit the item (domainsForCategory), best first. */
  fit: readonly string[];
  /** Entity ids picked lately, newest first. */
  recent: readonly string[];
  query: string;
  /** A domain chip, or null for all. */
  domain: string | null;
};

/** Filters by search text (id, name, area) and domain chip, then splits into recent / suggested (same area as the item) / everything else. */
export function rankEntities(cands: readonly Candidate[], o: RankOpts): Ranked {
  const words = o.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (c: Candidate) => {
    if (o.domain && c.id.split(".")[0] !== o.domain) return false;
    const hay = `${c.id} ${c.name} ${c.area ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const ok = cands.filter(hit);
  const byId = new Map(ok.map((c) => [c.id, c]));
  const recent = o.recent.flatMap((id) => byId.get(id) ?? []);
  const seen = new Set(recent.map((c) => c.id));
  const prefer = new Set(o.prefer);
  const sort = byFit(o.fit);
  const left = ok.filter((c) => !seen.has(c.id));
  return {
    recent,
    suggested: left.filter((c) => c.areaId !== null && prefer.has(c.areaId)).sort(sort),
    rest: left.filter((c) => c.areaId === null || !prefer.has(c.areaId)).sort(sort),
  };
}

/** Domains present among the candidates, those that fit the item first, then by how many entities they hold. */
export function domainChips(cands: readonly Candidate[], fit: readonly string[]): string[] {
  const n = new Map<string, number>();
  for (const c of cands) n.set(c.id.split(".")[0], (n.get(c.id.split(".")[0]) ?? 0) + 1);
  const rank = (d: string) => (fit.includes(d) ? fit.indexOf(d) : 99);
  return [...n.keys()].sort((a, b) => rank(a) - rank(b) || (n.get(b) ?? 0) - (n.get(a) ?? 0) || a.localeCompare(b));
}

/** `id` first, no repeats, at most MAX_RECENT. */
export const pushRecent = (list: readonly string[], id: string): string[] => [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT);

const KEY = "housey-recent-entities";

export function loadRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function rememberEntity(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pushRecent(loadRecent(), id)));
  } catch {
    // private mode / full storage: recents are a convenience only
  }
}

/** "on", "21.5 °C": the state with its unit when it has one. */
export function stateText(st: HAState): string {
  const unit = st.attributes.unit_of_measurement;
  return unit && st.state !== "unavailable" && st.state !== "unknown" ? `${st.state} ${unit}` : st.state;
}

/** Catalog categories whose pieces may be any kind of WashData appliance; a washer, dryer or dishwasher of any category offers them too. */
const WASH_CATEGORIES = ["Appliances", "Kitchen & dining"];
const WASH_FAMILIES: readonly Family[] = ["washer", "dryer", "dishwasher"];
export const offersWashdata = (kind: string, label: string | undefined, cat: string | undefined): boolean =>
  WASH_FAMILIES.includes(familyOf(`${kind} ${label ?? ""}`)) || (!!cat && WASH_CATEGORIES.includes(cat));

type WashOption = { /** What the item links to: the device's state sensor. */ entity: string; name: string; kind: WashKind; kindLabel: string; words: string };

/** The "WashData appliances" group of the entity picker: each detected device once, those that match the item's own kind first, then by name. */
export function washdataOptions(states: Record<string, HAState>, itemFamily?: Family): WashOption[] {
  const mine = (k: WashKind) => (k === itemFamily ? 0 : 1);
  return washdataFamilies(states)
    .map((d) => ({ entity: d.anchor, name: d.name, kind: d.kind, kindLabel: KIND_LABEL[d.kind], words: wordsOf(washView(states, d.base)) }))
    .sort((a, b) => mine(a.kind) - mine(b.kind) || a.name.localeCompare(b.name));
}

/** Barometers, including unavailable sensors, offered together by the entity picker. */
export const pressureOptions = (states: Record<string, HAState>): HAState[] => Object.values(states).filter(isPressureEntity).sort((a, b) => (a.attributes.friendly_name ?? a.entity_id).localeCompare(b.attributes.friendly_name ?? b.entity_id));
