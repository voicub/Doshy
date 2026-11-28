// Pure: the life of an alert on one screen: new, acknowledged, snoozed, gone. `deriveAlerts` (lib/alerts.ts) says what is wrong now; this remembers what the owner
// already answered. An alert that clears is forgotten, so the same problem coming back later is new again (banner, camera and inbox note all fire once more).
import type { Alert, AlertMode } from "./alerts.ts";

export type Life = {
  /** Ids seen in the last pass: what is already "started". */
  known: ReadonlySet<string>;
  acked: ReadonlySet<string>;
  /** Snoozed alert id -> when the snooze ends (ms). */
  snoozed: ReadonlyMap<string, number>;
};

export const EMPTY_LIFE: Life = { known: new Set(), acked: new Set(), snoozed: new Map() };

/** The next pass over what is active now. `started`: alerts that were not there last time; `gone`: ids that were there and are not. Answers to an alert that went away are dropped. */
export function step(life: Life, active: readonly Alert[], now: number): { life: Life; started: Alert[]; gone: string[] } {
  const ids = new Set(active.map((a) => a.id));
  const started = active.filter((a) => !life.known.has(a.id));
  const gone = [...life.known].filter((id) => !ids.has(id));
  const acked = new Set([...life.acked].filter((id) => ids.has(id)));
  const snoozed = new Map([...life.snoozed].filter(([id, until]) => ids.has(id) && until > now));
  return { life: { known: ids, acked, snoozed }, started, gone };
}

/** The alerts to show: active, not acknowledged, not snoozed. A snooze that has run out lets the alert back. */
export const queueOf = (life: Life, active: readonly Alert[], now: number): Alert[] =>
  active.filter((a) => !life.acked.has(a.id) && (life.snoozed.get(a.id) ?? 0) <= now);

export const acknowledge = (life: Life, ids: readonly string[]): Life => ({ ...life, acked: new Set([...life.acked, ...ids]) });

export const snooze = (life: Life, ids: readonly string[], until: number): Life => ({ ...life, snoozed: new Map([...life.snoozed, ...ids.map((id): [string, number] => [id, until])]) });

/** Same alerts in the same order with the same wording: the store keeps its old list then, so nothing downstream re-renders for nothing. */
export const sameAlerts = (a: readonly Alert[], b: readonly Alert[]): boolean =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id && x.message === b[i].message && x.since === b[i].since);

export type FocusContext = {
  mode: AlertMode;
  /** The live 3D view is showing (not Plan, Furniture or Home Assistant mode). */
  live: boolean;
  /** The owner is in the middle of something: a drag, a finger on the screen, an open dialog. */
  busy: boolean;
  /** The room the camera is in now (Room mode), if any. */
  current: string | null;
  hasRoom: (id: string) => boolean;
};

/** The room the camera should go to for alerts that have just started: the most serious one that has a room, unless the camera may not be taken (banner only, editing, busy) or is already there. */
export function focusTarget(started: readonly Alert[], c: FocusContext): string | undefined {
  if (c.mode !== "focus" || !c.live || c.busy) return undefined;
  const roomId = started.find((a) => a.roomId && c.hasRoom(a.roomId))?.roomId;
  return roomId !== c.current ? roomId : undefined;
}
