import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchStates } from "./ha.ts";

const list = [{ entity_id: "light.a", state: "on", attributes: {} }];

test("fetchStates sends the last ETag back and reuses the list on a 304", async () => {
  const seen: (string | null)[] = [];
  const fake: typeof fetch = async (_url, init) => {
    const sent = new Headers(init?.headers).get("if-none-match");
    seen.push(sent);
    return sent === '"v1"' ? new Response(null, { status: 304 }) : Response.json(list, { headers: { etag: '"v1"' } });
  };
  const first = await fetchStates(fake);
  const second = await fetchStates(fake);
  assert.deepEqual(seen, [null, '"v1"']);
  assert.equal(second, first, "unchanged: the same array, no new parse");
});

test("fetchStates reports the server's message when Home Assistant fails", async () => {
  const down: typeof fetch = async () => Response.json({ error: "Home Assistant HTTP 502" }, { status: 502 });
  await assert.rejects(fetchStates(down), /Home Assistant HTTP 502/);
});

test("fetchStates gives up on a server that never answers", async () => {
  const hung: typeof fetch = (_url, init) => {
    const never = Promise.withResolvers<Response>();
    init?.signal?.addEventListener("abort", () => never.reject(init.signal?.reason));
    return never.promise;
  };
  await assert.rejects(fetchStates(hung, 20));
});
