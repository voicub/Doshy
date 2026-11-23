import test from "node:test";
import assert from "node:assert/strict";
import { openZone } from "./zones.ts";
import { starterPlan } from "./starterPlan.ts";
import { firstLevelId } from "./levels.ts";

const plan = starterPlan();
const level = firstLevelId(plan);
const named = (n: string) => plan.rooms.find((r) => r.name === n)!;
const covers = (rects: { x: number; y: number; w: number; h: number }[], r: { x: number; y: number }) => rects.some((f) => r.x >= f.x - 1e-6 && r.x <= f.x + f.w && r.y >= f.y - 1e-6 && r.y <= f.y + f.h);

test("hall and living room (with kitchen) are one open space, from either side", () => {
  const hall = named("Hall");
  const living = named("Living & kitchen");
  for (const r of [hall, living]) {
    const zone = openZone(plan, level, r);
    assert.ok(covers(zone, { x: hall.x + 0.1, y: hall.y + 0.1 }), `hall in zone of ${r.name}`);
    assert.ok(covers(zone, { x: living.x + 0.1, y: living.y + 0.1 }), `living in zone of ${r.name}`);
  }
});

test("rooms behind a wall stay out of the zone: lamplight must not cross them", () => {
  const zone = openZone(plan, level, named("Hall"));
  for (const n of ["Office", "Bedroom", "Bathroom", "Balcony"]) {
    const r = named(n);
    assert.ok(!covers(zone, { x: r.x + r.w / 2, y: r.y + r.h / 2 }), `${n} is walled off`);
  }
  assert.deepEqual(openZone(plan, level, named("Office")).length, 1 + plan.rooms.filter((r) => r.parent === named("Office").id).length);
});
