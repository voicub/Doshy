"use client";
import { useMemo } from "react";
import { CATALOG } from "@/lib/catalog";
import { ALERT_MODE_LABEL, ALERT_MODES } from "@/lib/alerts";
import { useAlerts } from "@/lib/alertsStore";
import { domainOf, isActive, TOGGLEABLE, type HAState } from "@/lib/ha";
import { lightInfo, rgbCss } from "@/lib/light";
import { LIVE_LAYERS, useLiveLayer } from "@/lib/liveLayer";
import { HEAT_METRICS, METRICS } from "@/lib/heatmap";
import { showHeat } from "@/lib/heatmapStore";
import { sortedLevels } from "@/lib/levels";
import { HOLIDAY_IDS, SEASONS } from "@/lib/season";
import { useSkySettings } from "@/lib/sky";
import { TIER_LABEL, TIER_ORDER, useQuality, type QualityChoice } from "@/lib/quality";
import { useReplay } from "@/lib/replay";
import { useStore, type View } from "@/lib/store";
import type { Plan } from "@/lib/types";
import { openLines } from "../plan/linesUi";
import { buildEverything, download } from "@/lib/everythingClient";
import { useActivePlan } from "@/lib/activePlan";
import { exportPlan } from "./planIO";
import { planCommands, switchCommands } from "./planCommands";
import type { PlansIntent } from "./planUi";
import { TIME_CHOICES, WEATHER_CHOICES, setTimeChoice } from "./skyControls";
import { useEnergyUi } from "./energyUi";
import { usePeopleUi } from "./peopleUi";
import { sceneCommands } from "./sceneCommands";
import { shareCommands } from "./shareCommands";
import { themeCommands } from "./themeCommands";
import { walkCommands } from "./walkCommands";
import { useSkyChartUi } from "./skyChartUi";
import { openMaintenance } from "./maintenanceUi";
import { useHealthUi } from "./healthUi";
import { useAdvisorUi } from "./advisorUi";

type Group = "Rooms" | "Lights" | "Appliances" | "Sensors" | "Device cards" | "Plans" | "Scenes" | "Actions";
/** `stay`: running it narrows the palette (to device cards, to plans) instead of closing it. */
export type Cmd = { id: string; group: Group; label: string; hay: string; meta?: string; color?: string; on?: boolean; stay?: boolean; run: () => void; /** Shift+Enter: open the entity's device card */ card?: () => void };
export type Handlers = { onHelp: () => void; onBrowser: (q?: string) => void; onClimate: () => void; onDevice: (entity: string) => void; onStats: () => void; onPlex: () => void; onBuilding: () => void; onSite: () => void; onDaylight: () => void; onTrace: () => void; onData: () => void; onGraphics: () => void; onPlans: (intent?: PlansIntent) => void; onScenes: () => void };

/** What the palette lists: everything, only the linked devices ("Open device card..."), only the plans ("Switch plan..."), or the command box ("Ask Doshy..."). */
export type PaletteMode = "all" | "cards" | "plans" | "ask";

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
  act("cutaway", "Toggle cut-away (all walls / auto)", () => store().setCutaway(!store().cutaway));
  act("cinema", "Cinema mode", () => { goLive(); store().setCinema(true); }, "C");
  act("export", "Export plan", () => exportPlan(store().plan));
  act("entities", "All entities...", () => h.onBrowser(), "E");
  act("climate", "Climate", h.onClimate, "H");
  act("maintenance", "Maintenance", () => openMaintenance(), "Upkeep, batteries, filters and recurring tasks");
  for (const l of LIVE_LAYERS) act(`layer:${l}`, `Live layer: ${l}`, () => { goLive(); useLiveLayer.getState().setLayer(l); });
  for (const m of [...HEAT_METRICS, "off"] as const) act(`heat:${m}`, `Heat map: ${m === "off" ? "Off" : METRICS[m].label}`, () => { goLive(); showHeat(m); }, m === "off" ? "No map on the floors" : "Colours on the floors from your sensors");
  const levels = sortedLevels(plan);
  if (levels.length > 1) for (const l of levels) act(`level:${l.id}`, `Level: ${l.name}`, () => store().setActiveLevel(l.id), `${l.elevation >= 0 ? "+" : "-"}${Math.abs(l.elevation).toFixed(2)} m`);
  act("building", "Building and levels...", () => { store().setView("plan"); h.onBuilding(); });
  act("lines:road", "Garden lines: road", () => openLines((ui) => ui.pickPath("road_asphalt")), "Draw a road on the plan");
  act("lines:walkway", "Garden lines: walkway", () => openLines((ui) => ui.pickPath("walk_paved")), "Draw a footpath on the plan");
  act("lines:fence", "Garden lines: fence", () => openLines((ui) => ui.pickFence("fence_picket")), "Draw a fence on the plan");
  act("lines:lights", "Garden lines: street lights", () => openLines((ui) => ui.pickLight("light_street")), "Lamps along a line");
  // the panel lives in Plan mode; a mode change closes the open panel, so when coming from another mode open it once the change has settled
  act("site", "Surroundings: real buildings, trees and ground...", () => { if (store().view === "plan") h.onSite(); else { store().setView("plan"); setTimeout(h.onSite, 0); } }, "Map, satellite, neighbours");
  act("daylight", "Sunlight in this room...", () => { const v = store().view; if (v === "plan" || v === "live") h.onDaylight(); else { store().setView("live"); setTimeout(h.onDaylight, 0); } }, "Sun path, hours of direct sun");
  act("night-sky", "Night sky...", () => useSkyChartUi.getState().show(), "Tonight’s stars, planets, Moon and ISS");
  act("trace", "Floor plan image to trace over...", () => { if (store().view === "plan") h.onTrace(); else { store().setView("plan"); setTimeout(h.onTrace, 0); } }, "Photo or scan under the plan");
  act("measure", "Measure on the plan", () => { store().setView("plan"); store().setTool("ruler"); }, "Distances, wall lengths, does it fit");
  act("notes", "Notes on the plan", () => { store().setView("plan"); store().setTool("annotate"); }, "Notes, arrows, zones to remember");
  act("pipes", "Pipes: water and gas", () => { store().setView("plan"); store().setTool("pipes"); }, "Draw utility lines and place shut-off valves");
  act("data", "Data and backups...", h.onData, "Versions, backups, files");
  act("export-all", "Export everything (one file)", () => void buildEverything().then(({ blob, name }) => download(blob, name)).catch(() => undefined), "Plan, settings, pieces, models");
  act("import-all", "Import everything...", h.onData, "Opens Data and backups");
  act("graphics", "Graphics quality...", h.onGraphics, "Light to Ultra");
  act("lighting", "Lighting: real sky...", h.onGraphics, "Opens Graphics; light from a real sky");
  act("people", "People: choose who shows up in the home", () => usePeopleUi.getState().setOpen(true), "Colours, letters, rooms");
  for (const c of ["auto", ...TIER_ORDER] as const) act(`graphics:${c}`, `Graphics: ${c === "auto" ? "Automatic" : TIER_LABEL[c]}`, () => useQuality.getState().choose(c), c === quality ? "Current" : undefined);
  act("alerts:ack", "Alerts: acknowledge all", () => useAlerts.getState().acknowledge(), "Silence what is showing");
  for (const m of ALERT_MODES) act(`alerts:${m}`, `Alerts: ${ALERT_MODE_LABEL[m]}`, () => useAlerts.getState().setMode(m), "Leak, smoke, alarm, open doors");
  act("plex", "Plex / Bedroom TV", h.onPlex, "P");
  act("stats", "Open statistics", h.onStats, "S");
  act("homehealth", "Home health", () => useHealthUi.getState().show(), "Unusual sensors, leaks, mould, batteries");
  act("advisor", "Advisor", () => useAdvisorUi.getState().show(), "Cost, comfort, best appliance time, solar");
  // the Energy panel lives in Live mode and a mode change closes it, so from another mode open it once the change has settled
  const energy = (setup: boolean) => { const open = () => (setup ? useEnergyUi.getState().openSetup() : useEnergyUi.getState().set(true)); if (view === "live") open(); else { goLive(); setTimeout(open, 0); } };
  act("energy", "Energy: open", () => energy(false), "N");
  act("energy-sources", "Energy sources...", () => energy(true), "Solar, grid, battery, car charger, price");
  act("history", "History replay", () => { goLive(); useReplay.getState().show(); }, "Y");
  out.push({ id: "act:cards", group: "Actions", label: "Open device card...", hay: "Open device card... Linked devices", meta: "Linked devices", run: pickCards, stay: true });
  act("help", "Keyboard shortcuts", h.onHelp, "?");
  return out;
}

/** The palette's command list: rooms, linked devices, plan actions and the rest of the actions (or only the device cards, or only the plans, while the palette is narrowed). */
export function useCommands(handlers: Handlers, mode: PaletteMode, narrow: (mode: PaletteMode) => void): Cmd[] {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const view = useStore((s) => s.view);
  const focusRoom = useStore((s) => s.focusRoom);
  const time = useStore((s) => s.time);
  const timeMode = useSkySettings((s) => s.timeMode);
  const weatherMode = useSkySettings((s) => s.weatherMode);
  const quality: QualityChoice = useQuality((s) => (s.manual ? s.tier : "auto"));
  const plans = useActivePlan((s) => s.list);
  const activePlanId = useActivePlan((s) => s.id);
  const { onHelp, onBrowser, onClimate, onDevice, onStats, onPlex, onBuilding, onSite, onDaylight, onTrace, onData, onGraphics, onPlans, onScenes } = handlers;

  return useMemo(() => {
    const h: Handlers = { onHelp, onBrowser, onClimate, onDevice, onStats, onPlex, onBuilding, onSite, onDaylight, onTrace, onData, onGraphics, onPlans, onScenes };
    if (mode === "ask") return []; // the command box takes the palette's body
    if (mode === "plans") return switchCommands(plans, activePlanId);
    const devices = deviceCommands(plan, states, mode === "cards", h);
    if (mode === "cards") return devices;
    const pickCards = () => narrow("cards");
    const showPlans = () => narrow("plans");
    return [...roomCommands(plan), ...walkCommands(plan), ...devices, ...planCommands({ list: plans, activeId: activePlanId, onPlans, showPlans }), ...sceneCommands(plan, states, onScenes, () => narrow("ask")), ...shareCommands(), ...themeCommands(), ...actionCommands({ plan, view, focusRoom, time, timeMode, weatherMode, quality, pickCards }, h)];
  }, [plan, states, view, focusRoom, time, timeMode, weatherMode, quality, plans, activePlanId, onHelp, onBrowser, onClimate, onDevice, onStats, onPlex, onBuilding, onSite, onDaylight, onTrace, onData, onGraphics, onPlans, onScenes, mode, narrow]);
}
