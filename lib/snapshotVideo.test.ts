import assert from "node:assert/strict";
import { test } from "node:test";
import { angleAtFrame, clampSeconds, frameCount, orbitAngle, pickVideoFormat, videoBitrate, VIDEO_SECONDS } from "./snapshotVideo.ts";

test("a constant-speed orbit turns the same amount every frame and covers the full circle", () => {
  const n = frameCount(10);
  assert.equal(n, 300);
  const step = angleAtFrame(1, n) - angleAtFrame(0, n);
  for (let i = 1; i < n; i++) assert.ok(Math.abs(angleAtFrame(i, n) - angleAtFrame(i - 1, n) - step) < 1e-9);
  assert.equal(angleAtFrame(0, n), 0);
  // the next frame after the last one is the first again: a looped clip has no repeated frame and no jump
  assert.ok(Math.abs(angleAtFrame(n - 1, n) + step - 360) < 1e-9);
  assert.ok(angleAtFrame(n - 1, n) < 360);
});

test("an eased orbit starts and ends slowly, never goes backwards and still turns a full circle", () => {
  const n = 300;
  const first = angleAtFrame(1, n, true) - angleAtFrame(0, n, true);
  const middle = angleAtFrame(151, n, true) - angleAtFrame(150, n, true);
  const last = orbitAngle(1, true) - angleAtFrame(n - 1, n, true);
  assert.ok(first < middle / 10 && last < middle / 10);
  for (let i = 1; i <= n; i++) assert.ok(orbitAngle(i / n, true) >= orbitAngle((i - 1) / n, true));
  assert.equal(orbitAngle(1, true), 360);
  assert.equal(orbitAngle(0.5, true), 180);
});

test("progress outside 0..1 or not a number is held at the ends", () => {
  assert.equal(orbitAngle(-3), 0);
  assert.equal(orbitAngle(7), 360);
  assert.equal(orbitAngle(NaN), 0);
});

test("the length is kept within 6 to 20 seconds and whole seconds", () => {
  assert.equal(clampSeconds(1), VIDEO_SECONDS.min);
  assert.equal(clampSeconds(99), VIDEO_SECONDS.max);
  assert.equal(clampSeconds(9.6), 10);
  assert.equal(clampSeconds(NaN), VIDEO_SECONDS.default);
  assert.equal(frameCount(0), 1);
});

test("MP4 is chosen when the browser records it, otherwise WebM with the best codec it knows", () => {
  assert.deepEqual(pickVideoFormat((m) => m.startsWith("video/mp4") || m.startsWith("video/webm"))?.ext, "mp4");
  assert.equal(pickVideoFormat((m) => m === "video/mp4")?.mime, "video/mp4");
  assert.equal(pickVideoFormat((m) => m.startsWith("video/webm"))?.mime, "video/webm;codecs=vp9");
  assert.equal(pickVideoFormat((m) => m === "video/webm;codecs=vp8")?.mime, "video/webm;codecs=vp8");
  assert.equal(pickVideoFormat((m) => m === "video/webm")?.ext, "webm");
});

test("a browser that records nothing gives null, and a custom list is respected", () => {
  assert.equal(pickVideoFormat(() => false), null);
  assert.equal(pickVideoFormat(() => true, ["video/x-custom"])?.ext, "webm");
});

test("the bit rate grows with the picture and stays between sane bounds", () => {
  assert.ok(videoBitrate(1920, 1080) > videoBitrate(800, 480));
  assert.equal(videoBitrate(100, 100), 2_000_000);
  assert.equal(videoBitrate(8000, 6000), 16_000_000);
  assert.ok(Number.isFinite(videoBitrate(-1, NaN)));
});
