// When does the sun shine into each room? The "Sunlight in this room" analysis (lib/daylight*.ts: floor grid, rays through the windows, past walls, roof and neighbours) run for
// today and tomorrow over the plan's rooms, with a coarse grid and in short time slices so a Raspberry Pi's screen never freezes. The result is the stretches of direct sun per room, on
// the real time line, for the advisor's "close the curtains" advice. Pure: the scheduler is passed in, so tests run it by hand.
import { roomArea } from "./blueprint.ts";
import { addDays, dayStart, offsetMin, partsOf } from "./advisorTime.ts";
import { dayOfYear, instantOf, sunSamples, type Place } from "./daylight.ts";
import { SAMPLE_LIFT, buildScene, type Neighbour, type SunScene } from "./daylightRay.ts";
import { STEP_MIN, drive, gridOf, roomRects, startRun, sunIntervals, type Scheduler } from "./daylightRun.ts";
import { elevationOf, levelIdOf } from "./levels.ts";
import type { Plan, Room } from "./types.ts";
import type { RoomSun } from "./advisor.ts";

/** Most rooms analysed: the biggest ones (a plan with 30 rooms must not cost 30 analyses). */
export const MAX_ROOMS = 8;
/** Cells along a room's long side: coarse on purpose, the advisor needs "from when to when", not a picture. */
export const SUN_CELLS = 10;

/** Whole rooms (not alcoves or door thresholds) of the plan that can have a window: the biggest first, at most MAX_ROOMS. */
export function sunRooms(plan: Plan): Room[] {
  if (!plan.openings.some((o) => o.type === "window")) return [];
  return plan.rooms
    .filter((r) => !r.parent && Math.min(r.w, r.h) >= 1.2)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, MAX_ROOMS);
}

type Sun = Pick<RoomSun, "intervals">;

/** The stretches of direct sun of one room on one local day (`day` = its midnight). Resolves when the time-sliced run is done, or with nothing when `cancelled()` turns true. */
function runDay(plan: Plan, scene: SunScene, room: Room, place: Place, day: number, zone: string, o: { sched: Scheduler; budgetMs: number; cells: number; cancelled: () => boolean }): Promise<Sun["intervals"]> {
  const noon = day + 12 * 3_600_000;
  const p = partsOf(noon, zone);
  const doy = dayOfYear(p.y, p.m - 1, p.d);
  const off = offsetMin(noon, zone);
  const grid = gridOf(roomRects(plan.rooms, room), elevationOf(plan, levelIdOf(plan, room)) + SAMPLE_LIFT, o.cells);
  const samples = sunSamples(place, p.y, doy, off, STEP_MIN);
  if (!grid || !samples.length) return Promise.resolve([]);
  const { promise, resolve } = Promise.withResolvers<Sun["intervals"]>();
  let stop = () => {};
  stop = drive(startRun({ scene, grid, samples, bearing: plan.bearing ?? 0 }), o.sched, {
    budgetMs: o.budgetMs,
    // the run goes on in slices; between two of them is the moment to notice that nobody wants the answer any more
    onProgress: () => {
      if (o.cancelled()) {
        stop();
        resolve([]);
      }
    },
    onDone: (result) =>
      resolve(
        sunIntervals(result.steps).map((iv) => {
          const inside = samples.filter((s) => s.minutes >= iv.from && s.minutes < iv.to);
          const steps = result.steps.filter((s) => s.minutes >= iv.from && s.minutes < iv.to);
          const mid = inside[Math.floor(inside.length / 2)];
          return {
            start: instantOf(p.y, doy, iv.from / 60, off).getTime(),
            end: instantOf(p.y, doy, iv.to / 60, off).getTime(),
            azimuth: mid?.azimuth ?? 180,
            lit: steps.length ? steps.reduce((sum, s) => sum + s.lit, 0) / steps.length : 0,
          };
        }),
      ),
  });
  return promise;
}

/**
 * Today's and tomorrow's direct sun in each room. `neighbours` are the real buildings around (shadow casters), as the Sunlight panel passes them. Rooms are done one after the
 * other, each day in slices of `budgetMs`; `cancelled` is polled so a closed panel stops the work at once. Rooms with no sun at all are left out.
 */
export async function analyseSun(
  plan: Plan,
  rooms: readonly Room[],
  place: Place,
  now: number,
  zone: string,
  o: { sched: Scheduler; budgetMs: number; cells?: number; neighbours?: readonly Neighbour[]; cancelled: () => boolean },
): Promise<Omit<RoomSun, "curtains">[]> {
  const scene = buildScene(plan, o.neighbours ?? []);
  const today = dayStart(now, zone);
  const out: Omit<RoomSun, "curtains">[] = [];
  for (const room of rooms) {
    const intervals: Sun["intervals"] = [];
    for (const day of [today, addDays(today, 1, zone)]) {
      if (o.cancelled()) return out;
      intervals.push(...(await runDay(plan, scene, room, place, day, zone, { sched: o.sched, budgetMs: o.budgetMs, cells: o.cells ?? SUN_CELLS, cancelled: o.cancelled })));
    }
    if (intervals.length) out.push({ roomId: room.id, room: room.name, areaM2: roomArea(plan, room), intervals });
  }
  return out;
}
