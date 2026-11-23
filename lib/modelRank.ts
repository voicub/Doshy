// Ranks Sketchfab search hits against a catalogue car so the app can pick a model automatically.
// Pure: no node imports, safe for the browser. Hits come from shapeSearch (lib/modelLibrary.ts).
import { ALSO_SOLD_AS, GENERATIONS } from "./carModels.ts";
import type { SearchHit } from "./modelLibrary.ts";

export type Target = { id: string; label: string; brand: string; bodyStyle: string };
export type Ranked = { hit: SearchHit; score: number; heavy: boolean; reasons: string[]; scan: boolean; exact: boolean };

export const MIN_SCORE = 45;
export const MIN_HEAVY = 35;
const HEAVY_FACES = 200000;

/** Models somebody checked by eye, per catalogue car. They win the automatic pick. Rips with every variant stacked also need an entry in lib/carCurated.ts. */
export const CURATED: Record<string, string[]> = {
  // Mitsubishi ASX MK1 (Merc_TV, 970k faces): exact 2013-2016 face; carCurated.ts keeps one of each part and builds the missing wheels
  car_mitsubishi_asx_2016: ["b654aeee32064a3ca3b4693fa65bb09a"],
};
/** Models that look like cars in the search list but are not usable: a Ford Mondeo titled "Mitsubishi ASX". */
const UNUSABLE = new Set<string>(["79304f5b3fd342ad812cd584695ebbad"]);

const BRAND_SYNONYMS: Record<string, string[]> = {
  volkswagen: ["vw"],
  "mercedes benz": ["mercedes", "merc"],
  chevrolet: ["chevy"],
  opel: ["vauxhall"],
  "alfa romeo": ["alfa"],
  "land rover": ["landrover"],
};
const BODY_WORDS: Record<string, string[]> = {
  suv: ["suv"],
  crossover: ["suv", "crossover"],
  sedan: ["sedan", "saloon"],
  hatchback: ["hatchback", "hatch"],
  estate: ["estate", "wagon", "variant", "touring"],
  pickup: ["pickup", "truck"],
  van: ["van"],
  coupe: ["coupe"],
  convertible: ["convertible", "cabrio", "cabriolet", "roadster"],
};
const REJECT = /\b(concept|wreck|crash|damaged|interior|cockpit|engine only|wheel only|rim|tire|toy|lego|minecraft|voxel|rc car|diecast|decal|sticker|livery|kit|pack|collection|bundle|scene|diorama|garage|police|taxi|rally|race|tuned|drift|body ?kit|widebody|wheels?|logo|poster|art|point ?cloud|bumper|spoiler)\b/;
const SCAN = /\b(photoscan(ned)?|photogrammetry|scan(ned)?|reality ?capture|lidar|polycam|luma)\b/;

const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const isYear = (w: string) => /^(19|20)\d{2}$/.test(w);
// single characters and pure numbers ("3", "2", "500") separate Model 3 from Model S, so they must match
const isKey = (w: string) => w.length === 1 || /^\d+$/.test(w);

/** The label without its year ("Mitsubishi ASX 2016" -> "Mitsubishi ASX"); a bare model number such as Peugeot 2008 is kept. */
function yearless(label: string, brand: string) {
  const plain = label.replace(/\s+/g, " ").trim();
  const cut = plain.replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  return words(cut).length > words(brand).length ? cut : plain;
}

/** Search words in the order to try them: full label, plain "<brand> <model>", then the regional names. */
export function queriesFor(target: Pick<Target, "label" | "brand">): string[] {
  const full = target.label.replace(/\s+/g, " ").trim();
  const plain = yearless(full, target.brand);
  return [...new Set([full, plain, ...(ALSO_SOLD_AS[plain] ?? [])])];
}

function fraction(model: string[], have: Set<string>) {
  if (!model.length) return 0;
  if (model.some((w) => isKey(w) && !have.has(w))) return 0;
  return model.filter((w) => have.has(w)).length / model.length;
}

type Alias = { brand: string; model: string[] };
type Context = {
  brandWords: string[];
  modelOnly: string[];
  range: [number, number] | null;
  labelLower: string;
  synonyms: string[];
  aliases: Alias[];
  body: string[];
};

function contextFor(target: Target): Context {
  const plain = yearless(target.label, target.brand);
  const brandWords = words(target.brand);
  const labelYear = words(target.label).find(isYear);
  return {
    brandWords,
    modelOnly: words(plain).slice(brandWords.length),
    range: GENERATIONS[target.id] ?? (labelYear && words(target.label).length > words(plain).length ? [+labelYear - 3, +labelYear + 3] : null),
    labelLower: target.label.toLowerCase(),
    synonyms: BRAND_SYNONYMS[brandWords.join(" ")] ?? [],
    aliases: (ALSO_SOLD_AS[plain] ?? []).map((a) => {
      const w = words(a);
      return { brand: w[0], model: w.slice(1) };
    }),
    body: BODY_WORDS[target.bodyStyle] ?? [],
  };
}

/** The regional alias whose model words match best, preferring the title over the tags. */
function bestAlias(aliases: Alias[], inName: Set<string>, have: Set<string>) {
  let named = 0;
  let tagged = 0;
  let brand = false;
  for (const a of aliases) {
    const n = fraction(a.model, inName);
    const t = fraction(a.model, have);
    if (n > named || (n === named && t > tagged)) {
      named = n;
      tagged = t;
      brand = have.has(a.brand);
    }
  }
  return { named, tagged, brand };
}

/** Score change and reason for how well the hit's years fit the car's generation; null when it says nothing. */
function yearEffect(range: [number, number] | null, have: Set<string>): [number, string] | null {
  const years = [...have].filter(isYear).map(Number);
  if (range && years.length) {
    const gap = (y: number) => Math.max(0, range[0] - y, y - range[1]);
    const d = Math.min(...years.map(gap));
    if (d === 0) return [15, "year fits"];
    if (d > 3) return [-20, "year far off"];
    return null;
  }
  // the catalogue holds modern cars: a 1983 or 1976 body is a different car
  if (!range && years.some((y) => y < 2000)) return [-8, "old model"];
  return null;
}

/** Score change and reason for the model's polygon count. */
function sizeEffect(f: number): [number, string | null] {
  if (f >= HEAVY_FACES) return [-14, "heavy"];
  if (f >= 150000) return [4, null];
  if (f >= 1500) return [10, "good size"];
  if (f > 0) return [-6, "very simple"];
  return [0, null];
}

function scoreHit(ctx: Context, target: Target, hit: SearchHit): Ranked | null {
  const inName = new Set(words(hit.name));
  const have = new Set([...inName, ...hit.tags.flatMap(words)]);
  const reasons: string[] = [];
  const banned = REJECT.exec(hit.name.toLowerCase());
  if (banned && !ctx.labelLower.includes(banned[1])) return null;
  if (UNUSABLE.has(hit.uid)) return null;

  // the title is trusted more than the tags, which people often fill with every car they know
  const named = fraction(ctx.modelOnly, inName);
  const tagged = fraction(ctx.modelOnly, have);
  const alias = bestAlias(ctx.aliases, inName, have);
  if (tagged === 0 && alias.tagged === 0) return null;
  const brandName = ctx.brandWords.every((w) => inName.has(w)) || ctx.synonyms.some((w) => inName.has(w));
  const brandHere = brandName || ctx.brandWords.every((w) => have.has(w)) || ctx.synonyms.some((w) => have.has(w));
  if (!brandHere && !(alias.tagged > 0 && alias.brand)) return null;

  const options: [number, string][] = [[40 * named, `model in name ${Math.round(named * 100)}%`], [22 * tagged, `model in tags ${Math.round(tagged * 100)}%`], [28 * alias.named, `alias in name ${Math.round(alias.named * 100)}%`], [16 * alias.tagged, `alias in tags ${Math.round(alias.tagged * 100)}%`]];
  const [best, why] = options.reduce((a, b) => (b[0] > a[0] ? b : a));
  let score = best;
  reasons.push(why);
  if (brandName) {
    score += 10;
    reasons.push("brand in name");
  } else if (brandHere) score += 4;
  if (/\b(low ?poly|lowpoly)\b/.test(hit.name.toLowerCase())) {
    score -= 5;
    reasons.push("low poly");
  }
  // scans carry one huge baked texture: the paint cannot be recoloured and the ground comes with it
  const scan = SCAN.test(`${hit.name} ${hit.tags.join(" ")}`.toLowerCase()) || (hit.textures === 1 && (hit.textureMax ?? 0) >= 4096);
  if (scan) {
    score -= 14;
    reasons.push("scan");
  }
  if (CURATED[target.id]?.includes(hit.uid)) {
    score += 60; // looked at by a person: a clean model of the right generation
    reasons.push("hand-picked");
  }

  const year = yearEffect(ctx.range, have);
  if (year) {
    score += year[0];
    reasons.push(year[1]);
  }
  const [sizeDelta, sizeReason] = sizeEffect(hit.faces);
  score += sizeDelta;
  if (sizeReason) reasons.push(sizeReason);

  score += Math.min(5, Math.log10(1 + hit.likes) * 2);
  if (ctx.body.some((w) => have.has(w))) {
    score += 3;
    reasons.push("body type");
  }
  return { hit, score: Math.round(score * 10) / 10, heavy: hit.faces >= HEAVY_FACES, reasons, scan, exact: why.startsWith("model in name") };
}

export function rankCandidates(target: Target, hits: SearchHit[]): Ranked[] {
  const ctx = contextFor(target);
  const out: Ranked[] = [];
  for (const hit of hits) {
    const ranked = scoreHit(ctx, target, hit);
    if (ranked) out.push(ranked);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Best first, minus models the caller has already tried. */
export function bestFirst(list: Ranked[], opts: { skip?: string[] } = {}): Ranked[] {
  const skip = new Set(opts.skip);
  return list.filter((r) => !skip.has(r.hit.uid)).sort((a, b) => b.score - a.score);
}

/** The model to use plus the next five, or null when nothing is a believable match. A light model wins unless a heavy one is clearly better; a scan (one baked texture, cannot be recoloured) gives way to a clean model of the exact name that scores within 20. */
export function pickAuto(ranked: Ranked[]): { pick: Ranked; alternatives: Ranked[] } | null {
  const list = bestFirst(ranked);
  const light = list.find((r) => !r.heavy && r.score >= MIN_SCORE);
  const heavy = list.find((r) => r.heavy && r.score >= MIN_HEAVY);
  let pick = light && !(heavy && heavy.score > light.score + 15) ? light : (heavy ?? list.find((r) => r.score >= MIN_HEAVY));
  if (!pick) return null;
  const found = pick;
  if (found.scan) pick = list.find((r) => !r.scan && r.exact && r.score >= MIN_HEAVY && r.score >= found.score - 20 && !r.reasons.includes("year far off")) ?? found;
  return { pick, alternatives: list.filter((r) => r !== pick).slice(0, 5) };
}
