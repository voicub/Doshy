"use client";
import { useEffect, useState } from "react";
import { localOffsetMinutes, sunSamples, type Place } from "@/lib/daylight";
import { SAMPLE_LIFT, buildScene, type SunScene } from "@/lib/daylightRay";
import { STEP_MIN, drive, gridOf, roomRects, startRun, type DayResult, type Scheduler } from "@/lib/daylightRun";
import { elevationOf, levelIdOf } from "@/lib/levels";
import { useKnobs } from "@/lib/quality";
import { neighboursOf } from "@/lib/daylightNeighbours";
import { useSiteState } from "@/lib/siteStore";
import type { Plan, Room } from "@/lib/types";
import { useStore } from "@/lib/store";

export type DayState = { status: "idle" | "running" | "ready"; progress: number; result: DayResult | null; scene: SunScene | null };
type Entry = { result: DayResult; scene: SunScene };
const IDLE: DayState = { status: "idle", progress: 0, result: null, scene: null };

const SLICE_MS = 8; // one slice of work: under half a frame at 30 fps, so a Raspberry Pi keeps drawing and answering touches
const SETTLE_MS = 250; // a drag in the plan changes the plan many times a second: start after it settles
const PER_PLAN = 24; // results kept per plan object

/** Results per plan OBJECT (every edit makes a new one, which is what drops the old answers), then per room / date / place / grid / surroundings. */
const cache = new WeakMap<Plan, Map<string, Entry>>();

const scheduler: Scheduler = {
  now: () => performance.now(),
  later: (fn) => {
    const id = setTimeout(fn, 0);
    return () => clearTimeout(id);
  },
};


/**
 * Hours of direct sun on a room's floor for one date, computed in time slices (never freezes the screen), cancelled when anything it depends on changes, and remembered
 * until the plan changes. The time of day is not an input: the day's answer is the same whatever the time slider says.
 */
export function useDayResult(room: Room | undefined, year: number, doy: number, place: Place): DayState {
  const plan = useStore((s) => s.plan);
  const data = useSiteState((s) => s.data);
  const maxCells = useKnobs().sunGrid;
  const [state, setState] = useState<DayState>(IDLE);
  const roomId = room?.id;
  const { lat, lon } = place;

  useEffect(() => {
    const target = roomId ? plan.rooms.find((r) => r.id === roomId) : undefined;
    if (!target) return setState(IDLE);
    const key = [target.id, target.x, target.y, target.w, target.h, year, doy, lat.toFixed(3), lon.toFixed(3), plan.bearing ?? 0, maxCells, data ? `${data.fetchedAt}:${data.buildings.length}` : "-"].join("|");
    const mine = cache.get(plan)?.get(key);
    if (mine) return setState({ status: "ready", progress: 1, ...mine });

    let cancel = () => {};
    const timer = setTimeout(() => {
      const grid = gridOf(roomRects(plan.rooms, target), elevationOf(plan, levelIdOf(plan, target)) + SAMPLE_LIFT, maxCells);
      if (!grid) return setState(IDLE);
      const scene = buildScene(plan, neighboursOf(plan, data));
      const samples = sunSamples({ lat, lon }, year, doy, localOffsetMinutes(year, doy), STEP_MIN);
      setState({ status: "running", progress: 0, result: null, scene });
      cancel = drive(startRun({ scene, grid, samples, bearing: plan.bearing ?? 0 }), scheduler, {
        budgetMs: SLICE_MS,
        onProgress: (progress) => setState((s) => ({ ...s, progress })),
        onDone: (result) => {
          const kept = cache.get(plan) ?? new Map<string, Entry>();
          if (kept.size >= PER_PLAN) kept.delete(kept.keys().next().value ?? "");
          cache.set(plan, kept.set(key, { result, scene }));
          setState({ status: "ready", progress: 1, result, scene });
        },
      });
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [plan, data, roomId, year, doy, lat, lon, maxCells]);

  return state;
}
