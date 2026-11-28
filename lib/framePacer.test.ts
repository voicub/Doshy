import test from "node:test";
import assert from "node:assert/strict";
import { FPS30_MS, PACE, createPacer, framePolicy, keepAlive, takeKept } from "./framePacer.ts";

test("only the heavy tiers on a normal screen keep the plain always-drawing loop", () => {
  assert.deepEqual(framePolicy("high", "regular", false), { demand: false, capMs: 0, ambientMs: 0, shadowMs: PACE.shadowMs });
  assert.deepEqual(framePolicy("ultra", "regular", false), { demand: false, capMs: 0, ambientMs: 0, shadowMs: PACE.shadowMs });
  assert.equal(framePolicy("high", "regular", true).demand, true, "a kiosk idles when still");
  assert.equal(framePolicy("high", "tiny", false).demand, true, "a small screen idles when still");
  assert.equal(framePolicy("medium", "regular", false).demand, true);
  assert.equal(framePolicy("eco", "regular", false).demand, true);
});

test("30 fps cap: Eco always, Light on a kiosk or a small screen, never the heavy tiers", () => {
  assert.equal(framePolicy("eco", "regular", false).capMs, FPS30_MS);
  assert.equal(framePolicy("low", "tiny", false).capMs, FPS30_MS);
  assert.equal(framePolicy("low", "small", false).capMs, FPS30_MS);
  assert.equal(framePolicy("low", "regular", true).capMs, FPS30_MS);
  assert.equal(framePolicy("low", "regular", false).capMs, 0);
  assert.equal(framePolicy("high", "tiny", true).capMs, 0);
});

type Opts = { frameMs?: number; touchAt?: number[]; keptUntil?: number; unplannedAt?: number[] };
/** Run the pacer like the driver does: each frame asks for the delay and the next frame is due then. An input event (touch) wakes the driver: a frame within one cap interval; a scene change
 *  (unplanned) is a frame at once that this pacer did not ask for. Returns the frame start times. */
function simulate(capMs: number, totalMs: number, opts: Opts = {}) {
  const p = createPacer(capMs);
  const frameMs = opts.frameMs ?? 5;
  const events = [...(opts.touchAt ?? []).map((at) => ({ at, touch: true })), ...(opts.unplannedAt ?? []).map((at) => ({ at, touch: false }))].sort((a, b) => a.at - b.at);
  const starts: number[] = [];
  let due = 0;
  let lastStart = -Infinity;
  while (due < totalMs) {
    let at = due;
    let planned = true;
    const ev = events[0];
    if (ev && ev.at < due) {
      events.shift();
      if (ev.touch) {
        p.poke(ev.at);
        at = Math.max(ev.at, lastStart + capMs);
      } else {
        at = ev.at;
        planned = false;
      }
    }
    p.begin(at, planned, false);
    starts.push(at);
    lastStart = at;
    const end = at + frameMs;
    due = end + p.end(end, end < (opts.keptUntil ?? 0));
  }
  return starts;
}

test("a still scene draws one frame per idle heartbeat and nothing in between", () => {
  const frames = simulate(FPS30_MS, 60_000);
  assert.ok(frames.length <= 60_000 / PACE.idleMs + 2, `${frames.length} frames in a minute`);
  assert.ok(frames.length >= 60_000 / (PACE.idleMs + 10) - 2);
});

test("a frame nobody here asked for (the scene changed) starts a settle burst at the cap, then the view goes still again", () => {
  const frames = simulate(FPS30_MS, 20_000, { unplannedAt: [1000] });
  const burst = frames.filter((t) => t >= 1000 && t < 1000 + PACE.settleMs);
  const expected = PACE.settleMs / FPS30_MS;
  assert.ok(burst.length >= expected - 2 && burst.length <= expected + 2, `${burst.length} frames in the settle burst, expected about ${expected}`);
  const after = frames.filter((t) => t > 1000 + PACE.settleMs + 100);
  assert.ok(after.length <= (20_000 - 1000 - PACE.settleMs) / PACE.idleMs + 2, `${after.length} frames once settled`);
});

test("touch input keeps frames coming at the cap for activeMs, then the scene goes still", () => {
  const frames = simulate(FPS30_MS, 20_000, { touchAt: [1000] });
  const busy = frames.filter((t) => t >= 1000 && t < 1000 + PACE.activeMs);
  const fps = busy.length / (PACE.activeMs / 1000);
  assert.ok(fps > 25 && fps <= 31, `${fps} fps while touched`);
  const later = frames.filter((t) => t > 1000 + PACE.activeMs + 100);
  assert.ok(later.length <= (20_000 - 3600) / PACE.idleMs + 2, `${later.length} frames while still`);
});

test("anything that keeps alive holds the cap; a slow frame is never delayed further", () => {
  const frames = simulate(FPS30_MS, 10_000, { keptUntil: 10_000 });
  const fps = frames.length / 10;
  assert.ok(fps > 25 && fps <= 31, `${fps}`);
  const p = createPacer(FPS30_MS);
  p.begin(0, true, false);
  assert.equal(p.end(80, true), 0, "an 80 ms frame already used its slot");
});

test("no cap (0) draws as fast as asked while busy", () => {
  const p = createPacer(0);
  p.begin(0, true, false);
  assert.equal(p.end(7, true), 0);
});

test("shadow maps need redrawing after a scene change, while something animates and in the first frames, never for the camera alone", () => {
  const p = createPacer(FPS30_MS);
  assert.equal(p.begin(0, true, false), true, "the first frame draws everything");
  p.end(5, false);
  assert.equal(p.begin(2000, true, false), false, "an idle heartbeat does not");
  p.end(2005, false);
  assert.equal(p.begin(2100, false, true), false, "the camera moved (orbit, pan, zoom)");
  p.end(2105, false);
  assert.equal(p.begin(2200, false, false), true, "something else changed (a door opened, a lamp switched)");
  p.end(2205, false);
  assert.equal(p.begin(2233, true, false), true, "and the easing after it is still moving");
  p.end(2238, false);
  assert.equal(p.begin(2200 + PACE.settleMs + 50, true, false), false, "settled");
  p.end(2200 + PACE.settleMs + 55, true);
  assert.equal(p.begin(2200 + PACE.settleMs + 90, true, false), true, "a frame after a kept-alive one (a fan turning) redraws");
});

test("keepAlive is a flag read and cleared once per frame", () => {
  assert.deepEqual({ ...takeKept() }, { alive: false, shadows: false });
  keepAlive();
  keepAlive();
  assert.deepEqual({ ...takeKept() }, { alive: true, shadows: true });
  assert.deepEqual({ ...takeKept() }, { alive: false, shadows: false });
});

test("an animation that moves no shadow keeps frames coming but not the shadow pass", () => {
  keepAlive(false);
  keepAlive(false);
  assert.deepEqual({ ...takeKept() }, { alive: true, shadows: false });
  keepAlive(false);
  keepAlive(); // one mover among glowing things: the shadows are due
  assert.deepEqual({ ...takeKept() }, { alive: true, shadows: true });

  const p = createPacer(FPS30_MS);
  p.begin(0, true, false);
  assert.equal(p.end(5, true, false), FPS30_MS - 5, "kept alive, so the next frame is due at the cap");
  assert.equal(p.begin(FPS30_MS, true, false), false, "a rain drop or a glow easing does not redraw the sun's shadow map");
  p.end(FPS30_MS + 5, true, false);
  assert.equal(p.begin(FPS30_MS * 2, true, false), false, "still no");
});

/** Frame start times at which the shadow map was drawn, for a scene where something that casts a shadow moves until `movesUntil` (or never stops when Infinity). */
function shadowFrames(capMs: number, totalMs: number, movesUntil: number) {
  const p = createPacer(capMs);
  const drawn: number[] = [];
  let at = 0;
  while (at < totalMs) {
    if (p.begin(at, true, false)) drawn.push(at);
    at += p.end(at + 5, at < movesUntil) + 5;
  }
  return drawn;
}

test("something that keeps moving gets the shadow redrawn at shadowMs, not at every frame", () => {
  const drawn = shadowFrames(FPS30_MS, 10_000, Infinity);
  const perSecond = drawn.length / 10;
  assert.ok(perSecond <= 1000 / PACE.shadowMs + 1 && perSecond >= 1000 / (PACE.shadowMs + FPS30_MS) - 1, `${perSecond} shadow passes a second at 30 fps`);
});

test("the last move of an animation reaches the shadow map even when nothing else asks for a frame", () => {
  const drawn = shadowFrames(FPS30_MS, 10_000, 1010);
  const last = drawn[drawn.length - 1];
  assert.ok(last >= 1010 && last <= 1010 + PACE.shadowMs + FPS30_MS, `last shadow pass at ${last}`);
  assert.ok(drawn.filter((t) => t > last).length === 0, "and then none while the scene is still");
});

test("Eco and Light draw ambient motion slower than the owner's own touch; the heavy tiers do not", () => {
  assert.ok(framePolicy("eco", "tiny", true).ambientMs > FPS30_MS);
  assert.ok(framePolicy("low", "small", false).ambientMs > FPS30_MS);
  assert.equal(framePolicy("low", "regular", false).ambientMs, 0, "Light on a big screen has no cap, so no ambient rate either");
  assert.equal(framePolicy("medium", "tiny", true).ambientMs, 0);
  assert.ok(framePolicy("eco", "regular", false).shadowMs > PACE.shadowMs, "Eco redraws a moving caster's shadow rarely");
});

test("a fan that turns while nobody touches draws at the ambient rate; a touch brings the cap back; a finger on a panel holds it off", () => {
  const AMBIENT = 100;
  const p = createPacer(FPS30_MS, { ambientMs: AMBIENT });
  p.begin(10_000, true, false);
  assert.equal(p.end(10_005, true, false), AMBIENT - 5, "kept alive, nobody touches");
  p.poke(10_100);
  p.begin(10_100, true, false);
  assert.ok(Math.abs(p.end(10_105, true, false) - (FPS30_MS - 5)) < 1e-6, "the owner touched the screen: the cap");
  const t = 10_100 + PACE.activeMs + 50;
  p.begin(t, true, false);
  assert.equal(p.end(t + 5, true, false), AMBIENT - 5, "and after it, ambient again");
  p.hold(t + 10);
  p.begin(t + 100, true, false);
  assert.equal(p.end(t + 105, true, false), t + 10 + PACE.holdMs - (t + 105), "a panel is being scrolled: the next ambient frame waits for the hold to end");
  p.begin(t + 600, true, false);
  assert.equal(p.end(t + 605, true, false), AMBIENT - 5, "hold over");
});

test("with an ambient rate a still scene is still idle and a fan's shadow map is redrawn at the tier's shadow rate", () => {
  const p = createPacer(FPS30_MS, { ambientMs: 100, shadowMs: 500 });
  p.begin(0, true, false);
  assert.equal(p.end(5, false, false), PACE.idleMs, "nothing moves: the heartbeat");
  let drawn = 0;
  let at = 5000 + PACE.activeMs;
  const stop = at + 10_000;
  while (at < stop) {
    if (p.begin(at, true, false)) drawn++;
    at += p.end(at + 5, true) + 5;
  }
  assert.ok(drawn <= 10_000 / 500 + 2 && drawn >= 10_000 / 600, `${drawn} shadow passes in 10 s`);
});
