import assert from "node:assert/strict";
import { test } from "node:test";
import { ISS_FAILURE_TTL_MS, ISS_MAX_BYTES, ISS_TIMEOUT_MS, ISS_TTL_MS, ISS_URL, makeIssFetcher, USER_AGENT } from "./iss.ts";

const now = 1767225600000;
const raw = { latitude: 0, longitude: 0, altitude: 420, velocity: 27600, timestamp: now / 1000, units: "kilometers" };
const payload = [{ ...raw, latitude: -1.5, timestamp: raw.timestamp - 30 }, raw];

test("external-data off prevents fetch even when a successful answer was cached", async () => {
  const env = { DOSHY_EXTERNAL_DATA: "0" };
  const get = makeIssFetcher(env);
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(payload); };
  assert.deepEqual(await get(fetcher, () => now), { disabled: true });
  assert.equal(calls, 0);
  env.DOSHY_EXTERNAL_DATA = "1";
  assert.ok("fix" in await get(fetcher, () => now));
  env.DOSHY_EXTERNAL_DATA = "false";
  assert.deepEqual(await get(fetcher, () => now + 1), { disabled: true });
  assert.equal(calls, 1);
});

test("fixed endpoint sends only timestamps, uses identifying headers and shares cache", async () => {
  const get = makeIssFetcher({});
  let calls = 0;
  const fetcher = async (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => {
    calls++;
    assert.equal(url, `${ISS_URL}?timestamps=${raw.timestamp - 30},${raw.timestamp}&units=kilometers`);
    assert.equal(init.headers["user-agent"], USER_AGENT);
    assert.equal(init.headers.accept, "application/json");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(payload);
  };
  const [a, b] = await Promise.all([get(fetcher, () => now), get(fetcher, () => now)]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.ok("fix" in a && a.fix.timestamp === raw.timestamp && a.prevFix?.timestamp === raw.timestamp - 30);
  assert.deepEqual(await get(fetcher, () => now + ISS_TTL_MS - 1), a);
  assert.equal(calls, 1);
  // Refresh fetch fixture must follow the newly requested timestamp.
  await get(async () => { calls++; return Response.json(payload.map((p) => ({ ...p, timestamp: p.timestamp + ISS_TTL_MS / 1000 }))); }, () => now + ISS_TTL_MS);
  assert.equal(calls, 2);
});

test("bad JSON, shape, invalid fixes, stale fixes and HTTP failures become unavailable", async () => {
  const responses = [
    () => new Response("not json"),
    () => Response.json({}),
    () => Response.json([raw]),
    () => Response.json([payload[0], { ...raw, latitude: 100 }]),
    () => Response.json(payload.map((p) => ({ ...p, timestamp: p.timestamp - 600 }))),
    () => Response.json([raw, payload[0]]),
    () => new Response("rate limited", { status: 429 }),
    () => new Response(null, { status: 204 }),
  ];
  for (const response of responses) assert.deepEqual(await makeIssFetcher({})(async () => response(), () => now), { unavailable: true });
});

test("oversize streamed and announced bodies are capped and cancelled", async () => {
  for (const length of [undefined, "1", String(ISS_MAX_BYTES * 2)]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(ISS_MAX_BYTES + 1)); },
      cancel() { cancelled = true; },
    });
    const headers = length ? { "content-length": length } : undefined;
    assert.deepEqual(await makeIssFetcher({})(async () => new Response(stream, { headers }), () => now), { unavailable: true });
    assert.equal(cancelled, true);
  }
});

test("timeout signal is configured and failures are cached without hammering upstream", async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout", (ms: number) => {
    assert.equal(ms, ISS_TIMEOUT_MS);
    return AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
  });
  const get = makeIssFetcher({});
  let calls = 0;
  const fetcher = async (_url: string, init: { signal: AbortSignal }) => {
    calls++;
    init.signal.throwIfAborted();
    return Response.json(payload);
  };
  assert.deepEqual(await get(fetcher, () => now), { unavailable: true });
  assert.deepEqual(await get(fetcher, () => now + ISS_FAILURE_TTL_MS - 1), { unavailable: true });
  assert.equal(calls, 1);
  assert.deepEqual(await get(fetcher, () => now + ISS_FAILURE_TTL_MS), { unavailable: true });
  assert.equal(calls, 2);
  timeout.mock.restore();
});
