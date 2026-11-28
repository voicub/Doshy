import test from "node:test";
import assert from "node:assert/strict";
import { isRecord } from "../guards.ts";
import { STATES } from "../sceneFixture.ts";
import { createAutomation, deleteAutomation, listAutomations, setEnabled } from "./haAutomation.ts";
import type { HaFetch } from "./haCall.ts";

type Sent = { method: string; path: string; body: unknown };

const automationState = (id: string, over: Record<string, unknown> = {}) => ({ entity_id: `automation.${id.replace(/^doshy_/, "doshy_x_")}`, state: "on", attributes: { id, friendly_name: `Doshy: ${id}`, last_triggered: "2026-01-02T03:04:05+00:00" }, ...over });

/** A fake Home Assistant with a few automations (two of Doshy's, one of the owner's) and the record of every write made to it. */
function fakeHa(opts: { admin?: boolean; down?: boolean; invalid?: boolean } = {}) {
  const { admin = true, down = false, invalid = false } = opts;
  const sent: Sent[] = [];
  const configs: Record<string, unknown> = { doshy_a: { description: "Tell me when Kitchen window opens. Made by Doshy; change or remove it from Doshy's automations list." } };
  const fetchHa: HaFetch = async (path, init) => {
    if (down) throw new Error("connection refused");
    const method = init?.method ?? "GET";
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "states") return Response.json([...Object.values(STATES), automationState("doshy_a"), automationState("doshy_b", { state: "off" }), automationState("morning_routine")]);
    if (path === "services") return Response.json([{ domain: "notify", services: { mobile_app_phone: {}, send_message: {}, persistent_notification: {} } }, { domain: "light", services: { turn_on: {} } }]);
    sent.push({ method, path, body });
    if (path.startsWith("config/automation/config/")) {
      if (!admin) return new Response("forbidden", { status: 403 });
      const id = path.slice("config/automation/config/".length);
      if (method === "GET") return id in configs ? Response.json(configs[id]) : new Response("{}", { status: 404 });
      if (method === "DELETE") return id in configs ? Response.json({ result: "ok" }) : new Response("{}", { status: 400 });
      if (invalid) return new Response("{}", { status: 400 });
      return Response.json({ result: "ok" });
    }
    return Response.json([]);
  };
  return { fetchHa, sent };
}

const recipe = { type: "notify-open", entity: "binary_sensor.kitchen_window", notify: "notify.mobile_app_phone" };

test("creating needs the confirmation, then posts the built automation and reloads", async () => {
  const ha = fakeHa();
  assert.equal((await createAutomation({ action: "create", recipe }, ha.fetchHa, () => "r4nd0m")).status, 400, "no confirm, no write");
  assert.equal(ha.sent.length, 0);
  const r = await createAutomation({ action: "create", confirm: true, recipe }, ha.fetchHa, () => "r4nd0m");
  assert.equal(r.status, 200);
  assert.equal(r.body.id, "doshy_notify_open_r4nd0m");
  const post = ha.sent.find((s) => s.method === "POST" && s.path.startsWith("config/"));
  assert.equal(post?.path, "config/automation/config/doshy_notify_open_r4nd0m");
  assert.ok(isRecord(post?.body) && String(post.body.alias).startsWith("Doshy: "));
  assert.ok(ha.sent.some((s) => s.path === "services/automation/reload"));
  assert.deepEqual(ha.sent.filter((s) => s.method !== "GET").map((s) => s.path.split("/").slice(0, 2).join("/")), ["config/automation", "services/automation"]);
});

test("an invalid recipe never reaches Home Assistant", async () => {
  for (const bad of [{ ...recipe, entity: "binary_sensor.nope" }, { ...recipe, notify: "notify.persistent_notification" }, { ...recipe, notify: "notify.send_message" }, { type: "raw", yaml: "alias: x" }, "x", undefined]) {
    const ha = fakeHa();
    const r = await createAutomation({ action: "create", confirm: true, recipe: bad }, ha.fetchHa, () => "r4nd0m");
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(ha.sent.length, 0);
  }
});

test("when Home Assistant refuses, the answer is plain: the token needs administrator rights", async () => {
  const r = await createAutomation({ action: "create", confirm: true, recipe }, fakeHa({ admin: false }).fetchHa, () => "r4nd0m");
  assert.equal(r.status, 403);
  assert.match(String(r.body.error), /administrator/);
  const bad = await createAutomation({ action: "create", confirm: true, recipe }, fakeHa({ invalid: true }).fetchHa, () => "r4nd0m");
  assert.equal(bad.status, 400);
  const down = await createAutomation({ action: "create", confirm: true, recipe }, fakeHa({ down: true }).fetchHa, () => "r4nd0m");
  assert.equal(down.status, 502);
});

test("the list holds Doshy's automations only, and the notification services that exist", async () => {
  const r = await listAutomations(fakeHa().fetchHa);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.notify, ["notify.mobile_app_phone"]);
  const list = r.body.automations;
  assert.ok(Array.isArray(list));
  if (!Array.isArray(list)) return;
  assert.deepEqual(list.map((a) => isRecord(a) && [a.id, a.enabled, a.summary]), [["doshy_a", true, "Tell me when Kitchen window opens"], ["doshy_b", false, "doshy_b"]]);
});

test("switching on or off works by id and only for Doshy's", async () => {
  const ha = fakeHa();
  assert.equal((await setEnabled("doshy_b", true, ha.fetchHa)).status, 200);
  assert.deepEqual(ha.sent.at(-1), { method: "POST", path: "services/automation/turn_on", body: { entity_id: "automation.doshy_x_b" } });
  assert.equal((await setEnabled("doshy_a", false, ha.fetchHa)).status, 200);
  assert.equal(ha.sent.at(-1)?.path, "services/automation/turn_off");
  const before = ha.sent.length;
  for (const id of ["morning_routine", "automation.morning_routine", "doshy_", "../x", 5, undefined]) assert.equal((await setEnabled(id, true, ha.fetchHa)).status, 400, String(id));
  assert.equal((await setEnabled("doshy_missing", true, ha.fetchHa)).status, 404);
  assert.equal((await setEnabled("doshy_a", "yes", ha.fetchHa)).status, 400);
  assert.equal(ha.sent.length, before, "nothing else was sent");
});

test("deleting only ever touches ids starting doshy_", async () => {
  const ha = fakeHa();
  assert.equal((await deleteAutomation("doshy_a", ha.fetchHa)).status, 200);
  assert.deepEqual(ha.sent[0], { method: "DELETE", path: "config/automation/config/doshy_a", body: undefined });
  const before = ha.sent.length;
  for (const id of ["morning_routine", "doshy", "doshy_a/../../x", "Doshy_a", "", null, 7, "doshy_a?x=1"]) assert.equal((await deleteAutomation(id, ha.fetchHa)).status, 400, String(id));
  assert.equal(ha.sent.length, before);
  assert.equal((await deleteAutomation("doshy_gone", ha.fetchHa)).status, 404);
  assert.equal((await deleteAutomation("doshy_a", fakeHa({ admin: false }).fetchHa)).status, 403);
});
