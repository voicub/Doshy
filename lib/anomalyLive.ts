// The rules that need no history, only what Home Assistant says now and since when: a sensor that went quiet, a nearly flat battery, a window open while the heating runs, the garage door
// open in the middle of the night. They are cheap, so the watch re-evaluates them every minute without touching the server. Pure.
import type { Anomaly, AnomalySeverity, RuleId, Subject } from "./anomalyTypes.ts";
import { clockAt, duration, hourOf, subjectName } from "./anomalyText.ts";
import type { HAState } from "./ha.ts";

export type Live = {
  now: number;
  zone: string | null;
  states: Record<string, HAState>;
  subjects: readonly Subject[];
  /** when Home Assistant last heard from each sensor (from the history answer); absent before the first scan */
  seen: Record<string, number>;
  /** sensors whose readings normally change from hour to hour: only those can be called silent (a contact sensor may rest for weeks) */
  chatty: ReadonlySet<string>;
};

const HOUR = 3_600_000;
export const UNAVAILABLE_HOURS = 6;
export const SILENT_HOURS = 24;
const OPEN_WINDOW_MIN = 30;
const GARAGE_OPEN_MIN = 10;
/** Local hours counted as night for the garage door: 22:00 to 04:59. */
const isNight = (hour: number): boolean => hour >= 22 || hour < 5;
const LOW_BATTERY = 15;
const FLAT_BATTERY = 5;

function live(s: Subject, rule: RuleId, severity: AnomalySeverity, title: string, message: string, hints: string[], since: number): Anomaly {
  const { entity, name, roomId, roomName, itemId, openingId } = s;
  return { id: `${rule}:${entity}`, rule, entity, name, roomId, roomName, itemId, openingId, severity, title, message, hints, since, teachable: false, ratio: 1 };
}

const changedAt = (st: HAState): number => (st.last_changed ? Date.parse(st.last_changed) : NaN);
const isOpen = (st: HAState): boolean => st.state === "on" || st.state === "open" || st.state === "opening";

/** A running heating or cooling system in the same room (or, when nothing says which room, anywhere). */
function climateOn(s: Subject, L: Live): "heating" | "cooling" | null {
  for (const c of L.subjects) {
    const st = c.kind === "climate" ? L.states[c.entity] : undefined;
    if (!st || (c.roomId && s.roomId && c.roomId !== s.roomId)) continue;
    const action = st.attributes.hvac_action;
    if (action === "heating" || (action === undefined && (st.state === "heat" || st.state === "heat_cool"))) return "heating";
    if (action === "cooling" || (action === undefined && st.state === "cool")) return "cooling";
  }
  return null;
}

const where = (s: Subject): string => (s.roomName && !s.name.toLowerCase().includes(s.roomName.toLowerCase()) ? `${s.name} (${s.roomName})` : s.name);

export function liveRules(s: Subject, L: Live): Anomaly[] {
  const st = L.states[s.entity];
  if (!st) return [];
  const out: Anomaly[] = [];
  const at = changedAt(st);
  if (st.state === "unavailable") {
    if (Number.isFinite(at) && L.now - at >= UNAVAILABLE_HOURS * HOUR) {
      out.push(live(s, "unavailable", "notice", "Not responding", `${s.name} has been unavailable for ${duration(L.now - at)}`, ["Check its battery, power and Wi-Fi or Zigbee signal.", "If it was removed on purpose, press This is normal and Doshy stops mentioning it."], at));
    }
    return out;
  }
  if (s.kind === "battery" || s.kind === "battery_flag") {
    const level = s.kind === "battery" ? Number(st.state) : st.state === "on" ? 0 : NaN;
    if (Number.isFinite(level) && level <= LOW_BATTERY) {
      const text = s.kind === "battery" ? `${subjectName(s.name, "battery")} battery is at ${Math.round(level)}%: time to replace it` : `${subjectName(s.name, "battery")} reports a low battery`;
      out.push(live(s, "battery", level <= FLAT_BATTERY ? "warning" : "notice", "Low battery", text, ["Swap the battery soon: a flat one makes the device go quiet or miss events."], Number.isFinite(at) ? at : L.now));
    }
    return out;
  }
  if (s.kind === "window" && isOpen(st) && Number.isFinite(at) && L.now - at >= OPEN_WINDOW_MIN * 60_000) {
    const on = climateOn(s, L);
    if (on) {
      out.push(live(s, "window_heating", "notice", `Window open while ${on === "heating" ? "heating" : "cooling"}`, `${where(s)} has been open for ${duration(L.now - at)} while the ${on === "heating" ? "heating is on" : "air conditioning is on"}`,
        [`Close it, or turn the ${on === "heating" ? "heating" : "air conditioning"} down: the warm air goes straight outside.`, "If you air the room on purpose, a few minutes with the window wide open does more than a long time ajar."], at));
    }
  }
  if (s.kind === "garage" && isOpen(st) && Number.isFinite(at) && L.now - at >= GARAGE_OPEN_MIN * 60_000 && isNight(hourOf(L.now, L.zone))) {
    out.push(live(s, "garage_night", "notice", "Garage open at night", `${where(s)} has been open at night since ${clockAt(at, L.zone)}`, ["Close it, or check that nobody is in the garage.", "If you leave it open at night on purpose, press This is normal."], at));
  }
  const seen = L.seen[s.entity];
  if (L.chatty.has(s.entity) && seen !== undefined && L.now - seen >= SILENT_HOURS * HOUR) {
    out.push(live(s, "stale", "notice", "Has gone quiet", `${s.name} has not reported for ${duration(L.now - seen)}`, ["Check its battery and signal; the value you see on the model may be out of date.", "A sensor that was moved or switched off on purpose can be hidden with This is normal."], seen));
  }
  return out;
}
