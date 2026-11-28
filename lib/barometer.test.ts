import assert from "node:assert/strict";
import test from "node:test";
import golden from "./catalogBounds.golden.json" with { type: "json" };
import { CATALOG } from "./catalog.ts";
import { dialAngle, entityHpa, type PressureEntity } from "./pressure.ts";
import { createReplayer, parseReplay } from "./timeline.ts";

const sensor = (state: string, unit = "hPa"): PressureEntity => ({ entity_id: "sensor.atmospheric_pressure", state, attributes: { device_class: "atmospheric_pressure", unit_of_measurement: unit } });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test("the wall needle maps pressure clockwise over 270 degrees and clamps both stops", () => {
  near(dialAngle(960), Math.PI * 0.75);
  near(dialAngle(1010), 0);
  near(dialAngle(1060), -Math.PI * 0.75);
  near(dialAngle(840), dialAngle(960));
  near(dialAngle(1100), dialAngle(1060));
  near(dialAngle(entityHpa(sensor("101.3", "kPa"))!), dialAngle(1013));
  near(dialAngle(entityHpa(sensor("101300", "Pa"))!), dialAngle(1013));
  near(dialAngle(entityHpa(sensor("29.92", "inHg"))!), dialAngle(29.92 * 33.8638866667));
});

test("replayed atmospheric readings move the same needle and missing readings stay absent", () => {
  const live = sensor("1040");
  const replay = createReplayer(parseReplay({ from: 0, to: 100, bucketMs: 1, entities: { [live.entity_id]: [[10, "980"], [50, "1020"], [80, "unavailable"]] } }), { [live.entity_id]: live });
  assert.equal(entityHpa(replay(0)[live.entity_id]), undefined);
  near(dialAngle(entityHpa(replay(10)[live.entity_id])!), dialAngle(980));
  near(dialAngle(entityHpa(replay(50)[live.entity_id])!), dialAngle(1020));
  assert.equal(entityHpa(replay(80)[live.entity_id]), undefined);
  assert.equal(entityHpa(sensor("unknown")), undefined);
  assert.equal(entityHpa(sensor("1013", "°C")), undefined);
  assert.equal(entityHpa(undefined), undefined);
});

test("the new wall barometer is a 20 cm Sensors dial with its own bounds golden", () => {
  const def = CATALOG.sn_barometer;
  assert.ok(def);
  assert.equal(def.cat, "Sensors");
  assert.equal(def.wall, true);
  assert.equal(def.w, 0.2);
  assert.equal(def.d, 0.04);
  assert.equal(def.h, 1.6);
  assert.deepEqual((golden as Record<string, number[]>).sn_barometer, [0.2, 0.04, 1.6, -0.06, 0.06, 1.44, 1.56, -0.02, 0.021, 5]);
});
