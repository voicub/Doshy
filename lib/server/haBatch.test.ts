import test from "node:test";
import assert from "node:assert/strict";
import { STATES } from "../sceneFixture.ts";
import { MAX_ACTIONS } from "../sceneRun.ts";
import { runBatch } from "./haBatch.ts";
import type { HaFetch } from "./haCall.ts";

type Sent = { path: string; body: unknown };

/** A fake Home Assistant: the fixture's states and a record of every call made to it. `failing` names entities whose service call is refused. */
function fakeHa(failing: string[] = [], down = false) {
  const sent: Sent[] = [];
  const fetchHa: HaFetch = async (path, init) => {
    if (down) throw new Error("connection refused");
    if (path === "states") return Response.json(Object.values(STATES));
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ path, body });
    const target = body && typeof body === "object" && "entity_id" in body ? String(body.entity_id) : "";
    return failing.includes(target) ? new Response("no", { status: 500 }) : Response.json([]);
  };
  return { fetchHa, sent };
}

const act = (domain: string, service: string, entity_id: string, data?: Record<string, unknown>) => ({ domain, service, entity_id, ...(data ? { data } : {}) });

test("a scene runs every call and reports each one", async () => {
  const ha = fakeHa();
  const r = await runBatch({ actions: [act("light", "turn_on", "light.living_main", { brightness_pct: 20 }), act("cover", "close_cover", "cover.living_blind"), act("climate", "set_temperature", "climate.living", { temperature: 19 })] }, ha.fetchHa);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, results: [{ ok: true }, { ok: true }, { ok: true }] });
  assert.deepEqual(ha.sent.map((s) => s.path).sort(), ["services/climate/set_temperature", "services/cover/close_cover", "services/light/turn_on"]);
  assert.deepEqual(ha.sent.find((s) => s.path === "services/light/turn_on")?.body, { brightness_pct: 20, entity_id: "light.living_main" });
});

test("one failing device is reported where it happened and the rest still run", async () => {
  const ha = fakeHa(["light.kitchen_ceiling"]);
  const r = await runBatch({ actions: [act("light", "turn_off", "light.kitchen_ceiling"), act("light", "turn_off", "light.bedroom_ceiling"), act("light", "turn_off", "light.gone_missing")] }, ha.fetchHa);
  assert.equal(r.status, 200);
  assert.ok("results" in r.body);
  if (!("results" in r.body)) return;
  assert.equal(r.body.ok, false);
  assert.deepEqual(r.body.results.map((x) => x.ok), [false, true, false]);
  assert.match(r.body.results[0].error ?? "", /refused/);
  assert.match(r.body.results[2].error ?? "", /not known/);
  assert.equal(ha.sent.length, 2, "an entity Home Assistant does not know is not called");
});

test("a bad action refuses the whole batch and nothing is sent", async () => {
  const bad: unknown[] = [
    { actions: [act("light", "turn_off", "light.bedroom_ceiling"), act("homeassistant", "restart", "light.a")] },
    { actions: [act("lock", "unlock", "lock.front_door")] },
    { actions: [act("script", "turn_on", "script.bye", { variables: { x: 1 } })] },
    { actions: [act("light", "turn_on", "light.bedroom_ceiling", { brightness_pct: 500 })] },
    { actions: [act("climate", "set_temperature", "climate.living", { temperature: 31 })] }, // the thermostat's own limit is 30
    { actions: [act("cover", "open_cover", "cover.garage_door")] },
    { actions: [act("light", "turn_off", "switch.server")] },
    { actions: [] },
    { actions: "nope" },
    null,
    { actions: Array.from({ length: MAX_ACTIONS + 1 }, () => act("light", "turn_off", "light.bedroom_ceiling")) },
  ];
  for (const body of bad) {
    const ha = fakeHa();
    const r = await runBatch(body, ha.fetchHa);
    assert.equal(r.status, 400, JSON.stringify(body)?.slice(0, 80));
    assert.equal(ha.sent.length, 0);
  }
});

test("scene.turn_on and script.turn_on are allowed in a batch, only without arguments", async () => {
  const ha = fakeHa();
  const r = await runBatch({ actions: [act("scene", "turn_on", "scene.evening")] }, ha.fetchHa);
  assert.equal(r.status, 200);
  assert.deepEqual(ha.sent[0], { path: "services/scene/turn_on", body: { entity_id: "scene.evening" } });
  assert.equal((await runBatch({ actions: [act("script", "turn_on", "script.x", { a: 1 })] }, fakeHa().fetchHa)).status, 400);
  assert.equal((await runBatch({ actions: [act("scene", "turn_on", "light.x")] }, fakeHa().fetchHa)).status, 400);
});

test("a missing scene or script is reported, not run", async () => {
  const ha = fakeHa();
  const r = await runBatch({ actions: [act("script", "turn_on", "script.does_not_exist")] }, ha.fetchHa);
  assert.equal(r.status, 200);
  assert.ok("results" in r.body && !r.body.results[0].ok);
  assert.equal(ha.sent.length, 0);
});

test("Home Assistant being down is a plain 502", async () => {
  const r = await runBatch({ actions: [act("light", "turn_off", "light.bedroom_ceiling")] }, fakeHa([], true).fetchHa);
  assert.equal(r.status, 502);
  assert.ok("error" in r.body);
});
