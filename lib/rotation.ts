// Wall display slide scheduler: which slide is up, how long it stays, what pre-empts it and where the rotation picks up again. Pure: the caller passes the time and
// the current choices, nothing here owns a timer or reads the store. The node test runner loads this file directly; the browser side is components/WallDisplay.tsx.
import { sortedLevels } from "./levels.ts";
import { roomOrder } from "./roomIsolate.ts";
import type { Plan } from "./types.ts";
import { SLIDE_KINDS, type SlideKind } from "./wall.ts";

/** The four isometric corners the overview turns from, one per visit. */
export const CORNERS = 4;
/** A room is shown for the chosen time, but never shorter than 8 s (the camera swings in) or longer than 12 s (a room has nothing more to say). */
export const ROOM_SECONDS = { min: 8, max: 12 } as const;

export type Slide =
  | { kind: "overview"; corner: number }
  | { kind: "room"; roomId: string }
  | { kind: "clock" }
  | { kind: "house" }
  | { kind: "sky" }
  | { kind: "advisor" }
  | { kind: "alert"; alertId: string };

/** The rooms of the tour: each storey from the bottom up, in the walking order of Room mode; an open-plan space counts once when `includeOpen` (the room view brings its neighbours along). */
export const tourRooms = (plan: Plan, includeOpen: boolean): string[] => sortedLevels(plan).flatMap((l) => roomOrder(plan, l.id, includeOpen).map((hosts) => hosts[0]));

/** Everything the schedule depends on; pass the current values on every call, they may change at any time. */
export type RotationInput = {
  kinds: readonly SlideKind[];
  /** Seconds per slide. */
  secs: number;
  /** The rooms of the tour, in walking order. */
  roomIds: readonly string[];
  /** Active alerts that still need an answer, most serious first. Any of them pre-empts the rotation. */
  alertIds: readonly string[];
};

/** Where the rotation is: the slide, its place in the list (`cycle` counts rounds, the overview turns from a new corner each round) and when it came up. */
export type Cursor = {
  slide: Slide;
  cycle: number;
  index: number;
  since: number;
  /** Set while an alert holds the screen: the place to go back to when it is gone. */
  back: { cycle: number; index: number } | null;
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** How long a slide stays, in ms. */
export const holdMs = (slide: Slide, secs: number): number => 1000 * (slide.kind === "room" ? clamp(secs, ROOM_SECONDS.min, ROOM_SECONDS.max) : secs);

/** The slides of one round, in fixed order (overview, rooms, clock, house). Nothing chosen (or no rooms and only the tour chosen) falls back to the clock: a wall display is never blank. */
export function slidesOf(input: Pick<RotationInput, "kinds" | "roomIds">, cycle: number): Slide[] {
  const out: Slide[] = [];
  for (const k of SLIDE_KINDS) {
    if (!input.kinds.includes(k)) continue;
    if (k === "overview") out.push({ kind: "overview", corner: ((cycle % CORNERS) + CORNERS) % CORNERS });
    else if (k === "rooms") for (const roomId of input.roomIds) out.push({ kind: "room", roomId });
    else out.push({ kind: k });
  }
  return out.length ? out : [{ kind: "clock" }];
}

/** The slide at (cycle, index); an index past the end rolls into the next round. */
function place(input: RotationInput, cycle: number, index: number, now: number): Cursor {
  let c = cycle;
  let i = Math.max(0, index);
  let list = slidesOf(input, c);
  if (i >= list.length) {
    c += 1;
    i = 0;
    list = slidesOf(input, c);
  }
  return { slide: list[i], cycle: c, index: i, since: now, back: null };
}

const alertSlide = (alertId: string): Slide => ({ kind: "alert", alertId });

/** The first slide of a rotation that starts now. */
export function start(input: RotationInput, now: number): Cursor {
  const cur = place(input, 0, 0, now);
  return input.alertIds.length ? step(cur, input, now) : cur;
}

/** Is the slide on screen still part of this round (its kind is chosen, its room still exists)? */
const wanted = (slide: Slide, cycle: number, input: RotationInput): boolean => slidesOf(input, cycle).some((s) => slideKey(s) === slideKey(slide));

/**
 * The cursor for time `now`. Returns the same object while nothing changes, so a caller can compare identities.
 * - An active alert pre-empts at once, whatever slide is up; with several, they take turns (each for the slide time). Where the rotation was is remembered.
 * - When the alerts are gone the rotation resumes at the slide it was interrupted on, with a fresh timer.
 * - Otherwise the slide goes when its time is up, or at once if it was removed from the choices (a room deleted, a kind switched off).
 */
export function step(cur: Cursor, input: RotationInput, now: number): Cursor {
  const first = input.alertIds[0];
  if (first !== undefined) {
    if (cur.slide.kind !== "alert") return { slide: alertSlide(first), cycle: cur.cycle, index: cur.index, since: now, back: { cycle: cur.cycle, index: cur.index } };
    const at = input.alertIds.indexOf(cur.slide.alertId);
    if (at < 0) return { ...cur, slide: alertSlide(first), since: now };
    if (input.alertIds.length > 1 && now - cur.since >= holdMs(cur.slide, input.secs)) return { ...cur, slide: alertSlide(input.alertIds[(at + 1) % input.alertIds.length]), since: now };
    return cur;
  }
  if (cur.slide.kind === "alert") {
    const b = cur.back ?? { cycle: cur.cycle, index: cur.index };
    return place(input, b.cycle, b.index, now);
  }
  if (!wanted(cur.slide, cur.cycle, input)) return place(input, cur.cycle, cur.index, now);
  if (now - cur.since < holdMs(cur.slide, input.secs)) return cur;
  return place(input, cur.cycle, cur.index + 1, now);
}

/** When `step` next has something to do on its own (ms since 1970), or Infinity: one alert holds the screen until it is answered. */
export function dueAt(cur: Cursor, input: RotationInput): number {
  if (cur.slide.kind === "alert" && input.alertIds.length < 2) return Infinity;
  return cur.since + holdMs(cur.slide, input.secs);
}

/** A stable text for a slide: two slides with the same key look the same, so the screen does not fade between them. */
export const slideKey = (s: Slide): string => (s.kind === "room" ? `room:${s.roomId}` : s.kind === "alert" ? `alert:${s.alertId}` : s.kind === "overview" ? `overview:${s.corner}` : s.kind);

/** Does the slide show the 3D scene (as opposed to a full-screen card)? */
export const showsScene = (s: Slide): boolean => s.kind === "overview" || s.kind === "room";
