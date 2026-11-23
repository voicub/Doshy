import test from "node:test";
import assert from "node:assert/strict";
import { CAMERA_ENTITY, IMAGE_TYPE, MAX_PER_MINUTE, MIN_GAP_MS, etagOf, makeLimiter } from "./cameraProxy.ts";

test("only camera entities with plain ids are accepted", () => {
  assert.ok(CAMERA_ENTITY.test("camera.front_door"));
  assert.ok(CAMERA_ENTITY.test("camera.cam_2"));
  for (const bad of ["light.kitchen", "camera.", "camera.Front", "camera.a/b", "camera.a?x=1", "camera.a b", "../camera.x", "camera.x\n", "camera.x.y"]) assert.ok(!CAMERA_ENTITY.test(bad), bad);
});

test("only still images are passed on", () => {
  assert.ok(IMAGE_TYPE.test("image/jpeg"));
  assert.ok(IMAGE_TYPE.test("image/png; charset=binary"));
  assert.ok(!IMAGE_TYPE.test("text/html"));
  assert.ok(!IMAGE_TYPE.test("image/svg+xml"));
  assert.ok(!IMAGE_TYPE.test("multipart/x-mixed-replace"));
});

test("a camera is asked for at most once per gap, another camera is unaffected", () => {
  let t = 1_000_000;
  const check = makeLimiter(() => t);
  assert.deepEqual(check("camera.a"), { ok: true });
  assert.equal(check("camera.a").ok, false);
  assert.deepEqual(check("camera.b"), { ok: true });
  t += MIN_GAP_MS;
  assert.deepEqual(check("camera.a"), { ok: true });
  const blocked = check("camera.a");
  assert.ok(!blocked.ok && blocked.retryAfter >= 1);
});

test("all cameras together are capped per minute, and the cap lifts as time passes", () => {
  let t = 5_000_000;
  const check = makeLimiter(() => t);
  for (let i = 0; i < MAX_PER_MINUTE; i++) {
    assert.equal(check(`camera.c${i}`).ok, true);
    t += 100;
  }
  assert.equal(check("camera.extra").ok, false);
  t += 61_000;
  assert.equal(check("camera.extra").ok, true);
});

test("equal pictures get equal tags", () => {
  assert.equal(etagOf(new Uint8Array([1, 2, 3])), etagOf(new Uint8Array([1, 2, 3])));
  assert.notEqual(etagOf(new Uint8Array([1, 2, 3])), etagOf(new Uint8Array([1, 2, 4])));
});
