// Read-only questions of the command box ("is the bathroom window open?", "which lights are on?", "how warm is the bedroom?"), answered from the states Doshy already has.
// Nothing is sent anywhere. Pure; the node test runner loads this file directly.
import { isOpenState, type HAState } from "./ha.ts";
import { KIND_NOUN, KIND_WORDS, pluralise } from "./commandWords.ts";
import type { Contact, DeviceKind, SceneDevice } from "./sceneDevices.ts";

export type AnswerContext = {
  states: Record<string, HAState>;
  devices: readonly SceneDevice[];
  contacts: readonly Contact[];
  rooms: readonly { id: string; name: string; tempEntity?: string }[];
};
/** The rooms asked about, or "all". */
export type Scope = readonly string[] | "all";

const inScope = (scope: Scope, roomId: string | null) => scope === "all" || (roomId !== null && scope.includes(roomId));
const list = (names: readonly string[]) => (names.length <= 6 ? names : [...names.slice(0, 6), `${names.length - 6} more`]).join(", ");
const where = (scope: Scope, ctx: AnswerContext) => (scope === "all" ? "" : ` in ${ctx.rooms.filter((r) => scope.includes(r.id)).map((r) => r.name).join(" and ")}`);

const isGone = (st?: HAState) => !st || st.state === "unavailable" || st.state === "unknown";

/** Is this device "on"/"open"/"playing" right now? */
function isAbout(d: SceneDevice, st: HAState | undefined): boolean {
  if (isGone(st) || !st) return false;
  if (d.kind === "cover") return st.state === "open" || st.state === "opening" || (st.attributes.current_position ?? 0) > 0;
  if (d.kind === "media") return !["off", "standby"].includes(st.state);
  if (d.kind === "climate") return st.state !== "off";
  return st.state === "on";
}

/** "Is the bathroom window open?": the window and door contacts in the rooms asked about. */
export function answerContacts(words: readonly string[], scope: Scope, ctx: AnswerContext): string {
  const wantDoors = words.some((w) => w === "door" || w === "doors");
  const wantWindows = words.some((w) => w === "window" || w === "windows");
  const pool = ctx.contacts.filter((c) => inScope(scope, c.roomId) && (wantDoors === wantWindows || (wantDoors ? c.kind === "door" : c.kind === "window")));
  const noun = wantDoors && !wantWindows ? "door" : wantWindows && !wantDoors ? "window" : "window or door";
  if (!pool.length) return `I do not know of a ${noun} sensor${where(scope, ctx)}. Link a contact sensor to a window or door in Home Assistant mode and I can tell you.`;
  const open = pool.filter((c) => isOpenState(ctx.states[c.entity]));
  const unknown = pool.filter((c) => isGone(ctx.states[c.entity]));
  // "Window" alone says nothing, so it gets its room; a name that already carries the room ("Kitchen window") stands alone
  const label = (c: Contact) => (c.room === "Elsewhere" || c.name.toLowerCase().includes(c.room.toLowerCase()) ? c.name : /^(window|door)$/i.test(c.name) ? `${c.room} ${c.name.toLowerCase()}` : `${c.name} (${c.room})`);
  if (pool.length === 1) {
    const [c] = pool;
    return unknown.length ? `${label(c)} is not reporting right now.` : `${label(c)} is ${open.length ? "open" : "closed"}.`;
  }
  if (!open.length) return `All ${pool.length} ${noun}s${where(scope, ctx)} are closed${unknown.length ? ` (${unknown.length} not reporting)` : ""}.`;
  return `Open now: ${list(open.map(label))}. The other ${pool.length - open.length} ${pool.length - open.length === 1 ? "is" : "are"} closed${unknown.length ? ` or not reporting` : ""}.`;
}

/** "Which lights are on?" / "is the TV on?" / "are the curtains open?" */
export function answerState(kinds: readonly DeviceKind[], scope: Scope, ctx: AnswerContext): string {
  const parts: string[] = [];
  for (const kind of kinds) {
    const pool = ctx.devices.filter((d) => d.kind === kind && inScope(scope, d.roomId));
    const noun = KIND_NOUN[kind];
    if (!pool.length) {
      parts.push(`I do not know of any ${noun[1]}${where(scope, ctx)}.`);
      continue;
    }
    const active = pool.filter((d) => isAbout(d, ctx.states[d.entity]));
    const verb = kind === "cover" ? "open" : "on";
    if (pool.length === 1) parts.push(`${pool[0].name} is ${active.length ? verb : kind === "cover" ? "closed" : "off"}.`);
    else if (!active.length) parts.push(`No ${noun[1]} are ${verb}${where(scope, ctx)}.`);
    else parts.push(`${active.length} of ${pluralise(pool.length, noun)} ${active.length === 1 ? "is" : "are"} ${verb}${where(scope, ctx)}: ${list(active.map((d) => d.name))}.`);
  }
  return parts.join(" ");
}

/** "What is the temperature in the bedroom?": the room's own sensor, else the thermostats there. */
export function answerTemperature(scope: Scope, ctx: AnswerContext): string {
  const rooms = ctx.rooms.filter((r) => scope === "all" || scope.includes(r.id));
  const readings = rooms.flatMap((r) => {
    const st = r.tempEntity ? ctx.states[r.tempEntity] : undefined;
    const value = st && !isGone(st) ? (Number.isFinite(Number(st.state)) ? Number(st.state) : st.attributes.current_temperature) : undefined;
    const climate = ctx.devices.find((d) => d.kind === "climate" && d.roomId === r.id);
    const fallback = climate ? ctx.states[climate.entity]?.attributes.current_temperature : undefined;
    const v = typeof value === "number" ? value : fallback;
    return typeof v === "number" ? [`${r.name} is ${Math.round(v * 10) / 10}°`] : [];
  });
  return readings.length ? `${readings.join(". ")}.` : `I have no temperature reading${where(scope, ctx)}. Link a temperature sensor to the room in Home Assistant mode.`;
}

export const isKindWord = (w: string) => Object.values(KIND_WORDS).some((list) => list.includes(w));
