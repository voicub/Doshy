"use client";
import { create } from "zustand";
import { advise, type AdvisorResult } from "./advisor";
import { advisorAppliances, indoorTemperature, pressureAdvice } from "./advisorPlan";
import { cleanSlots } from "./advisorPrices";
import { makeFmt } from "./advisorFormat";
import { parseSettings, DEFAULT_SETTINGS, type AdvisorSettings } from "./advisorSettings";
import { analyseSun, sunRooms } from "./advisorSun";
import { validZone } from "./advisorTime";
import { errorMessage, isRecord } from "./guards";
import { haFetch, onHomeChange } from "./haHome";
import { sceneDevices } from "./sceneDevices";
import { siteOf } from "./siteTypes";
import { useStore } from "./store";
import { usePressure } from "./usePressure";
import type { HourPoint, PvSlot } from "./advisorForecast";
import { useSiteState } from "./siteStore";
import { neighboursOf } from "./daylightNeighbours";

type State = {
  settings: AdvisorSettings; loaded: boolean; tokenSaved: boolean;
  result: AdvisorResult | null; updatedAt: number | null; busy: boolean; error: string | null;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AdvisorSettings, token?: string, clearToken?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};
let epoch = 0;
let running: AbortController | null = null;
const sched = { now: () => performance.now(), later: (fn: () => void) => { const id = setTimeout(fn, 0); return () => clearTimeout(id); } };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nullable = (v: unknown): v is number | null => v === null || finite(v);
function hoursOf(raw: unknown): HourPoint[] {
  return Array.isArray(raw) ? raw.slice(0, 192).filter((h): h is HourPoint => isRecord(h) && finite(h.t) && nullable(h.tempC) && nullable(h.cloud) && nullable(h.ghi) && nullable(h.rainChance) && nullable(h.pressureHpa)) : [];
}
function pvOf(raw: unknown): PvSlot[] {
  return Array.isArray(raw) ? raw.slice(0, 800).filter((p): p is PvSlot => isRecord(p) && finite(p.start) && finite(p.end) && p.end > p.start && finite(p.kw) && p.kw >= 0) : [];
}
async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await haFetch(path, { ...init, cache: "no-store", signal: init?.signal ?? AbortSignal.timeout(25_000) });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body)) throw new Error(isRecord(body) && typeof body.error === "string" ? body.error : "The advisor could not reach its data. Your last result is still shown.");
  return body;
}

export const useAdvisor = create<State>((set, get) => ({
  settings: DEFAULT_SETTINGS, loaded: false, tokenSaved: false, result: null, updatedAt: null, busy: false, error: null,
  loadSettings: async () => {
    const mine = epoch;
    try {
      const body = await request("/api/advisor/settings");
      if (mine === epoch) set({ settings: parseSettings(body.settings), tokenSaved: body.tokenSaved === true, loaded: true, error: null });
    } catch (e) { if (mine === epoch) set({ error: errorMessage(e) }); }
  },
  saveSettings: async (settings, token, clearToken) => {
    const mine = epoch;
    const body = await request("/api/advisor/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: parseSettings(settings), ...(token ? { token } : {}), ...(clearToken ? { clearToken: true } : {}) }) });
    if (mine !== epoch) return;
    running?.abort();
    set({ settings: parseSettings(body.settings), tokenSaved: body.tokenSaved === true, loaded: true, result: null, updatedAt: null, busy: false, error: null });
  },
  refresh: async () => {
    if (get().busy) return;
    const mine = epoch;
    const ctl = new AbortController();
    running = ctl;
    set({ busy: true, error: null });
    try {
      if (!get().loaded) await get().loadSettings();
      if (!get().loaded) throw new Error("Advisor settings could not be read. Try again when the server is reachable.");
      const settings = get().settings;
      const { plan, states } = useStore.getState();
      const site = siteOf(plan.site);
      const query = site.enabled ? `?lat=${site.lat}&lon=${site.lon}` : "";
      const data = await request(`/api/advisor/data${query}`, { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(40_000)]) });
      const zone = validZone(data.zone) ?? "UTC";
      const now = Date.now();
      const place = isRecord(data.place) && finite(data.place.lat) && finite(data.place.lon) ? { lat: data.place.lat, lon: data.place.lon } : null;
      const devices = sceneDevices(plan, states);
      const sun = place ? await analyseSun(plan, sunRooms(plan), place, now, zone, { sched, budgetMs: 5, neighbours: neighboursOf(plan, useSiteState.getState().data), cancelled: () => ctl.signal.aborted || mine !== epoch }) : [];
      if (ctl.signal.aborted || mine !== epoch || plan !== useStore.getState().plan) return;
      const prices = Array.isArray(data.prices) ? cleanSlots(data.prices.filter((p): p is { start: number; end: number; price: number } => isRecord(p) && finite(p.start) && finite(p.end) && finite(p.price))) : [];
      const appliances = advisorAppliances(plan, states, settings, now);
      const currency = typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency) ? data.currency : settings.currency;
      const result = advise({ now, fmt: makeFmt(currency, settings.units, zone), prices, tomorrowExpected: settings.price.source !== "tariff" && settings.price.source !== "none", pv: pvOf(data.pv), hours: hoursOf(data.hours), indoorC: indoorTemperature(plan, states, settings), comfort: settings.climate, baseLoadKw: settings.solar.baseLoadW / 1000, appliances, rooms: sun.map((r) => ({ ...r, curtains: devices.filter((d) => d.roomId === r.roomId && d.kind === "cover").map((d) => ({ entity: d.entity, name: d.name })) })), solarUses: appliances.map((a) => a.name.toLowerCase()).concat(plan.items.some((it) => /car/.test(it.kind)) ? ["the car"] : []), weatherChange: pressureAdvice(usePressure.getState().tendency, now) });
      set({ result: { advice: result.advice, notes: [...(Array.isArray(data.notes) ? data.notes.filter((n): n is string => typeof n === "string").slice(0, 20) : []), ...result.notes] }, updatedAt: finite(data.updatedAt) ? data.updatedAt : now });
    } catch (e) { if (mine === epoch && !ctl.signal.aborted) set({ error: errorMessage(e) }); }
    finally { if (running === ctl) { running = null; set({ busy: false }); } }
  },
}));
onHomeChange(() => { epoch++; running?.abort(); useAdvisor.setState({ loaded: false, result: null, updatedAt: null, busy: false, error: null }); void useAdvisor.getState().loadSettings(); });
