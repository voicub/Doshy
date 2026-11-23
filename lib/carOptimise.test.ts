import assert from "node:assert/strict";
import { test } from "node:test";
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry, TorusKnotGeometry, Vector3, type Object3D } from "three";
import { countTriangles, optimiseCar, simplifyGeometry } from "./carOptimise.ts";

const mat = (name: string, color = "#336699") => new MeshStandardMaterial({ name, color });
const named = (m: Mesh, name: string) => Object.assign(m, { name });
const meshesOf = (g: Object3D) => g.children as Mesh[];
const near = (root: Object3D) => root.getObjectByName("near") as Group;
const far = (root: Object3D) => root.getObjectByName("far") as Group;
const boxOf = (o: Object3D) => new Box3().setFromObject(o);

/** body, glass, 4 wheels (one shared material), a screw and an engine, inside two nested transforms. */
function carScene() {
  const paint = mat("CarPaint");
  const rubber = mat("Rubber", "#111111");
  const car = new Group();
  car.add(named(new Mesh(new BoxGeometry(4, 1, 1.8, 12, 4, 6), paint), "Body"));
  const glass = new Mesh(new BoxGeometry(2, 0.6, 1.6, 4, 2, 4), new MeshPhysicalMaterial({ name: "Glass", transparent: true, opacity: 0.4 }));
  glass.position.set(0, 0.8, 0);
  car.add(named(glass, "Cabin"));
  for (const [x, z] of [[1.3, 0.9], [-1.3, 0.9], [1.3, -0.9], [-1.3, -0.9]]) {
    const w = new Mesh(new CylinderGeometry(0.35, 0.35, 0.25, 24), rubber);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, -0.5, z);
    car.add(named(w, "Wheel"));
  }
  const screw = new Mesh(new CylinderGeometry(0.01, 0.01, 0.03, 8), mat("Steel"));
  screw.position.set(0, 0.2, 0);
  car.add(named(screw, "Part_17"));
  const engine = new Mesh(new BoxGeometry(0.8, 0.5, 0.8, 3, 3, 3), mat("Dark"));
  engine.position.set(1.2, 0, 0);
  car.add(named(engine, "Engine"));
  const outer = new Group();
  outer.position.set(10, 2, -3);
  outer.rotation.set(0.2, 0.7, 0.1);
  outer.scale.setScalar(1.5);
  car.position.set(1, 0, 2);
  car.rotation.y = 1;
  outer.add(car);
  const scene = new Group();
  scene.add(outer);
  return scene;
}

test("world transforms are baked, one mesh per material, near and far exist", async () => {
  const scene = new Group();
  const inner = new Group();
  inner.position.set(3, 1, -2);
  inner.rotation.set(0.3, 1.1, -0.4);
  inner.scale.set(2, 1, 1.5);
  inner.add(new Mesh(new BoxGeometry(4, 1, 2, 3, 3, 3), mat("CarPaint")));
  scene.add(inner);
  const before = boxOf(scene);
  const { root } = await optimiseCar(scene);
  assert.deepEqual(root.children.map((c) => c.name), ["near", "far"]);
  assert.equal(meshesOf(near(root)).length, 1);
  assert.equal(meshesOf(far(root)).length, 1);
  const after = boxOf(root);
  for (const [a, b] of [[before.min, after.min], [before.max, after.max]]) assert.ok(a.distanceTo(b) < 1e-4, `${a.toArray()} vs ${b.toArray()}`);
});

test("hidden and tiny parts are dropped and counted, the rest merged per material", async () => {
  const { root, report } = await optimiseCar(carScene());
  assert.equal(report.droppedParts, 2);
  assert.deepEqual(meshesOf(near(root)).map((m) => m.name).sort(), ["CarPaint", "Glass", "Rubber"]);
  assert.equal(report.materials, 3);
  assert.equal(report.near, countTriangles(near(root)));
  assert.ok(report.trianglesBefore > report.near);
  assert.equal(report.texturesResized, 0);
});

test("only position, normal and uv are kept, indexed", async () => {
  const { root } = await optimiseCar(carScene());
  for (const m of [...meshesOf(near(root)), ...meshesOf(far(root))]) {
    assert.deepEqual(Object.keys(m.geometry.attributes).sort(), ["normal", "position", "uv"]);
    assert.ok(m.geometry.index);
  }
});

test("a flat-shaded, non-indexed model (every vertex split) still lands on both budgets", async () => {
  const flat = new SphereGeometry(1, 300, 150).toNonIndexed(); // ~ 90k triangles, a separate vertex per corner
  flat.computeVertexNormals(); // flat normals: a hard edge everywhere
  const knot = new TorusKnotGeometry(0.4, 0.12, 400, 60).toNonIndexed();
  knot.computeVertexNormals();
  const scene = new Group();
  scene.add(new Mesh(flat, mat("CarPaint")), new Mesh(knot, mat("Chrome")));
  const { report } = await optimiseCar(scene);
  assert.ok(report.trianglesBefore > 100000, `before ${report.trianglesBefore}`);
  assert.ok(Math.abs(report.near - 60000) <= 6000, `near ${report.near}`);
  assert.ok(Math.abs(report.far - 8000) <= 1200, `far ${report.far}`);
});

test("welding shrinks the vertices of a non-indexed box", async () => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1).toNonIndexed(), mat("CarPaint")));
  const { root } = await optimiseCar(scene);
  const geo = meshesOf(near(root))[0].geometry;
  assert.equal(geo.getAttribute("position").count, 24);
  assert.equal(countTriangles(near(root)), 12);
});

test("an unlimited near budget (\"keep every detail\") keeps all the triangles that a limited one removes", async () => {
  const make = () => {
    const scene = new Group();
    scene.add(new Mesh(new SphereGeometry(1, 128, 128), mat("CarPaint")));
    return scene;
  };
  const limited = await optimiseCar(make(), { near: 5000 });
  const full = await optimiseCar(make(), { near: Infinity });
  assert.ok(limited.report.near < 6000);
  assert.equal(full.report.near, full.report.trianglesBefore);
});

test("decimation lands near the targets and far is lighter than near", async () => {
  const scene = new Group();
  scene.add(new Mesh(new SphereGeometry(1, 224, 224), mat("CarPaint")));
  const { root, report } = await optimiseCar(scene, { near: 20000, far: 2000 });
  assert.ok(report.trianglesBefore > 99000);
  assert.ok(Math.abs(report.near - 20000) <= 3000, `near ${report.near}`);
  assert.ok(Math.abs(report.far - 2000) <= 300, `far ${report.far}`);
  assert.ok(report.far < report.near);
  assert.equal(countTriangles(far(root)), report.far);
});

test("simplifyGeometry hands back small meshes untouched", async () => {
  const g = new BoxGeometry(1, 1, 1);
  assert.equal(await simplifyGeometry(g, 100), g);
});

test("ground planes and shadow blobs are dropped, a plate on the car stays", async () => {
  const scene = carScene();
  const ground = named(new Mesh(new BoxGeometry(60, 0.001, 60), mat("Ground")), "Ground");
  const plate = named(new Mesh(new BoxGeometry(0.5, 0.12, 0.01), mat("Plate")), "Plate");
  plate.position.set(2, 0, 0);
  scene.add(ground, plate);
  const { root, report } = await optimiseCar(scene);
  assert.equal(report.droppedParts, 3);
  const names = meshesOf(near(root)).map((m) => m.name);
  assert.ok(!names.includes("Ground") && names.includes("Plate"));
  assert.ok(boxOf(root).getSize(new Vector3()).x < 20);
});

test("the input scene is left alone", async () => {
  const scene = carScene();
  const first = scene.children[0].children[0] as Group;
  const snapshot = () => JSON.stringify([scene.toJSON().object, first.children.length, first.children.map((c) => (c as Mesh).geometry.getAttribute("position").count)]);
  const before = snapshot();
  const body = first.children[0] as Mesh;
  const material = body.material;
  const positions = Array.from(body.geometry.getAttribute("position").array.slice(0, 12));
  const { root } = await optimiseCar(scene);
  assert.equal(snapshot(), before);
  assert.equal(body.material, material);
  assert.deepEqual(Array.from(body.geometry.getAttribute("position").array.slice(0, 12)), positions);
  assert.notEqual(meshesOf(near(root))[0].material, material);
});

test("progress runs 0..1 and never goes backwards", async () => {
  const seen: [number, string][] = [];
  await optimiseCar(carScene(), {}, (f, s) => seen.push([f, s]));
  assert.equal(seen.at(-1)?.[0], 1);
  assert.ok(seen.every(([f], i) => f >= 0 && f <= 1 && (i === 0 || f >= seen[i - 1][0])));
});
