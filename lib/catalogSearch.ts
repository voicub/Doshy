import type { Def } from "./catalog.ts";

/** Words people use for the same thing; the first of each row is what the catalog usually calls it. Searching any of them finds all of them. */
const SYNONYMS: string[][] = [
  ["sofa", "couch", "settee", "loveseat", "sectional", "divan"],
  ["tv", "telly", "television", "screen", "monitor"],
  ["fridge", "refrigerator", "icebox", "freezer"],
  ["armchair", "recliner", "lounger"],
  ["chair", "seat", "stool"],
  ["bed", "mattress", "cot", "crib", "bunk"],
  ["wardrobe", "closet", "armoire"],
  ["dresser", "drawers", "chest", "tallboy"],
  ["nightstand", "bedside", "nightstand"],
  ["bookcase", "bookshelf", "shelf", "shelves", "shelving"],
  ["cabinet", "cupboard", "sideboard", "credenza", "storage"],
  ["desk", "workstation", "bureau"],
  ["table", "worktop", "counter"],
  ["lamp", "light", "lighting", "bulb", "sconce", "chandelier", "pendant"],
  ["rug", "carpet", "mat", "runner"],
  ["toilet", "wc", "loo", "lavatory"],
  ["sink", "basin", "washbasin", "faucet", "tap"],
  ["bath", "bathtub", "tub"],
  ["stove", "cooker", "hob", "oven", "range", "cooktop"],
  ["dishwasher", "dishes"],
  ["washer", "washing", "laundry", "dryer", "tumble"],
  ["aircon", "ac", "air conditioner", "conditioner", "cooling", "hvac"],
  ["radiator", "heater", "heating", "thermostat"],
  ["fan", "ventilator", "ventilation", "extractor", "hood"],
  ["plant", "houseplant", "flower", "flowers", "tree", "pot", "palm", "fern", "green", "greenery", "foliage", "leaf", "leaves"],
  ["cactus", "cacti", "succulent", "aloe", "agave"],
  ["herb", "herbs", "basil", "mint", "rosemary", "lavender", "thyme"],
  ["fake", "artificial", "faux", "silk"],
  ["bonsai", "topiary", "boxwood"],
  ["orchid", "flower", "bloom", "blooms"],
  ["vase", "bouquet", "pampas", "dried", "branches"],
  ["bin", "trash", "rubbish", "garbage", "waste"],
  ["mirror", "looking glass"],
  ["curtain", "drape", "drapes", "blind", "blinds", "shade"],
  ["speaker", "echo", "alexa", "soundbar", "audio"],
  ["vacuum", "hoover", "roomba", "robot"],
  ["car", "vehicle", "auto", "ev", "automobile"],
  ["charger", "wallbox", "charging", "evse"],
  ["solar", "pv", "photovoltaic", "panel"],
  ["battery", "powerwall", "storage"],
  ["camera", "cctv", "webcam", "doorbell"],
  ["stairs", "staircase", "steps", "stairway", "ladder"],
  ["grill", "bbq", "barbecue", "barbeque"],
  ["door", "doorway"],
  ["garden", "outdoor", "patio", "terrace", "balcony", "yard"],
  ["bike", "bicycle", "cycle"],
  ["garage", "workshop", "tools"],
  ["kitchen", "cooking"],
  ["bathroom", "washroom", "restroom"],
  ["pillow", "cushion"],
  ["picture", "painting", "frame", "art", "poster"],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/& ]+/g, " ").replace(/\s+/g, " ").trim();
const singular = (w: string) => (w.length > 3 && w.endsWith("es") ? w.slice(0, -2) : w.length > 2 && w.endsWith("s") ? w.slice(0, -1) : w);

/** Every word that should count as a hit for one typed word: itself, plus its synonym row (also when only the start of a word was typed). */
function expand(token: string): string[] {
  const t = norm(token);
  const out = new Set([t, singular(t)]);
  const base = singular(t);
  for (const row of SYNONYMS) {
    if (row.some((w) => w === t || w === base || (t.length >= 3 && w.startsWith(t)))) for (const w of row) out.add(w);
  }
  return [...out];
}

export type Searchable = Pick<Def, "label" | "brand" | "cat"> & { tags?: string };

/** A def's normalised label and its label+brand+tags+id+category text (the second one with a leading space): built once per def, not on every keystroke for each of ~1100 pieces. */
const texts = new WeakMap<Searchable, { label: string; spacedLabel: string; spacedHay: string }>();
function textsOf(kind: string, d: Searchable) {
  let t = texts.get(d);
  if (!t) {
    const label = norm(d.label);
    t = { label, spacedLabel: ` ${label}`, spacedHay: ` ${norm(`${d.label} ${d.brand} ${d.tags ?? ""} ${kind.replace(/[_-]+/g, " ")} ${d.cat}`)}` };
    texts.set(d, t);
  }
  return t;
}

/**
 * Instant search in plain words. Every typed word must hit (label, brand, id or category, or a synonym of it); better hits come first:
 * a word in the label beats one in the id, an exact word beats a synonym. Keeps catalog order within equal scores.
 */
export function searchKinds(catalog: Record<string, Searchable>, kinds: readonly string[], query: string): string[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (!tokens.length) return [...kinds];
  const groups = tokens.map((t) => {
    const base = singular(t);
    return { words: expand(t).map((w) => ({ w, spaced: ` ${w}`, direct: w === t || w === base })) };
  });
  const scored: { k: string; score: number; i: number }[] = [];
  kinds.forEach((k, i) => {
    const d = catalog[k];
    if (!d) return;
    const { label, spacedLabel, spacedHay } = textsOf(k, d);
    let score = 0;
    for (const g of groups) {
      let best = 0;
      for (const { w, spaced, direct } of g.words) {
        if (label.startsWith(w)) best = Math.max(best, direct ? 5 : 3);
        else if (spacedLabel.includes(spaced)) best = Math.max(best, direct ? 4 : 2.5);
        else if (spacedHay.includes(spaced)) best = Math.max(best, direct ? 2 : 1);
      }
      if (!best) return;
      score += best;
    }
    scored.push({ k, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.k);
}

export type SizeClass = "small" | "medium" | "large";
export const SIZES: { id: SizeClass; label: string; hint: string }[] = [
  { id: "small", label: "Small", hint: "Under 60 cm" },
  { id: "medium", label: "Medium", hint: "60 cm to 1.6 m" },
  { id: "large", label: "Large", hint: "Over 1.6 m" },
];
const SMALL_MAX = 0.6;
const LARGE_MIN = 1.6;

/** Small / medium / large by the longer side of the footprint. */
export const sizeClass = (d: { w: number; d: number }): SizeClass => {
  const side = Math.max(d.w, d.d);
  return side < SMALL_MAX ? "small" : side > LARGE_MIN ? "large" : "medium";
};

/** Categories as people think of them: by room first. Categories nobody listed here still show up, under "More". */
export const GROUPS: { id: string; label: string; cats: string[] }[] = [
  { id: "rooms", label: "Rooms", cats: ["Living", "Bedroom", "Kitchen & dining", "Bathroom", "Office"] },
  { id: "tech", label: "Home tech", cats: ["Appliances", "Climate", "Lighting & devices", "Security", "Energy"] },
  { id: "style", label: "Decor & stairs", cats: ["Decor", "Stairs"] },
  { id: "out", label: "Garage & outside", cats: ["Garage & EV", "Outdoor", "Garden", "Animals"] },
];

export function groupCategories(categories: readonly string[]): { id: string; label: string; cats: string[] }[] {
  const listed = new Set(GROUPS.flatMap((g) => g.cats));
  const more = categories.filter((c) => !listed.has(c));
  const groups = GROUPS.map((g) => ({ ...g, cats: g.cats.filter((c) => categories.includes(c)) })).filter((g) => g.cats.length);
  return more.length ? [...groups, { id: "more", label: "More", cats: more }] : groups;
}
