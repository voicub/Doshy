"use client";
import { useMemo } from "react";
import { CATALOG } from "@/lib/catalog";
import { domainOf, isActive, TOGGLEABLE, type HAState } from "@/lib/ha";
import { lightInfo, rgbCss } from "@/lib/light";
import { LIVE_LAYERS, useLiveLayer } from "@/lib/liveLayer";
import { sortedLevels } from "@/lib/levels";
import { HOLIDAY_IDS, SEASONS } from "@/lib/season";
import { useSkySettings } from "@/lib/sky";
import { TIER_LABEL, TIER_ORDER, useQuality, type QualityChoice } from "@/lib/quality";
import { useStore, type View } from "@/lib/store";
import type { Plan } from "@/lib/types";
import { buildEverything, download } from "@/lib/everythingClient";
import { exportPlan } from "./planIO";
import { TIME_CHOICES, WEATHER_CHOICES, setTimeChoice } from "./skyControls";

type Group = "Rooms" | "Lights" | "Appliances" | "Sensors" | "Device cards" | "Actions";
export type Cmd = { id: string; group: Group; label: string; hay: string; meta?: string; color?: string; on?: boolean; run: () => void; /** Shift+Enter: open the entity's device card */ card?: () => void };
export type Handlers = { onHelp: () => void; onBrowser: (q?: string) => void; onClimate: () => void; onDevice: (entity: string) => void; onStats: () => void; onPlex: () => void; onBuilding: () => void; onSite: () => void; onData: () => void; onGraphics: () => void };

/** Every query word must appear as a substring; otherwise fall back to an in-order character match (weaker). */
export function score(query: string, hay: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const h = hay.toLowerCase();
  if (q.split(/\s+/).every((w) => h.includes(w))) return 2 + (h.startsWith(q) ? 1 : 0);
  let k = 0;
  const flat = q.replace(/\s+/g, "");
  for (const ch of h) if (ch === flat[k] && ++k === flat.length) return 1;
  return 0;
}

const store = () => useStore.getState();
const goLive = () => store().setView("live");

function roomCommands(plan: Plan): Cmd[] {
  return plan.rooms.map((r) => ({ id: `room:${r.id}`, group: "Rooms", label: `Focus ${r.name}`, hay: `focus room ${r.name}`, meta: "Room", run: () => { goLive(); store().setFocusRoom(r.id); } }));
}

/** Every entity linked to furniture: lights and light-fixture switches, other toggleable appliances, and read-only sensors (or, with `cards`, one device-card entry each). */
function deviceCommands(plan: Plan, states: Record<string, HAState>, cards: boolean, { onDevice, onClimate }: Handlers): Cmd[] {
  const out: Cmd[] = [];
  const seen: Record<string, true> = {};
  for (const it of plan.items) {
    const id = it.entity;
    if (!id || seen[id] || !states[id]) continue;
    seen[id] = true;
    const st = states[id];
    const def = CATALOG[it.kind];
    const domain = domainOf(id);
    const name = st.attributes.friendly_name ?? id;
    const hay = `${name} ${id} ${def?.label ?? ""}`;
    if (cards) {
      out.push({ id: `card:${id}`, group: "Device cards", label: name, hay, meta: st.state, run: () => onDevice(id) });
      continue;
    }
    const card = () => onDevice(id);
    if (!TOGGLEABLE.includes(domain)) {
      const unit = st.attributes.unit_of_measurement;
      out.push({ id: `ent:${id}`, group: "Sensors", label: name, hay, meta: unit ? `${st.state} ${unit}` : st.state, run: card, card });
      continue;
    }
    const isLight = domain === "light" || (domain === "switch" && !!def?.light);
    const info = lightInfo(st, def?.light?.color ?? "#ffc680");
    const on = isLight ? info.on : isActive(st);
    out.push({ id: `ent:${id}`, group: isLight ? "Lights" : "Appliances", label: name, hay, meta: on ? "On" : "Off", on, color: isLight ? rgbCss(info.rgb) : "#5ad7ff", run: domain === "climate" ? onClimate : () => void store().toggle(id), card });
  }
  return out;
}

type ActionContext = { plan: Plan; view: View; focusRoom: string | null; time: string; timeMode: string; weatherMode: string; quality: QualityChoice; pickCards: () => void };

/** Mode, sky, graphics and panel actions (everything that is not a room or a linked device). */
function actionCommands({ plan, view, focusRoom, time, timeMode, weatherMode, quality, pickCards }: ActionContext, h: Handlers): Cmd[] {
  const out: Cmd[] = [];
  const act = (id: string, label: string, run: () => void, meta?: string) => out.push({ id: `act:${id}`, group: "Actions", label, hay: `${label} ${meta ?? ""}`, meta, run });
  act("live", "Mode: Live", goLive, view === "live" ? "Current" : undefined);
  for (const [v, name] of [["plan", "Plan"], ["furniture", "Furniture"], ["ha", "Home Assistant"]] as const) act(`mode:${v}`, `Mode: ${name}`, () => store().setView(v), view === v ? "Current" : undefined);
  if (focusRoom) act("unfocus", "Release room focus", () => store().setFocusRoom(null), "Esc");
  const timeNow = timeMode === "auto" ? "auto" : time;
  for (const t of TIME_CHOICES) act(`time:${t}`, `Time: ${t}`, () => setTimeChoice(t), t === timeNow ? "Current" : t === "auto" ? "Real sun" : undefined);
  for (const w of WEATHER_CHOICES) act(`weather:${w}`, `Weather: ${w}`, () => useSkySettings.getState().setWeatherMode(w), w === weatherMode ? "Current" : w === "auto" ? "Follows HA" : undefined);
  for (const se of ["auto", ...SEASONS] as const) act(`season:${se}`, `Season: ${se}`, () => useSkySettings.getState().setSeasonMode(se), se === "auto" ? "Follows the date" : undefined);
  for (const hd of ["auto", "none", ...HOLIDAY_IDS] as const) act(`holiday:${hd}`, `Holiday: ${hd.toLowerCase().replace(/_/g, " ")}`, () => useSkySettings.getState().setHolidayMode(hd), hd === "auto" ? "Follows the calendar" : undefined);
  for (const e of ["studio", "garden"] as const) act(`env:${e}`, `Environment: ${e}`, () => store().setEnvironment(e));
  act("cutaway", "Toggle cut-away", () => store().setCutaway(!store().cutaway));
  act("cinema", "Cinema mode", () => { goLive(); store().setCinema(true); }, "C");
  act("export", "Export plan", () => exportPlan(store().plan));
  act("entities", "All entities...", () => h.onBrowser(), "E");
  act("climate", "Climate", h.onClimate, "H");
  for (const l of LIVE_LAYERS) act(`layer:${l}`, `Live layer: ${l}`, () => { goLive(); useLiveLayer.getState().setLayer(l); });
  const levels = sortedLevels(plan);
  if (levels.length > 1) for (const l of levels) act(`level:${l.id}`, `Level: ${l.name}`, () => store().setActiveLevel(l.id), `${l.elevation >= 0 ? "+" : "-"}${Math.abs(l.elevation).toFixed(2)} m`);
  act("building", "Building and levels...", () => { store().setView("plan"); h.onBuilding(); });
  // the panel lives in Plan mode; a mode change closes the open panel, so when coming from another mode open it once the change has settled
  act("site", "Surroundings: real buildings, trees and ground...", () => { if (store().view === "plan") h.onSite(); else { store().setView("plan"); setTimeout(h.onSite, 0); } }, "Map, satellite, neighbours");
  act("data", "Data and backups...", h.onData, "Versions, backups, files");
  act("export-all", "Export everything (one file)", () => void buildEverything().then(({ blob, name }) => download(blob, name)).catch(() => undefined), "Plan, settings, pieces, models");
  act("import-all", "Import everything...", h.onData, "Opens Data and backups");
  act("graphics", "Graphics quality...", h.onGraphics, "Light to Ultra");
  for (const c of ["auto", ...TIER_ORDER] as const) act(`graphics:${c}`, `Graphics: ${c === "auto" ? "Automatic" : TIER_LABEL[c]}`, () => useQuality.getState().choose(c), c === quality ? "Current" : undefined);
  act("plex", "Plex / Bedroom TV", h.onPlex, "P");
  act("stats", "Open statistics", h.onStats, "S");
  act("cards", "Open device card...", pickCards, "Linked devices");
  act("help", "Keyboard shortcuts", h.onHelp, "?");
  return out;
}

/** The palette's command list: rooms, linked devices and actions (or only the device cards while `cards` is on). */
export function useCommands(handlers: Handlers, cards: boolean, pickCards: () => void): Cmd[] {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const view = useStore((s) => s.view);
  const focusRoom = useStore((s) => s.focusRoom);
  const time = useStore((s) => s.time);
  const timeMode = useSkySettings((s) => s.timeMode);
  const weatherMode = useSkySettings((s) => s.weatherMode);
  const quality: QualityChoice = useQuality((s) => (s.manual ? s.tier : "auto"));
  const { onHelp, onBrowser, onClimate, onDevice, onStats, onPlex, onBuilding, onSite, onData, onGraphics } = handlers;

  return useMemo(() => {
    const h: Handlers = { onHelp, onBrowser, onClimate, onDevice, onStats, onPlex, onBuilding, onSite, onData, onGraphics };
    const devices = deviceCommands(plan, states, cards, h);
    if (cards) return devices;
    return [...roomCommands(plan), ...devices, ...actionCommands({ plan, view, focusRoom, time, timeMode, weatherMode, quality, pickCards }, h)];
  }, [plan, states, view, focusRoom, time, timeMode, weatherMode, quality, onHelp, onBrowser, onClimate, onDevice, onStats, onPlex, onBuilding, onSite, onData, onGraphics, cards, pickCards]);
}
