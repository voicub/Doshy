import test from "node:test";
import assert from "node:assert/strict";
import { attentionItems, diffNotifications, readNotifications, relativeTime, shapeNotifications, socketUrl, wsCommand, type Socket } from "./haNotify.ts";
import { deleteBody, validateDelete, type CalEvent } from "./calendar.ts";

const raw = (id: unknown, created: string, extra = {}) => ({ notification_id: id, title: "T", message: "M", created_at: created, ...extra });

test("shapes notifications newest first and drops malformed ones", () => {
  const out = shapeNotifications([raw("old", "2026-01-01T00:00:00Z"), raw("new", "2026-02-01T00:00:00Z"), raw("bad id!", "2026-03-01T00:00:00Z"), raw(7, "x"), null, "x", { notification_id: "n", title: null }]);
  assert.deepEqual(out.map((n) => n.id).filter((id) => id !== "n"), ["new", "old"]);
  assert.equal(out.length, 3);
  assert.equal(out.find((n) => n.id === "n")?.title, "Notification");
  assert.deepEqual(shapeNotifications("nope"), []);
});

test("diff finds new and gone notifications; never opened means everything is new", () => {
  const now = shapeNotifications([raw("a", "2026-01-01T00:00:00Z"), raw("b", "2026-01-02T00:00:00Z")]);
  assert.deepEqual(diffNotifications(["a", "z"], now), { fresh: [now[0]], gone: ["z"] });
  assert.equal(diffNotifications(null, now).fresh.length, 2);
  assert.deepEqual(diffNotifications(["a", "b"], now), { fresh: [], gone: [] });
});

test("relative time: unparseable gives nothing, a clock-skewed future time reads like now", () => {
  const now = Date.parse("2026-06-10T12:00:00Z");
  assert.equal(relativeTime("garbage", now), "");
  assert.equal(relativeTime(new Date(now + 5000).toISOString(), now), relativeTime(new Date(now - 10_000).toISOString(), now));
});

test("attention: only problem and battery sensors that are on", () => {
  const st = (state: string, device_class?: string, friendly_name?: string) => ({ state, attributes: { device_class, friendly_name } });
  const out = attentionItems({
    "binary_sensor.leak": st("on", "problem", "Leak"),
    "binary_sensor.bat": st("on", "battery", "Bedroom battery"),
    "binary_sensor.fine": st("off", "problem"),
    "binary_sensor.door": st("on", "door"),
    "sensor.x": st("on", "problem"),
  });
  assert.deepEqual(out.map((a) => [a.id, a.why]), [["binary_sensor.bat", "battery"], ["binary_sensor.leak", "problem"]]);
});

class FakeSocket implements Socket {
  static script: (s: FakeSocket, msg: Record<string, unknown>) => void = () => {};
  static last: FakeSocket;
  static url = "";
  sent: Record<string, unknown>[] = [];
  closed = false;
  onmessage: Socket["onmessage"] = null;
  onerror: Socket["onerror"] = null;
  onclose: Socket["onclose"] = null;
  constructor(url: string) {
    FakeSocket.url = url;
    FakeSocket.last = this;
    queueMicrotask(() => this.say({ type: "auth_required" }));
  }
  say(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  send(d: string) { const m = JSON.parse(d); this.sent.push(m); FakeSocket.script(this, m); }
  close() { this.closed = true; }
}

test("socket url swaps http for ws and tolerates a trailing slash", () => {
  assert.equal(socketUrl("http://ha.local:8123/"), "ws://ha.local:8123/api/websocket");
  assert.equal(socketUrl("https://ha.example.org"), "wss://ha.example.org/api/websocket");
});

test("authenticates, asks for notifications and returns them shaped; closes the socket", async () => {
  FakeSocket.script = (s, m) => {
    if (m.type === "auth") s.say({ type: "auth_ok" });
    if (m.type === "persistent_notification/get") s.say({ id: 1, type: "result", success: true, result: [raw("a", "2026-01-01T00:00:00Z")] });
  };
  const out = await readNotifications("http://ha:8123", "SECRET", FakeSocket);
  assert.deepEqual(out.map((n) => n.id), ["a"]);
  assert.deepEqual(FakeSocket.last.sent, [{ type: "auth", access_token: "SECRET" }, { id: 1, type: "persistent_notification/get" }]);
  assert.equal(FakeSocket.url, "ws://ha:8123/api/websocket");
  assert.equal(FakeSocket.last.closed, true);
});

test("rejects on a refused token, a failed command, an error and a silent server", async () => {
  FakeSocket.script = (s, m) => { if (m.type === "auth") s.say({ type: "auth_invalid" }); };
  await assert.rejects(readNotifications("http://ha", "x", FakeSocket), /refused/);
  FakeSocket.script = (s, m) => {
    if (m.type === "auth") s.say({ type: "auth_ok" });
    else s.say({ id: 1, type: "result", success: false });
  };
  await assert.rejects(readNotifications("http://ha", "x", FakeSocket), /could not list/);
  FakeSocket.script = () => {};
  await assert.rejects(readNotifications("http://ha", "x", FakeSocket, 20), /in time/);
  assert.equal(FakeSocket.last.closed, true);
  FakeSocket.script = (s) => s.onerror?.({});
  await assert.rejects(readNotifications("http://ha", "x", FakeSocket), /reach/);
});

const ev = (over: Partial<CalEvent>): CalEvent => ({ id: "x", calendar: "calendar.family", uid: "u1", title: "T", description: "", location: "", allDay: false, start: 0, end: 1, ...over });

test("a calendar delete goes out as the exact WebSocket frame, once authenticated, and the result is returned", async () => {
  FakeSocket.script = (s, m) => {
    if (m.type === "auth") s.say({ type: "auth_ok" });
    else s.say({ id: 1, type: "result", success: true, result: null });
  };
  const body = deleteBody(ev({ recurrenceId: "20261121T100000Z" }), "future");
  const v = validateDelete(body);
  assert.ok(v.ok);
  await wsCommand("http://ha:8123", "SECRET", FakeSocket, v.value, "could not delete");
  assert.deepEqual(FakeSocket.last.sent, [
    { type: "auth", access_token: "SECRET" },
    { id: 1, type: "calendar/event/delete", entity_id: "calendar.family", uid: "u1", recurrence_id: "20261121T100000Z", recurrence_range: "THIS_AND_FUTURE" },
  ]);
  assert.equal(FakeSocket.last.closed, true);
});

test("a refused calendar delete rejects with the caller's sentence, not HA's", async () => {
  FakeSocket.script = (s, m) => {
    if (m.type === "auth") s.say({ type: "auth_ok" });
    else s.say({ id: 1, type: "result", success: false, error: { code: "not_found", message: "internal detail" } });
  };
  await assert.rejects(wsCommand("http://ha", "x", FakeSocket, { type: "calendar/event/delete" }, "Home Assistant could not delete the event"), (e: Error) => e.message === "Home Assistant could not delete the event");
});
