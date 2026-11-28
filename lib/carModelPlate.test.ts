import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Euler, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { fitMatrix, modelPlates } from "./carModelPlate.ts";
import type { Fit } from "./carModels.ts";
import { PLATE_LIFT, plateRotation } from "./plate.ts";

const LENGTH = 4.4;
const HEIGHT = 1.5;

/** A boxy "car" standing on y = 0, its length along z (`alongX` turns it a quarter so it lies along x, as a download in another orientation would). */
function boxCar(alongX = false) {
  const root = new Group();
  const body = new Mesh(new BoxGeometry(1.8, HEIGHT, LENGTH), new MeshBasicMaterial());
  body.position.y = HEIGHT / 2;
  root.add(body);
  if (alongX) root.rotation.y = -Math.PI / 2; // native +z becomes +x
  return root;
}

const fit = (over: Partial<Fit> = {}): Fit => ({ yaw: 0, scale: [1, 1, 1], yOffset: 0, centre: [0, 0, 0], differs: false, ...over });
const dims = { d: LENGTH, h: HEIGHT };

test("a plate lies on each end of the car, centred, upright, facing outward, a lift above the surface", () => {
  const [front, rear] = modelPlates(boxCar(), fit(), dims);
  assert.deepEqual([front.end, rear.end], ["front", "rear"]);
  assert.ok(Math.abs(front.p[0]) < 1e-9 && Math.abs(rear.p[0]) < 1e-9);
  assert.ok(Math.abs(front.p[2] - (LENGTH / 2 + PLATE_LIFT)) < 1e-6, `front z ${front.p[2]}`);
  assert.ok(Math.abs(rear.p[2] + (LENGTH / 2 + PLATE_LIFT)) < 1e-6, `rear z ${rear.p[2]}`);
  assert.ok(front.rot.every((r) => Math.abs(r) < 1e-9), "the front plate faces straight ahead");
  assert.ok(Math.abs(rear.rot[1] - Math.PI) < 1e-9, "the rear plate is turned to face backwards");
  for (const m of [front, rear]) assert.ok(m.p[1] > 0.1 * HEIGHT && m.p[1] < 0.7 * HEIGHT, `plate height ${m.p[1]}`);
});

test("the fit (turn, scale, lift, centre) is applied: a model lying along x still gets its plates on the car's own ends", () => {
  const car = boxCar(true);
  const f = fit({ yaw: Math.PI / 2, scale: [1.1, 1, 0.9], yOffset: 0.05, centre: [0.2, 0, -0.3] });
  const [front, rear] = modelPlates(car, f, dims);
  // where the two ends of the box land in the car's frame
  const toCar = fitMatrix(f).multiply(car.matrixWorld);
  const ends = [LENGTH / 2, -LENGTH / 2].map((z) => new Vector3(0, 0, z).applyMatrix4(toCar).z);
  assert.ok(Math.abs(front.p[2] - (Math.max(...ends) + PLATE_LIFT)) < 1e-6, `front z ${front.p[2]} vs ${ends}`);
  assert.ok(Math.abs(rear.p[2] - (Math.min(...ends) - PLATE_LIFT)) < 1e-6, `rear z ${rear.p[2]} vs ${ends}`);
});

test("the result is cached per model and fit, and a different fit is placed again", () => {
  const car = boxCar();
  const a = modelPlates(car, fit(), dims);
  assert.equal(modelPlates(car, fit(), dims), a);
  const b = modelPlates(car, fit({ scale: [1, 1, 1.2] }), dims);
  assert.notEqual(b, a);
  assert.ok(b[0].p[2] > a[0].p[2]);
});

test("a plate box facing +z ends up facing outward whatever the tilt: front along +z, rear along -z, both leaning up with the surface", () => {
  for (const ny of [-0.3, 0, 0.3]) {
    const front = new Vector3(0, 0, 1).applyEuler(new Euler(...plateRotation("front", ny)));
    const rear = new Vector3(0, 0, 1).applyEuler(new Euler(...plateRotation("rear", ny)));
    assert.ok(Math.abs(front.y - ny) < 1e-9 && front.z > 0);
    assert.ok(Math.abs(rear.y - ny) < 1e-9 && rear.z < 0);
  }
});
