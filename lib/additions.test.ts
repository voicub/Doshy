import test from "node:test";
import assert from "node:assert/strict";
import { applyAdditions } from "./additions.ts";
import { starterPlan } from "./starterPlan.ts";

test("a saved plan gets each addition once: user layout kept, deleted pieces stay deleted, links filled only where empty", () => {
  const fresh = starterPlan();
  const saved = { ...fresh, added: undefined, items: fresh.items.filter((i) => i.kind !== "of_server_odin" && i.kind !== "of_monitor_ultrawide").map((i) => (i.kind === "lv_network_cabinet" ? { ...i, entity: undefined } : i)) };
  const first = applyAdditions(saved);
  assert.equal(first.items.filter((i) => i.kind === "of_server_odin").length, 1);
  assert.equal(first.items.find((i) => i.kind === "of_monitor_ultrawide")?.entity, "switch.office_pc_display");
  assert.equal(first.items.find((i) => i.kind === "lv_network_cabinet")?.entity, "light.rack_light");
  const deleted = { ...first, items: first.items.filter((i) => i.kind !== "of_server_odin") };
  assert.equal(applyAdditions(deleted), deleted, "already applied: nothing is re-added");
  const mine = { ...first, added: [...first.added!], items: first.items.map((i) => (i.kind === "lv_network_cabinet" ? { ...i, entity: "light.mine" } : i)) };
  assert.equal(applyAdditions(mine).items.find((i) => i.kind === "lv_network_cabinet")?.entity, "light.mine");
});

test("a saved coffee table nest becomes two tables at the same spots, turned the same way", () => {
  const nest = { id: "n", kind: "lv_coffee_nest", x: 1.85, y: 3.4, rot: 90, w: 1, d: 0.75, h: 0.45 };
  const saved = { ...starterPlan(), added: undefined, items: [nest] };
  const out = applyAdditions(saved).items.filter((i) => i.kind.startsWith("lv_coffee_table"));
  const tall = out.find((i) => i.kind === "lv_coffee_table_tall")!;
  const low = out.find((i) => i.kind === "lv_coffee_table_low")!;
  assert.deepEqual([tall.x, tall.y, tall.rot], [1.925, 3.6, 90]);
  assert.deepEqual([low.x, low.y, low.rot], [1.675, 3.3, 90]);
  assert.equal(applyAdditions(saved).items.some((i) => i.kind === "lv_coffee_nest"), false);
});

test("a saved HEKTAR lamp becomes a stand plus three heads, each on its own bulb entity at its own height", () => {
  const lamp = { id: "l", kind: "of_hektar_3head", x: 3.45, y: 6.1, rot: 0, w: 0.45, d: 0.45, h: 1.9, entity: "light.office_sofa_lamp" };
  const out = applyAdditions({ ...starterPlan(), added: undefined, items: [lamp] }).items;
  assert.equal(out.some((i) => i.kind === "of_hektar_3head"), false);
  assert.equal(out.filter((i) => i.kind === "of_hektar_stand").length, 1);
  const heads = out.filter((i) => i.kind === "of_hektar_head");
  assert.deepEqual(heads.map((h) => h.entity), ["light.office_sofa_lamp_1", "light.office_sofa_lamp_2", "light.office_sofa_lamp_3"]);
  assert.deepEqual(heads.map((h) => h.elev), [1.66, 1.31, 0.96]);
  assert.ok(heads.every((h) => h.x === 3.45 && h.y === 6.1));
  assert.equal(out.find((i) => i.kind === "of_hektar_stand")?.entity, undefined);
});

test("the starter plan has the lamp heads linked to the three bulbs", () => {
  const heads = starterPlan().items.filter((i) => i.kind === "of_hektar_head");
  assert.equal(heads.length, 3);
  assert.deepEqual(heads.map((h) => h.entity).sort(), ["light.office_sofa_lamp_1", "light.office_sofa_lamp_2", "light.office_sofa_lamp_3"]);
});
