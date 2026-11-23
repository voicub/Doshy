import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { CURATED_MODELS, applyCurated } from "./carCurated.ts";

const ASX = CURATED_MODELS.b654aeee32064a3ca3b4693fa65bb09a;
const part = (name: string, material = "ASX_plastic") => Object.assign(new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial({ name: material })), { name });
const group = (name: string, ...kids: Object3D[]) => {
  const g = new Group();
  g.name = name;
  g.add(...kids);
  return g;
};
const names = (root: Object3D) => {
  const out: string[] = [];
  root.traverse((o) => out.push(o.name));
  return out;
};

function rip() {
  const root = new Group();
  root.add(
    group("ASX_bumper_F", part("a")),
    group("ASX_bumper_F_rest", part("b")),
    group("ASX_bumper_F_rest_plastic", part("c")),
    group("ASX_windshield", part("d", "vivace_glass")),
    group("ASX_windshield_dmg", part("e")),
    group("ASX_windshield_tint", part("f")),
    group("ASX_headlight_frame_L", part("g")),
    group("ASX_strut_front_wide", part("h")),
    group("ASX_engbay", part("i")),
    group("ASX_seat_FL", part("j")),
    group("ASX_hood", part("k", "material")),
    group("ASX_wheel", part("rim", "ASX_light")),
    group("ASX_wheel2", part("rim2", "ASX_light")),
  );
  return root;
}

test("the curated ASX keeps one of each part: the 2013-2016 bumper, clear glass, the headlight frame, the hood", () => {
  const root = rip();
  applyCurated(root, ASX);
  const kept = names(root);
  for (const n of ["ASX_bumper_F_rest", "ASX_windshield", "ASX_headlight_frame_L", "ASX_hood"]) assert.ok(kept.includes(n), `${n} stays`);
  for (const n of ["ASX_bumper_F", "ASX_bumper_F_rest_plastic", "ASX_windshield_dmg", "ASX_windshield_tint", "ASX_strut_front_wide", "ASX_engbay", "ASX_seat_FL", "ASX_wheel2"]) assert.ok(!kept.includes(n), `${n} goes`);
});

test("the lone rim becomes four wheels, each with a tyre, mirrored on the left so the face points outward", () => {
  const root = rip();
  applyCurated(root, ASX);
  const wheels = root.children.filter((c) => c.name === "wheel");
  assert.equal(wheels.length, 4);
  for (const w of wheels) {
    assert.deepEqual(w.children.map((c) => c.name).sort(), ["ASX_wheel", "tyre"]);
    assert.equal(w.scale.x, w.position.x < 0 ? -1 : 1);
  }
  const front = wheels.filter((w) => w.position.z > 0).length;
  assert.equal(front, 2, "two wheels at the front axle, two at the rear");
  assert.ok(!names(root).includes("ASX_wheel2"));
});

test("the rim loses the headlight texture sheet it came with and the body paint is renamed for the paint picker", () => {
  const root = rip();
  applyCurated(root, ASX);
  const mats = new Set<string>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && !Array.isArray(m.material)) mats.add(m.material.name);
  });
  assert.ok(mats.has("alloy rim") && mats.has("tyre") && mats.has("paint"));
  assert.ok(!mats.has("ASX_light"));
});
