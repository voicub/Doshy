// "Find them for me": what Home Assistant's own Energy dashboard setup (websocket `energy/get_prefs`) says about the home's sensors, and how
// those and plain name guesses fill the gaps in the user's energy sources. Pure apart from the one websocket read.
import { ENTITY_ID, isPriceSensor, type EnergySources } from "./energy.ts";
import { guessPowerEntity, guessSocEntity, type States } from "./flows.ts";
import { isRecord } from "./guards.ts";
import { wsCommand, type SocketFactory } from "./haNotify.ts";

/** What the Energy dashboard setup revealed: the same fields as the sources (never the currency). */
export type EnergyGuess = Partial<Omit<EnergySources, "currency">>;

const entity = (v: unknown): string | undefined => (typeof v === "string" && ENTITY_ID.test(v) ? v : undefined);
const price = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : undefined);
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : []);

/**
 * The first solar, grid and battery of the Energy dashboard setup: kWh counters for daily totals, the grid price (a price sensor, else a fixed
 * number) and the power sensors when HA has them (grid `power`, battery `power_config`). Anything that is not shaped as expected is skipped.
 */
export function parseEnergyPrefs(raw: unknown): EnergyGuess {
  const out: EnergyGuess = {};
  const set = <K extends keyof EnergyGuess>(k: K, v: EnergyGuess[K]) => {
    if (v !== undefined && out[k] === undefined) out[k] = v;
  };
  for (const src of records(isRecord(raw) ? raw.energy_sources : undefined)) {
    if (src.type === "solar") set("solarKwh", entity(src.stat_energy_from));
    else if (src.type === "grid") {
      for (const f of records(src.flow_from)) {
        set("importKwh", entity(f.stat_energy_from));
        set("price", entity(f.entity_energy_price));
        if (!entity(f.entity_energy_price)) set("fixedPrice", price(f.number_energy_price));
      }
      for (const f of records(src.flow_to)) set("exportKwh", entity(f.stat_energy_to));
      for (const p of records(src.power)) set("grid", entity(p.stat_rate));
    } else if (src.type === "battery" && isRecord(src.power_config)) {
      const direct = entity(src.power_config.stat_rate);
      const inverted = entity(src.power_config.stat_rate_inverted); // HA's own sign: positive = charging
      set("battery", direct ?? inverted);
      if (!direct && inverted) set("batteryInvert", true);
    }
  }
  return out;
}

/** Asks Home Assistant for its Energy dashboard setup over the websocket API. Rejects on auth failure, error, close or timeout. */
export async function readEnergyPrefs(base: string, token: string, WS: SocketFactory, timeoutMs = 5000): Promise<EnergyGuess> {
  return parseEnergyPrefs(await wsCommand(base, token, WS, { type: "energy/get_prefs" }, "Home Assistant could not read its energy setup", timeoutMs));
}

const WORDS = {
  solar: ["solar", "pv", "panel", "production", "generation"],
  grid: ["grid", "import", "meter", "mains"],
  battery: ["battery", "storage"],
  ev: ["charger", "wallbox", "ev", "car"],
} as const;

/** A price sensor by name: a kWh unit first, then the shortest id. */
function guessPriceEntity(states: States, taken: ReadonlySet<string>): string | undefined {
  const score = (id: string) => (/kWh$/i.test(states[id].attributes?.unit_of_measurement ?? "") ? 0 : 1);
  return Object.keys(states)
    .filter((id) => !taken.has(id) && isPriceSensor({ ...states[id], entity_id: id }))
    .sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b))[0];
}

export type FillResult = { next: EnergySources; fromHa: number; byName: number };

/**
 * Fills what is still empty: first from Home Assistant's Energy setup (`guess`, only sensors that exist in `states`), then by looking at sensor
 * names. A field the user already set is never touched and no sensor is used twice. `fromHa` / `byName` count the fields filled each way.
 */
export function fillSources(cur: EnergySources, guess: EnergyGuess | null, states: States): FillResult {
  const next: EnergySources = { ...cur };
  const taken = new Set(Object.values(next).filter((v): v is string => typeof v === "string" && ENTITY_ID.test(v)));
  const res = { fromHa: 0, byName: 0 };
  const take = (key: keyof EnergyGuess, id: string | undefined, via: "fromHa" | "byName"): boolean => {
    if (next[key] || !id || taken.has(id) || !states[id]) return false;
    (next as Record<string, unknown>)[key] = id;
    taken.add(id);
    res[via]++;
    return true;
  };
  if (guess) {
    if (take("grid", guess.grid, "fromHa") && guess.gridInvert) next.gridInvert = true;
    if (take("battery", guess.battery, "fromHa") && guess.batteryInvert) next.batteryInvert = true;
    for (const k of ["price", "importKwh", "exportKwh", "solarKwh"] as const) take(k, guess[k], "fromHa");
    if (!next.price && next.fixedPrice === undefined && guess.fixedPrice !== undefined) {
      next.fixedPrice = guess.fixedPrice;
      res.fromHa++;
    }
  }
  for (const k of ["solar", "grid", "battery", "ev"] as const) take(k, guessPowerEntity(states, WORDS[k], taken), "byName");
  take("batterySoc", guessSocEntity(states, taken), "byName");
  if (!next.price && next.fixedPrice === undefined) take("price", guessPriceEntity(states, taken), "byName");
  return { next, ...res };
}
