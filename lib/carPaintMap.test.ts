import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { guessPaint, listMaterials, prepareInstance } from "./carPaintMap.ts";

const std = (name: string, color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) => new MeshStandardMaterial({ name, color, metalness: 0.3, roughness: 0.5, ...extra });
const panel = (m: Material, size = 1, x = 0) => {
  const mesh = new Mesh(new BoxGeometry(size, size, size), m);
  mesh.position.x = x;
  return mesh;
};
const sceneOf = (...ms: Mesh[]) => new Group().add(...ms);
const meshes = (g: Group) => g.children as Mesh[];
const byKey = (root: Group) => Object.fromEntries(listMaterials(root).map((i) => [i.key, i]));

test("name hints win over size: CarPaint beats a bigger Interior", () => {
  const root = sceneOf(panel(std("Interior", "#888888"), 5), panel(std("CarPaint", "#aa0000"), 1));
  const infos = listMaterials(root);
  assert.equal(infos[0].key, "Interior");
  assert.equal(infos.find((i) => i.key === "CarPaint")?.role, "paint");
  assert.equal(guessPaint(infos), "CarPaint");
});

test("a big interior-sized material that covers little of the car loses to a smaller exterior one that spans it", () => {
  const shell = panel(std("m1", "#2244aa"), 1);
  shell.scale.set(4, 1.4, 1.8); // area ~ 31, spans the whole car
  const grey = std("m2", "#808080");
  const seats = Array.from({ length: 40 }, (_, i) => {
    const s = panel(grey, 1);
    s.scale.set(1, 0.5, 0.8);
    s.position.set(-0.2 + (i % 4) * 0.1, -0.1, 0);
    return s;
  });
  const root = sceneOf(shell, ...seats);
  const infos = listMaterials(root);
  const found = byKey(root);
  assert.equal(infos[0].key, "m2"); // by area alone the grey interior wins
  assert.ok(found.m2.area > 3 * found.m1.area);
  assert.ok(found.m1.extent > 0.95 && found.m2.extent < 0.5, `${found.m1.extent} ${found.m2.extent}`);
  assert.equal(guessPaint(infos), "m1");
});

test("without hints the biggest ordinary material is the paint", () => {
  const glass = new MeshPhysicalMaterial({ name: "m1", transmission: 1 });
  const root = sceneOf(panel(glass, 6), panel(std("m2", "#2244aa"), 3), panel(std("m3", "#ccaa00"), 2));
  assert.equal(guessPaint(listMaterials(root)), "m2");
  assert.equal(guessPaint([]), undefined);
});

test("roles come from the numbers when the name says nothing", () => {
  const root = sceneOf(
    panel(new MeshStandardMaterial({ name: "a", opacity: 0.3, transparent: true }), 1),
    panel(std("b", "#cccccc", { metalness: 1, roughness: 0.1 }), 1),
    panel(std("c", "#050505", { metalness: 0, roughness: 0.9 }), 1),
    panel(std("d", "#2244aa"), 1),
  );
  const roles = byKey(root);
  assert.equal(roles.a.role, "glass");
  assert.equal(roles.b.role, "chrome");
  assert.equal(roles.c.role, "rubber");
  assert.equal(roles.d.role, "other");
  assert.equal(roles.d.color, "#2244aa");
});

test("name roles: lamps, tails, plates, glass, chrome, tyres", () => {
  const names = { Headlight_L: "lamp", Tail_Light: "tail", License_plate: "plate", WindshieldGlass: "glass", Chrome_trim: "chrome", Tyre: "rubber", Black: "rubber", "Metallic red": "other" };
  const root = sceneOf(...Object.keys(names).map((n) => panel(std(n, "#808080"), 1)));
  const roles = byKey(root);
  for (const [n, role] of Object.entries(names)) assert.equal(roles[n].role, role, n);
});

test("area is world surface: scaling a mesh changes it", () => {
  const big = panel(std("Big", "#fff"), 1);
  big.scale.setScalar(2);
  const root = sceneOf(big, panel(std("Small", "#fff"), 1));
  const infos = byKey(root);
  assert.ok(Math.abs(infos.Big.area - 24) < 1e-6);
  assert.ok(Math.abs(infos.Small.area - 6) < 1e-6);
});

test("unnamed and duplicate names get stable #n keys, also on a clone", () => {
  const root = sceneOf(panel(std("", "#111111"), 1), panel(std("Dup", "#222222"), 1), panel(std("Dup", "#333333"), 1), panel(new MeshBasicMaterial({ color: "#444444" }), 1));
  const keys = listMaterials(root).map((i) => i.key).sort();
  assert.deepEqual(keys, ["#0", "#2", "#3", "Dup"]);
  const copy = clone(root) as Group;
  assert.deepEqual(listMaterials(copy).map((i) => i.key).sort(), keys);
});

/** template: paint, glass, chrome, a lamp, a tail light and a plate */
function template() {
  const parts = {
    paint: std("CarPaint", "#aa0000", { roughness: 0.9, metalness: 0.1 }),
    glass: std("Glass", "#102030"),
    chrome: std("Chrome", "#cccccc"),
    lamp: std("Headlight", "#dddddd"),
    tail: std("TailLight", "#aa1111"),
    plate: std("Plate", "#ffffff"),
  };
  const root = sceneOf(...Object.values(parts).map((m, i) => panel(m, 1, i * 2)));
  return { root, parts };
}
const base = { finish: "metallic" as const, keepOriginal: false, ghost: false };

test("prepareInstance copies only the paint; everything else stays shared", () => {
  const { root, parts } = template();
  const inst = clone(root) as Group;
  const h = prepareInstance(inst, { ...base, paintKey: "CarPaint", color: "#00aa00" });
  const [paint, glass, chrome, lamp, tail, plate] = meshes(inst).map((m) => m.material as Material);
  assert.notEqual(paint, parts.paint);
  assert.ok(paint instanceof MeshPhysicalMaterial);
  assert.equal(glass, parts.glass);
  assert.equal(chrome, parts.chrome);
  assert.equal(plate, parts.plate);
  assert.notEqual(lamp, parts.lamp);
  assert.notEqual(tail, parts.tail);
  assert.equal(h.lamps[0], lamp);
  assert.equal(h.tails[0], tail);
  assert.equal(parts.paint.color.getHexString(), "aa0000");
});

test("recolour changes colour and finish; keepOriginal leaves the paint alone", () => {
  const { root, parts } = template();
  const a = clone(root) as Group;
  prepareInstance(a, { ...base, paintKey: "CarPaint", color: "#00aa00" });
  const painted = meshes(a)[0].material as MeshPhysicalMaterial;
  assert.equal(painted.color.getHexString(), "00aa00");
  assert.notEqual(painted.metalness, 0.1);
  assert.notEqual(painted.roughness, 0.9);

  const b = clone(root) as Group;
  prepareInstance(b, { ...base, paintKey: "CarPaint", color: "#00aa00", keepOriginal: true });
  const kept = meshes(b)[0].material as MeshPhysicalMaterial;
  assert.equal(kept.color.getHexString(), "aa0000");
  assert.equal(kept.roughness, 0.9);
  assert.equal(kept.metalness, 0.1);
  assert.equal(parts.paint.color.getHexString(), "aa0000");
});

test("lamps and tails come back as dark emissive copies; plates are listed", () => {
  const { root } = template();
  const h = prepareInstance(clone(root) as Group, { ...base, paintKey: "CarPaint" });
  assert.equal(h.lamps.length, 1);
  assert.equal(h.tails.length, 1);
  for (const m of [...h.lamps, ...h.tails]) {
    assert.equal(m.emissiveIntensity, 0);
    assert.equal(m.toneMapped, false);
  }
  assert.equal(h.tails[0].emissive.getHexString(), "aa1111");
  assert.equal(h.lamps[0].emissive.getHexString(), "dddddd");
  assert.deepEqual(h.plates.map((m) => (m.material as Material).name), ["Plate"]);
});

test("ghost makes every material a transparent copy and leaves the template alone", () => {
  const { root, parts } = template();
  const inst = clone(root) as Group;
  prepareInstance(inst, { ...base, paintKey: "CarPaint", ghost: true });
  for (const m of meshes(inst)) {
    const mat = m.material as Material;
    assert.equal(mat.transparent, true);
    assert.equal(mat.opacity, 0.22);
    assert.equal(mat.depthWrite, false);
  }
  for (const m of Object.values(parts)) {
    assert.equal(m.opacity, 1);
    assert.equal(m.depthWrite, true);
  }
});

test("dispose frees only the copies", () => {
  const { root, parts } = template();
  const disposed: string[] = [];
  for (const m of Object.values(parts)) m.addEventListener("dispose", () => disposed.push(m.name));
  const inst = clone(root) as Group;
  const copies = meshes(inst).map((m) => m.material as Material);
  const h = prepareInstance(inst, { ...base, paintKey: "CarPaint" });
  const used = meshes(inst).map((m) => m.material as Material);
  const copyEvents: Material[] = [];
  for (const m of used) if (!copies.includes(m)) m.addEventListener("dispose", () => copyEvents.push(m));
  h.dispose();
  assert.deepEqual(disposed, []);
  assert.equal(copyEvents.length, 3);
});
