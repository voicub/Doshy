import test from "node:test";
import assert from "node:assert/strict";
import { GODRAYS_COST, GODRAYS_MODES, STRENGTH_STEPS, godraysParams, godraysStrength, godraysVolume, isGodraysChoice, quantizeStrength, resolveGodrays } from "./godrays.ts";
import { TIER_ORDER, TIERS, knobsFor, restoredGodrays, type Tier } from "./quality.ts";
import { classifyDevice } from "./deviceClass.ts";

const DEVICE = { tier: "high" as Tier, reasons: [] };
const SOFTWARE = { tier: "eco" as Tier, reasons: [], software: true };

test("by default God rays are on at Detailed (Soft) and Ultra (Rich) and off below", () => {
  const modes = TIER_ORDER.map((t) => knobsFor({ tier: t, device: DEVICE }).godrays);
  assert.deepEqual(modes, ["off", "off", "off", "soft", "rich"]);
});

test("they need the film post stack: Eco and Light stay off whatever is chosen", () => {
  for (const tier of ["eco", "low"] as const) for (const choice of GODRAYS_MODES) assert.equal(knobsFor({ tier, device: DEVICE, godrays: choice }).godrays, "off", `${tier} ${choice}`);
});

test("Balanced has them only as an opt-in", () => {
  assert.equal(knobsFor({ tier: "medium", device: DEVICE, godrays: "auto" }).godrays, "off");
  assert.equal(knobsFor({ tier: "medium", device: DEVICE, godrays: "soft" }).godrays, "soft");
  assert.equal(knobsFor({ tier: "medium", device: DEVICE, godrays: "rich" }).godrays, "rich");
});

test("a pick at a heavy tier is honoured, and Off turns them off", () => {
  assert.equal(knobsFor({ tier: "ultra", device: DEVICE, godrays: "off" }).godrays, "off");
  assert.equal(knobsFor({ tier: "high", device: DEVICE, godrays: "rich" }).godrays, "rich");
});

test("Automatic keeps them off when the 3D view is drawn in software; a mode the owner picked stays", () => {
  assert.equal(resolveGodrays("rich", "film", true, "auto"), "off");
  assert.equal(resolveGodrays("rich", "film", false, "auto"), "rich");
  assert.equal(resolveGodrays("off", "film", true, "soft"), "soft");
  assert.equal(knobsFor({ tier: "ultra", device: { ...DEVICE, software: true } }).godrays, "off");
});

test("the knobs are one of a fixed set of objects, so they are a stable store selector", () => {
  const a = knobsFor({ tier: "medium", device: DEVICE, godrays: "soft" });
  assert.equal(knobsFor({ tier: "medium", device: DEVICE, godrays: "soft" }), a);
  assert.equal(knobsFor({ tier: "high", device: DEVICE, godrays: "auto" }), TIERS.high);
  assert.equal(knobsFor({ tier: "eco", device: SOFTWARE, godrays: "rich" }).godrays, "off");
});

test("a saved God rays choice: kept when valid, Automatic when missing or damaged", () => {
  assert.equal(restoredGodrays("rich"), "rich");
  assert.equal(restoredGodrays(undefined), "auto");
  assert.equal(restoredGodrays("blazing"), "auto");
  assert.equal(isGodraysChoice(3), false);
});

test("a Raspberry Pi class device never gets them without being asked", () => {
  const pi = classifyDevice({ screenWidth: 800, screenHeight: 480, cores: 4, memory: 4, kiosk: true, renderer: "ANGLE (Broadcom, V3D 7.1.7.0, OpenGL ES 3.1)" });
  assert.equal(pi.tier, "eco");
  assert.equal(knobsFor({ tier: pi.tier, device: pi }).godrays, "off");
});

const SKY = { sunY: 0.5, daylight: 1, cloud: 0 };

test("no rays at night, full strength in the day and at dusk, between 0 and 1 throughout", () => {
  assert.equal(godraysStrength({ ...SKY, daylight: 0, sunY: 0.6 }), 0);
  assert.ok(godraysStrength(SKY) > 0.5);
  assert.ok(godraysStrength({ ...SKY, daylight: 0.5, sunY: 0.15 }) > 0.9, "dusk, low sun: the best beams");
  for (let d = 0; d <= 1; d += 0.05) for (let c = 0; c <= 1; c += 0.1) for (let y = 0; y <= 1; y += 0.1) {
    const s = godraysStrength({ sunY: y, daylight: d, cloud: c });
    assert.ok(s >= 0 && s <= 1, `${d} ${c} ${y} -> ${s}`);
  }
});

test("cloud takes the rays away and a high sun shows less than a low one", () => {
  let last = Infinity;
  for (let c = 0; c <= 1.0001; c += 0.1) {
    const s = godraysStrength({ ...SKY, cloud: c });
    assert.ok(s <= last, `cloud ${c}`);
    last = s;
  }
  assert.equal(godraysStrength({ ...SKY, cloud: 1 }), 0, "overcast: no direct sun to see");
  assert.ok(godraysStrength({ ...SKY, sunY: 1 }) < godraysStrength({ ...SKY, sunY: 0.2 }));
});

test("strength is quantized so a creeping sun does not rewrite the pass every frame", () => {
  assert.equal(quantizeStrength(0.5), 0.5);
  assert.equal(quantizeStrength(-1), 0);
  assert.equal(quantizeStrength(2), 1);
  assert.equal(quantizeStrength(0.5 + 0.2 / STRENGTH_STEPS), 0.5);
});

test("Rich spends more than Soft on every axis, and the density follows the strength", () => {
  const { soft, rich } = GODRAYS_COST;
  assert.ok(rich.stepSize < soft.stepSize, "finer steps");
  assert.ok(rich.maxSteps > soft.maxSteps && rich.minSteps > soft.minSteps);
  assert.ok(rich.resolutionScale > soft.resolutionScale);
  const full = godraysParams("soft", 1);
  const half = godraysParams("soft", 0.5);
  assert.ok(Math.abs(half.density * 2 - full.density) < 1e-12);
  assert.ok(Math.abs(half.maxDensity * 2 - full.maxDensity) < 1e-12);
  assert.deepEqual(godraysParams("rich", 1).adaptiveSteps, { stepSize: rich.stepSize, minSteps: rich.minSteps, maxSteps: rich.maxSteps });
});

test("the rays' volume is the building's footprint with a margin, from the ground to above its top storey", () => {
  const v = godraysVolume({ x0: 4, y0: 6, x1: 14, y1: 12 }, 3.6);
  assert.ok(v.min[0] < 4 && v.min[2] < 6 && v.max[0] > 14 && v.max[2] > 12, "air beside the walls is included");
  assert.equal(v.min[1], 0);
  assert.ok(v.max[1] > 3.6, "and some above the ceiling");
  assert.ok(v.max[1] - 3.6 < 4, "but not the sky");
  assert.ok(v.feather > 0 && v.feather < v.max[1], "with a soft edge");
});
