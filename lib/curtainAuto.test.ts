process.env.TZ = "Europe/Bucharest"; // before any Date is made: daylight-saving days are tested for real
import assert from "node:assert/strict";
import { test } from "node:test";
import { DUE_MS, MAX_TRIES, RECENT_MS, decide, localDay, parseTime, type CoverReading, type Decision, type Memory, type Rule, type SunReading } from "./curtainAuto.ts";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const sun = (elevation: number, rising: boolean): SunReading => ({ state: elevation >= 0 ? "above_horizon" : "below_horizon", elevation, rising });
const open: CoverReading = { state: "open", current_position: 100 };
const shut: CoverReading = { state: "closed", current_position: 0 };
const DAWN: Rule = { dawn: true };

/** One look every call; the memory is carried over as the server loop does, and a close / open changes the cover. */
function sim(rule: Rule = DAWN, cover: CoverReading | undefined = open) {
  let memory: Memory = {};
  let c: CoverReading | undefined = cover;
  return {
    get memory() {
      return memory;
    },
    set memory(m: Memory) {
      memory = m;
    },
    get cover() {
      return c;
    },
    set cover(v: CoverReading | undefined) {
      c = v;
    },
    look(now: Date, s: SunReading | undefined, r: Rule = rule): Decision {
      const d = decide({ now, sun: s, cover: c, rule: r, memory });
      memory = d.memory;
      if (d.action === "close") c = shut;
      if (d.action === "open") c = open;
      return d;
    },
  };
}

test("parseTime accepts HH:MM only", () => {
  assert.deepEqual(parseTime("00:00"), [0, 0]);
  assert.deepEqual(parseTime("18:30"), [18, 30]);
  assert.deepEqual(parseTime("23:59"), [23, 59]);
  for (const bad of ["24:00", "7:30", "12:60", "12:5", "1230", "", "12:30:00", "ab:cd", undefined]) assert.equal(parseTime(bad), undefined, String(bad));
});

test("dawn is seen when the sun crosses -6 degrees, and the curtain closes once", () => {
  const s = sim();
  assert.equal(s.look(at(2026, 6, 10, 4, 0), sun(-9, true)).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 4, 1), sun(-6.2, true)).action, "none");
  const d = s.look(at(2026, 6, 10, 4, 2), sun(-5.9, true));
  assert.equal(d.action, "close");
  assert.equal(d.log, true);
  assert.equal(d.memory.dawnDay, "2026-06-10");
  assert.equal(d.memory.closedDay, "2026-06-10");
  for (let i = 3; i < 200; i++) assert.equal(s.look(at(2026, 6, 10, 4, i), sun(-5 + i / 10, true)).action, "none");
});

test("exactly -6 degrees counts as the crossing", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 4, 0), sun(-6.1, true));
  assert.equal(s.look(at(2026, 6, 10, 4, 1), sun(-6, true)).action, "close");
});

test("dusk (the sun going down through -6) never closes anything", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 21, 0), sun(-5, false));
  assert.equal(s.look(at(2026, 6, 10, 21, 1), sun(-6.1, false)).action, "none");
});

test("the sunrise fallback: below_horizon to above_horizon when there are no elevations", () => {
  const s = sim();
  assert.equal(s.look(at(2026, 6, 10, 5, 0), { state: "below_horizon" }).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 5, 1), { state: "above_horizon" }).action, "close");
  const t = sim();
  t.look(at(2026, 6, 10, 5, 0), { state: "above_horizon" });
  assert.equal(t.look(at(2026, 6, 10, 5, 1), { state: "above_horizon" }).action, "none");
});

test("a restart in mid-morning never closes the curtain", () => {
  for (const e of [2.1, 10, 35, 60]) {
    const s = sim();
    assert.equal(s.look(at(2026, 6, 10, 9, 30), sun(e, true)).action, "none", `elevation ${e}`);
  }
  // with a memory from before the restart: the previous look is old, and the day was already settled
  const s = sim();
  s.look(at(2026, 6, 10, 4, 1), sun(-7, true));
  s.look(at(2026, 6, 10, 4, 2), sun(-5, true)); // closed
  s.cover = open; // the owner opened it
  assert.equal(s.look(at(2026, 6, 10, 9, 30), sun(2, true)).action, "none");
});

test("a restart during dawn (first look, sun rising between -6 and +2) closes it when nothing happened today", () => {
  for (const e of [-6, -3, 0, 2]) {
    const s = sim();
    assert.equal(s.look(at(2026, 6, 10, 5, 20), sun(e, true)).action, "close", `elevation ${e}`);
  }
  for (const e of [-6.1, 2.1]) assert.equal(sim().look(at(2026, 6, 10, 5, 20), sun(e, true)).action, "none", `elevation ${e}`);
  assert.equal(sim().look(at(2026, 6, 10, 5, 20), sun(-3, false)).action, "none", "setting, not rising");
});

test("a restart during dawn does nothing when dawn already settled today", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 4, 1), sun(-7, true));
  assert.equal(s.look(at(2026, 6, 10, 4, 2), sun(-5, true)).action, "close");
  s.cover = open; // the owner opened it at once
  s.memory = { ...s.memory, prevSun: undefined }; // restart: the previous look is lost
  assert.equal(s.look(at(2026, 6, 10, 4, 10), sun(-4, true)).action, "none");
});

test("the owner opening it by hand is never fought", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  assert.equal(s.look(at(2026, 6, 10, 4, 1), sun(-5, true)).action, "close");
  s.cover = open;
  for (let m = 2; m < 600; m += 7) assert.equal(s.look(at(2026, 6, 10, 4, m), sun(-4 + m / 20, true)).action, "none");
});

test("no gap in looks: after a long outage the crossing is not 'observed', but the window still catches it", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 3, 0), sun(-20, true));
  const later = new Date(at(2026, 6, 10, 3, 0).getTime() + RECENT_MS + 60_000);
  assert.equal(s.look(later, sun(-1, true)).action, "close");
  const s2 = sim();
  s2.look(at(2026, 6, 10, 3, 0), sun(-20, true));
  assert.equal(s2.look(at(2026, 6, 10, 9, 0), sun(40, true)).action, "none", "outage until mid-morning: left alone");
});

test("the curtain was already closed: recorded, nothing sent, and it is never opened by the time rule", () => {
  const s = sim({ dawn: true, openAt: "18:00" }, shut);
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  const d = s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  assert.equal(d.action, "none");
  assert.equal(d.log, true);
  assert.equal(d.memory.dawnDay, "2026-06-10");
  assert.equal(d.memory.closedDay, undefined);
  assert.equal(s.look(at(2026, 6, 10, 18, 0), sun(-20, false)).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 19, 0), sun(-20, false)).action, "none");
});

test("closing or position 0 both count as closed", () => {
  for (const c of [{ state: "closing" }, { state: "open", current_position: 0 }]) {
    const s = sim(DAWN, c);
    s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
    const d = s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
    assert.deepEqual([d.action, d.memory.dawnDay, d.memory.closedDay], ["none", "2026-06-10", undefined]);
  }
});

test("a partly open or opening curtain is closed", () => {
  for (const c of [{ state: "open", current_position: 35 }, { state: "opening" }, { state: "open" }]) {
    const s = sim(DAWN, c);
    s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
    assert.equal(s.look(at(2026, 6, 10, 4, 1), sun(-5, true)).action, "close");
  }
});

test("the curtain unavailable or unknown: nothing is sent; it is tried again for a while, then given up", () => {
  for (const bad of ["unavailable", "unknown", undefined]) {
    const s = sim(DAWN);
    s.cover = bad === undefined ? undefined : { state: bad };
    s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
    const first = s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
    assert.equal(first.action, "none");
    assert.equal(first.log, true);
    assert.equal(s.memory.dawnDay, undefined);
    assert.equal(s.look(at(2026, 6, 10, 4, 2), sun(-5, true)).log, false, "quiet while it waits");
    s.cover = open; // it comes back
    assert.equal(s.look(at(2026, 6, 10, 4, 20), sun(-3, true)).action, "close");
  }
  const s = sim(DAWN, { state: "unavailable" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  s.cover = open;
  const late = new Date(at(2026, 6, 10, 4, 1).getTime() + DUE_MS + 60_000);
  const d = s.look(late, sun(2, true));
  assert.equal(d.action, "none");
  assert.equal(d.log, true);
  assert.equal(s.look(new Date(late.getTime() + 60_000), sun(2.2, true)).action, "none");
});

test("the sun entity missing or unavailable: nothing happens", () => {
  const s = sim();
  assert.equal(s.look(at(2026, 6, 10, 4, 1), undefined).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 4, 2), { state: "unavailable" }).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 4, 3), { state: "unknown", elevation: -5, rising: true }).action, "none");
  assert.equal(s.memory.prevSun, undefined);
});

test("switched off: nothing happens, whatever the sun does", () => {
  const s = sim({ dawn: false, openAt: "18:00" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  assert.equal(s.look(at(2026, 6, 10, 4, 1), sun(-5, true)).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 18, 1), sun(-20, false)).action, "none");
});

test("polar night: the sun never reaches -6, so it never closes", () => {
  const s = sim();
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) assert.equal(s.look(at(2026, 12, 21, h, m), sun(-9 + 2 * Math.sin((h * 60 + m) / 229), h < 12)).action, "none");
});

test("polar day: the sun dips to -3 but never below -6; watched all day it never closes either", () => {
  const s = sim();
  for (let t = 0; t < 24 * 60; t += 10) assert.equal(s.look(at(2026, 6, 21, 0, t), sun(-3 + 12 * Math.sin((t - 360) / 229) ** 2, t >= 360 && t < 1080)).action, "none", `minute ${t}`);
});

test("open again at the set time: only a curtain this rule closed that day, once, after it closed", () => {
  const s = sim({ dawn: true, openAt: "18:00" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  assert.equal(s.look(at(2026, 6, 10, 4, 1), sun(-5, true)).action, "close");
  assert.equal(s.look(at(2026, 6, 10, 12, 0), sun(60, true)).action, "none");
  assert.equal(s.look(at(2026, 6, 10, 17, 59), sun(20, false)).action, "none");
  const d = s.look(at(2026, 6, 10, 18, 0), sun(15, false));
  assert.equal(d.action, "open");
  assert.equal(s.look(at(2026, 6, 10, 18, 1), sun(14, false)).action, "none");
  s.cover = shut; // the owner closes it again by hand in the evening: not fought
  assert.equal(s.look(at(2026, 6, 10, 19, 0), sun(10, false)).action, "none");
});

test("open again: a restart after the time still opens it that day (the memory knows the rule closed it)", () => {
  const s = sim({ dawn: true, openAt: "18:00" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  s.memory = { ...s.memory, prevSun: undefined };
  assert.equal(s.look(at(2026, 6, 10, 21, 0), sun(-10, false)).action, "open");
});

test("open again: already opened by hand before the time: recorded, nothing sent", () => {
  const s = sim({ dawn: true, openAt: "18:00" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  s.cover = open;
  const d = s.look(at(2026, 6, 10, 18, 0), sun(15, false));
  assert.equal(d.action, "none");
  assert.equal(d.log, true);
  assert.equal(d.memory.openDay, "2026-06-10");
  assert.equal(s.look(at(2026, 6, 10, 18, 5), sun(15, false)).action, "none");
});

test("open again: a time before the curtain closed never opens it that day", () => {
  const s = sim({ dawn: true, openAt: "05:00" });
  s.look(at(2026, 12, 10, 7, 0), sun(-8, true));
  assert.equal(s.look(at(2026, 12, 10, 7, 1), sun(-5, true)).action, "close");
  assert.equal(s.look(at(2026, 12, 10, 8, 0), sun(5, true)).action, "none");
  assert.equal(s.look(at(2026, 12, 10, 23, 0), sun(-30, false)).action, "none");
});

test("open again: a missing or malformed time means it never opens by itself", () => {
  for (const openAt of [undefined, "", "6pm", "25:00", "18:60"]) {
    const s = sim({ dawn: true, openAt });
    s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
    s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
    assert.equal(s.look(at(2026, 6, 10, 20, 0), sun(-10, false)).action, "none", String(openAt));
  }
});

test("open again: when the curtain is unreachable at the time it waits, then opens", () => {
  const s = sim({ dawn: true, openAt: "18:00" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  s.cover = { state: "unavailable" };
  assert.equal(s.look(at(2026, 6, 10, 18, 0), sun(15, false)).action, "none");
  s.cover = shut;
  assert.equal(s.look(at(2026, 6, 10, 18, 5), sun(14, false)).action, "open");
});

test("a full day, then the next one closes again", () => {
  const s = sim({ dawn: true, openAt: "20:00" });
  const log: string[] = [];
  for (let day = 10; day <= 12; day++) {
    for (let h = 0; h < 24; h++)
      for (const m of [0, 15, 30, 45]) {
        // a rough sun: rising from 03:30 (-9 -> +, 0.4 deg a minute), setting from 19:00
        const mins = h * 60 + m;
        const e = mins < 750 ? -9 + (mins - 210) * 0.1 : 25 - (mins - 750) * 0.12;
        const d = s.look(at(2026, 6, day, h, m), sun(e, mins < 750));
        if (d.action !== "none") log.push(`${day} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${d.action}`);
        if (day === 11 && h === 8 && m === 0) s.cover = open; // owner opens it at 08:00, by hand
        if (day === 11 && h === 8 && m === 15) s.cover = shut; // and the day after it was closed again by hand; never touched by dawn again
      }
  }
  // day 10: closes once at dawn, opens at 20:00. day 11: closes at dawn; the owner opens (08:00) and closes (08:15): at 20:00 it is opened by the time rule.
  assert.equal(log.filter((l) => l.endsWith("close")).length, 3);
  assert.equal(log.filter((l) => l.endsWith("open")).length, 3);
  for (const day of [10, 11, 12]) {
    const c = log.find((l) => l.startsWith(`${day} `) && l.endsWith("close"));
    const o = log.find((l) => l.startsWith(`${day} `) && l.endsWith("open"));
    assert.ok(c && o && c.slice(3, 8) < "08:00" && o.slice(3, 8) === "20:00", `${day}: ${c} / ${o}`);
  }
});

test("failed calls: bounded retries, then it gives up for the day; a success resets", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  let d = s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  assert.equal(d.action, "close");
  // the call failed: keep what ifFailed says, the cover is still open
  s.memory = d.ifFailed;
  s.cover = open;
  assert.equal(s.memory.dawnDay, undefined);
  assert.equal(s.memory.closedDay, undefined);
  assert.ok(s.memory.dawnDueAt !== undefined);
  for (let n = 2; n <= MAX_TRIES; n++) {
    d = s.look(at(2026, 6, 10, 4, n), sun(-5, true));
    assert.equal(d.action, "close", `retry ${n}`);
    s.memory = d.ifFailed;
    s.cover = open;
  }
  assert.equal(s.memory.dawnDay, "2026-06-10", "given up for today");
  assert.equal(s.look(at(2026, 6, 10, 4, 30), sun(-4, true)).action, "none");
  // tomorrow it tries again with a clean slate
  s.look(at(2026, 6, 11, 4, 0), sun(-8, true));
  assert.equal(s.look(at(2026, 6, 11, 4, 1), sun(-5, true)).action, "close");
});

test("a failed open is counted the same way and leaves the rule closed-today so it can retry", () => {
  const s = sim({ dawn: true, openAt: "18:00" });
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  const d = s.look(at(2026, 6, 10, 18, 0), sun(15, false));
  assert.equal(d.action, "open");
  s.memory = d.ifFailed;
  s.cover = shut;
  assert.equal(s.memory.openDay, undefined);
  assert.equal(s.look(at(2026, 6, 10, 18, 5), sun(15, false)).action, "open");
});

test("an hour of 'none' looks leaves the memory the same except for the sun", () => {
  const s = sim();
  const before = s.look(at(2026, 6, 10, 12, 0), sun(60, true)).memory;
  const after = s.look(at(2026, 6, 10, 12, 1), sun(60.1, true)).memory;
  assert.deepEqual({ ...after, prevSun: undefined }, { ...before, prevSun: undefined });
});

test("daylight saving: days are calendar days, not 24 hours", () => {
  assert.equal(new Date(2026, 2, 29, 12).getTimezoneOffset(), -180, "the zone is Europe/Bucharest (summer)");
  // spring forward 2026-03-29 (23 hours): 00:30 + 23 h is already the next day
  assert.equal(localDay(at(2026, 3, 29, 0, 30)), "2026-03-29");
  assert.equal(localDay(new Date(at(2026, 3, 29, 0, 30).getTime() + 23 * 3_600_000)), "2026-03-30");
  // fall back 2026-10-25 (25 hours): 00:30 + 24 h is still the same day
  assert.equal(localDay(new Date(at(2026, 10, 25, 0, 30).getTime() + 24 * 3_600_000)), "2026-10-25");
  assert.equal(localDay(new Date(at(2026, 10, 25, 0, 30).getTime() + 25 * 3_600_000)), "2026-10-26");
});

test("daylight saving: the clock time of 'open again' is local on the day the clocks change", () => {
  for (const [y, mo, d] of [[2026, 3, 29], [2026, 10, 25]]) {
    const s = sim({ dawn: true, openAt: "09:00" });
    s.look(at(y, mo, d, 6, 0), sun(-8, true));
    assert.equal(s.look(at(y, mo, d, 6, 1), sun(-5, true)).action, "close", `${mo}-${d}`);
    assert.equal(s.look(at(y, mo, d, 8, 59), sun(20, true)).action, "none");
    assert.equal(s.look(at(y, mo, d, 9, 0), sun(21, true)).action, "open");
  }
});

test("daylight saving: dawn on the fall-back night's repeated hour is settled once", () => {
  const s = sim();
  const first = new Date(Date.UTC(2026, 9, 24, 21, 30)); // 00:30 EEST on the 25th
  const early = new Date(first.getTime() + 3 * 3_600_000 + 10 * 60_000); // 03:40 EEST ... 03:40 EET follows an hour later
  s.look(first, sun(-8, true));
  s.look(new Date(first.getTime() + 60_000), sun(-5.5, true));
  assert.equal(s.memory.dawnDay, "2026-10-25");
  for (let i = 0; i < 4; i++) assert.equal(s.look(new Date(early.getTime() + i * 30 * 60_000), sun(-3 + i, true)).action, "none");
});

test("the memory a day later: yesterday's dawn does not block today's", () => {
  const s = sim();
  s.look(at(2026, 6, 10, 4, 0), sun(-8, true));
  s.look(at(2026, 6, 10, 4, 1), sun(-5, true));
  s.cover = open;
  s.look(at(2026, 6, 10, 23, 59), sun(-30, false));
  s.look(at(2026, 6, 11, 0, 1), sun(-30, false));
  s.look(at(2026, 6, 11, 4, 0), sun(-7, true));
  assert.equal(s.look(at(2026, 6, 11, 4, 1), sun(-5.9, true)).action, "close");
});
