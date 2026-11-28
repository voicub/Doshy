import assert from "node:assert/strict";
import test from "node:test";
import { fetchMdiBatch, fetchMdiSearch } from "./mdiClient.ts";

const lamp = { body: '<path d="M0 0h24v24H0z"/>', width: 24, height: 24 };

test("guest icon rendering and search make zero requests, even for an uncached manual icon", async () => {
  let calls = 0;
  const fetchFn: typeof fetch = async () => { calls++; throw new Error("A guest must not fetch icons"); };
  assert.deepEqual(await fetchMdiBatch(["lamp"], true, fetchFn), { icons: {}, off: false });
  assert.deepEqual(await fetchMdiSearch("lamp", true, undefined, fetchFn), []);
  assert.equal(calls, 0);
});

test("browser transport only keeps requested sanitized drawings, and treats the external gate separately from offline", async () => {
  const got = await fetchMdiBatch(["lamp", "evil", "../x"], false, async (url) => {
    assert.equal(url, "/api/icons/mdi?names=lamp,evil");
    return Response.json({ icons: { lamp, evil: { ...lamp, body: '<image href="https://bad.test"/>' }, unasked: lamp } });
  });
  assert.deepEqual(got, { icons: { lamp }, off: false });
  assert.deepEqual(await fetchMdiBatch(["lamp"], false, async () => new Response(null, { status: 403 })), { icons: {}, off: true });
  await assert.rejects(fetchMdiBatch(["lamp"], false, async () => new Response(null, { status: 503 })), /downloaded/);
});

test("browser search normalizes queries, validates names, propagates cancellation and makes no request for empty text", async () => {
  const controller = new AbortController();
  assert.deepEqual(await fetchMdiSearch(" LAMP! ", false, controller.signal, async (url, init) => {
    assert.equal(url, "/api/icons/search?q=lamp&limit=48");
    assert.equal(init?.signal, controller.signal);
    return Response.json({ names: ["lamp", "desk-lamp", "lamp"] });
  }), ["lamp", "desk-lamp"]);
  assert.deepEqual(await fetchMdiSearch("lamp", false, undefined, async () => Response.json({ names: ["../x", "lamp"] })), []);
  assert.deepEqual(await fetchMdiSearch("!", false, undefined, async () => { throw new Error("must not fetch"); }), []);
  await assert.rejects(fetchMdiSearch("lamp", false, undefined, async () => new Response(null, { status: 403 })), /switched off/);
  await assert.rejects(fetchMdiSearch("lamp", false, undefined, async () => new Response(null, { status: 503 })), /searched/);
});
