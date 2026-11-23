import assert from "node:assert/strict";
import test from "node:test";
import { createWakeLock, type WakeApi, type WakeSentinel, type WakeStatus } from "./wakeLock.ts";

function fakeApi(fail = false) {
  const sentinels: { s: WakeSentinel; drop: () => void; released: boolean }[] = [];
  const api: WakeApi = {
    request: async () => {
      if (fail) throw new Error("NotAllowedError");
      let onRelease = () => {};
      const rec = { released: false, drop: () => onRelease(), s: null as unknown as WakeSentinel };
      rec.s = {
        release: async () => {
          rec.released = true;
          onRelease();
        },
        addEventListener: (_t, fn) => (onRelease = fn),
      };
      sentinels.push(rec);
      return rec.s;
    },
  };
  return { api, sentinels };
}

test("takes the lock when wanted and releases it when not", async () => {
  const { api, sentinels } = fakeApi();
  const log: WakeStatus[] = [];
  const w = createWakeLock(api, () => true, (s) => log.push(s));
  await w.set(true);
  assert.deepEqual(log, ["on"]);
  await w.set(true);
  assert.equal(sentinels.length, 1, "asking twice does not take a second lock");
  await w.set(false);
  assert.equal(sentinels[0].released, true);
  assert.equal(log.at(-1), "off");
});

test("the browser drops the lock when the tab is hidden; it is taken again when the tab is shown", async () => {
  const { api, sentinels } = fakeApi();
  let visible = true;
  const log: WakeStatus[] = [];
  const w = createWakeLock(api, () => visible, (s) => log.push(s));
  await w.set(true);
  visible = false;
  sentinels[0].drop(); // the browser's own release
  assert.equal(log.at(-1), "off");
  await w.resume();
  assert.equal(sentinels.length, 1, "nothing is requested while hidden");
  visible = true;
  await w.resume();
  assert.equal(sentinels.length, 2);
  assert.equal(log.at(-1), "on");
});

test("no API (plain http) reports unsupported; a refusal reports blocked", async () => {
  const none: WakeStatus[] = [];
  await createWakeLock(undefined, () => true, (s) => none.push(s)).set(true);
  assert.deepEqual(none, ["unsupported"]);
  const refused: WakeStatus[] = [];
  await createWakeLock(fakeApi(true).api, () => true, (s) => refused.push(s)).set(true);
  assert.deepEqual(refused, ["blocked"]);
});

test("switching off while the request is still pending leaves no lock behind", async () => {
  const { api, sentinels } = fakeApi();
  const w = createWakeLock(api, () => true, () => {});
  const on = w.set(true);
  const off = w.set(false);
  await Promise.all([on, off]);
  assert.ok(sentinels.every((x) => x.released));
});

test("resume does nothing when the lock is not wanted", async () => {
  const { api, sentinels } = fakeApi();
  const w = createWakeLock(api, () => true, () => {});
  await w.resume();
  assert.equal(sentinels.length, 0);
});
