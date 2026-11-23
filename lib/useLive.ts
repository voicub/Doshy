"use client";
// Live statistics as app-wide hooks. One store, fed by a subscription to the app's states poll: every poll recomputes the room / house figures once,
// keeps the previous object for anything unchanged (so selectors only fire on real changes) and appends one sample to each ring buffer.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useAreas } from "./haAreas";
import { houseLive, pushSample, roomLive, stabilize, type HouseLive, type Line, type RoomLive } from "./live";
import { alignAt, fetchHistory, minMaxAvg, sampleAt } from "./stats";
import { useStore, usePoll } from "./store";

/** 5 minutes at the 3 s poll. */
const MAX_SAMPLES = 100;
/** Extra refreshes right after an action must not crowd the 5-minute window. */
const MIN_GAP_MS = 2000;

type Live = {
  rooms: Record<string, RoomLive>;
  house: HouseLive;
  /** Ring buffers: "house" = power W, `t:<roomId>` = temperature, `h:<roomId>` = humidity. */
  history: Record<string, Line>;
};

const useLive = create<Live>(() => ({ rooms: {}, house: { persons: [] }, history: {} }));

/** Recomputes the room and house figures; identities are kept for everything unchanged. */
function update() {
  const { plan, states } = useStore.getState();
  if (!Object.keys(states).length) return;
  const { entityArea, areas } = useAreas.getState();
  const ctx = { entityArea, areas };
  const cur = useLive.getState();
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  const rooms: Record<string, RoomLive> = {};
  const own: Record<string, RoomLive> = {};
  for (const r of plan.rooms) {
    const host = (r.parent && byId.get(r.parent)) || r;
    own[host.id] ??= roomLive(plan, states, host, ctx);
    rooms[r.id] = own[host.id]; // alcoves share their parent's figures
  }
  useLive.setState({ rooms: stabilize(cur.rooms, rooms), house: stabilize(cur.house, houseLive(states)) });
}

/** Appends one sample per series. Runs at every poll, also when nothing changed: a steady reading is still a point on the chart. */
function sample() {
  const { rooms, house, history } = useLive.getState();
  const now = Date.now();
  if (now - (history.house?.t.at(-1) ?? 0) < MIN_GAP_MS) return;
  const next: Record<string, Line> = { ...history }; // a sensor that drops out briefly keeps its buffer
  const add = (key: string, v: number | undefined) => { if (v !== undefined) next[key] = pushSample(history[key], now, v, MAX_SAMPLES); };
  add("house", house.powerW);
  for (const r of useStore.getState().plan.rooms) {
    if (r.parent && rooms[r.parent]) continue; // alcoves are sampled with their parent
    add(`t:${r.id}`, rooms[r.id]?.temp?.value);
    add(`h:${r.id}`, rooms[r.id]?.humidity?.value);
  }
  useLive.setState({ history: next });
}

if (typeof window !== "undefined") {
  useStore.subscribe((s, p) => { if (s.states !== p.states || s.plan !== p.plan) update(); });
  usePoll.subscribe(sample);
  useAreas.subscribe((s, p) => { if (s.entityArea !== p.entityArea) update(); });
  update();
}

/** Live figures per room id (alcoves share their parent's). Changes identity only when a value changes. */
export const useLiveRooms = () => useLive((s) => s.rooms);
/** Whole-flat figures: power, meter, outside / mean climate, people. */
export const useHouseLive = () => useLive((s) => s.house);
/** Rolling samples of the last 5 minutes: "house" (W), `t:<roomId>` (temperature), `h:<roomId>` (humidity). */
export const useLiveHistory = () => useLive((s) => s.history);

const DAY_REFRESH_MS = 300_000;
type Day = { midnightKwh?: number; maxW?: number };

/** Energy used since local midnight and the 24 h power peak, from Home Assistant history (refreshed every 5 min). Both undefined when the history is unavailable. */
export function useHouseDay(): { todayKwh?: number; maxW?: number } {
  const energy = useLive((s) => s.house.energyKwh);
  const [day, setDay] = useState<Day>({});
  useEffect(() => {
    const ctl = new AbortController();
    const load = async () => {
      try {
        const r = await fetchHistory(["sensor.house_power_energy", "sensor.house_power_power"], 24, { points: 288, signal: ctl.signal });
        const e = r.series["sensor.house_power_energy"];
        const p = r.series["sensor.house_power_power"];
        const midnight = new Date().setHours(0, 0, 0, 0);
        const at = e?.kind === "num" ? (sampleAt(e, midnight) ?? alignAt([e], e.t.find((t) => t >= midnight) ?? midnight)[0]) : undefined;
        setDay({ midnightKwh: at, maxW: p?.kind === "num" ? minMaxAvg(p.v)?.max : undefined });
      } catch {
        /* optional: the bar simply omits today's kWh and the peak */
      }
    };
    void load();
    const t = setInterval(load, DAY_REFRESH_MS);
    return () => { ctl.abort(); clearInterval(t); };
  }, []);
  const todayKwh = energy !== undefined && day.midnightKwh !== undefined && energy >= day.midnightKwh ? energy - day.midnightKwh : undefined;
  return { todayKwh, maxW: day.maxW };
}
