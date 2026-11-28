import assert from "node:assert/strict";
import test from "node:test";
import { gate, failure, ICON_CACHE } from "./mdiService.ts";
import { MdiError } from "./mdiIcons.ts";
import { gateFor } from "../guestOnly.ts";

const request = (headers?: HeadersInit) => new Request("http://doshy.local/api/icons/mdi/lamp", { headers: { host: "doshy.local", ...headers } });

test("icon proxy respects external opt-out and guest-only mode before any service use", async () => {
  for (const off of ["0", "off", "FALSE", " no "]) {
    const res = gate(request(), { DOSHY_EXTERNAL_DATA: off });
    assert.equal(res?.status, 403);
    assert.equal((await res?.json()).code, "off");
    assert.equal(res?.headers.get("cache-control"), "no-store");
  }
  assert.equal(gate(request(), { DOSHY_GUEST_ONLY: "1" })?.status, 404);
  assert.equal(gate(request(), {}), null);
  for (const path of ["/api/icons/mdi/lamp", "/api/icons/mdi?names=lamp", "/api/icons/search"]) assert.equal(gateFor(path, true), "block");
});

test("icon proxy refuses cross-site requests and limits allowed owner requests", () => {
  assert.equal(gate(request({ "sec-fetch-site": "cross-site" }), {})?.status, 403);
  assert.equal(gate(request({ origin: "http://outside.test" }), {})?.status, 403);
  const statuses = Array.from({ length: 301 }, () => gate(request({ "sec-fetch-site": "same-origin" }), {})?.status);
  assert.ok(statuses.includes(429));
});

test("proxy errors expose only its own plain sentence, and icon cache is private", async () => {
  const res = failure(new MdiError(503, "Icons are offline."));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "Icons are offline.", code: "offline" });
  assert.match(ICON_CACHE["cache-control"], /^private/);
});
