import test from "node:test";
import assert from "node:assert/strict";
import { TIERS, TIER_ORDER, chosen, isLite, knobsFor, knobsOf, lighterTier, lowerTier, restored, withDevice, type Knobs, type Tier } from "./quality.ts";

const NUMERIC: (keyof Knobs)[] = ["pixelRatio", "shadowMap", "foliage", "grass", "pointLights", "weather", "site", "textureSize", "bevelSegments", "detail", "textures", "shadowSoft", "sunGrid"];

test("the tiers run from cheapest to richest and each has a knob set", () => {
  assert.deepEqual([...TIER_ORDER], ["eco", "low", "medium", "high", "ultra"]);
  assert.deepEqual(Object.keys(TIERS).sort(), [...TIER_ORDER].sort());
});

test("each knob only ever grows with the tier (Eco is the cheapest on every axis, Ultra the richest)", () => {
  for (const key of NUMERIC) {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const a = knobsOf(TIER_ORDER[i - 1])[key] as number;
      const b = knobsOf(TIER_ORDER[i])[key] as number;
      assert.ok(a <= b, `${key}: ${TIER_ORDER[i - 1]} ${a} > ${TIER_ORDER[i]} ${b}`);
    }
  }
});

test("lowerTier / lighterTier", () => {
  assert.equal(lowerTier("ultra"), "high");
  assert.equal(lowerTier("low"), "eco");
  assert.equal(lowerTier("eco"), "eco");
  assert.equal(lighterTier("high", "eco"), "eco");
  assert.equal(lighterTier("eco", "high"), "eco");
  assert.equal(lighterTier("medium", "medium"), "medium");
});

const ECO_DEVICE = { tier: "eco" as Tier, reasons: ["A small screen."] };
const HIGH_DEVICE = { tier: "high" as Tier, reasons: ["Room to spare."] };

test("Automatic goes back to the device's own tier and lets the governor work; a picked tier is the owner's", () => {
  assert.deepEqual(chosen("auto", ECO_DEVICE), { tier: "eco", manual: false });
  assert.deepEqual(chosen("auto", HIGH_DEVICE), { tier: "high", manual: false });
  assert.deepEqual(chosen("ultra", ECO_DEVICE), { tier: "ultra", manual: true });
});

test("a new reading of the device lowers an automatic tier, never the owner's own", () => {
  assert.deepEqual(withDevice({ tier: "high", manual: false }, ECO_DEVICE), { device: ECO_DEVICE, tier: "eco" });
  assert.deepEqual(withDevice({ tier: "high", manual: true }, ECO_DEVICE), { device: ECO_DEVICE, tier: "high" });
  assert.equal(withDevice({ tier: "eco", manual: false }, HIGH_DEVICE).tier, "eco", "it never raises");
});

test("the saved tier at load: lowered to the device when automatic, kept when the owner chose it, ignored when unusable", () => {
  assert.deepEqual(restored({ tier: "high", manual: false }, ECO_DEVICE), { tier: "eco", manual: false }, "a Pi that once saved Detailed starts on Eco");
  assert.deepEqual(restored({ tier: "low", manual: false }, HIGH_DEVICE), { tier: "low", manual: false }, "a governor step-down is kept");
  assert.deepEqual(restored({ tier: "ultra", manual: true }, ECO_DEVICE), { tier: "ultra", manual: true });
  assert.equal(restored({ tier: "turbo", manual: true }, HIGH_DEVICE), null);
  assert.equal(restored(null, HIGH_DEVICE), null);
  assert.equal(restored({}, HIGH_DEVICE), null);
});

test("Eco is the only tier that gives up the HUD's decorations", () => {
  assert.deepEqual(TIER_ORDER.filter(isLite), ["eco"]);
});

test("Eco on a software-drawn 3D view goes lighter still; no other case changes the tier's knobs", () => {
  const software = { tier: "eco" as Tier, reasons: [], software: true };
  const eco = knobsFor({ tier: "eco", device: software });
  assert.equal(eco.antialias, false);
  assert.equal(eco.shadows, false);
  assert.ok(eco.pixelRatio < 1);
  assert.equal(knobsFor({ tier: "eco", device: software }), eco, "the same object every time: it is a store selector");
  assert.equal(knobsFor({ tier: "eco", device: ECO_DEVICE }), TIERS.eco);
  assert.equal(knobsFor({ tier: "low", device: software }), TIERS.low, "only Eco has a software variant");
  for (const tier of TIER_ORDER) assert.ok(knobsOf(tier).shadows && knobsOf(tier).antialias, `${tier} keeps shadows and multisampling on a real graphics chip`);
});
