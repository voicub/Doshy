import assert from "node:assert/strict";
import { test } from "node:test";
import { gateFor, guestOnlyAllows, isGuestPath } from "./guestOnly.ts";

test("a guest-only Doshy serves the guest page, the guest API, Next's files and the icons", () => {
  for (const ok of ["/view/AbCdEfGhIjKlMnOpQrStUv", "/api/guest/AbCdEfGhIjKlMnOpQrStUv/plan", "/api/guest/AbCdEfGhIjKlMnOpQrStUv/resource/m_1", "/_next/static/chunks/a.js", "/icon.svg", "/apple-touch-icon.png", "/manifest.webmanifest"]) {
    assert.equal(guestOnlyAllows(ok), true, ok);
  }
});

test("everything else is not found: the owner's screen, the owner's database and Home Assistant routes, the link manager", () => {
  for (const no of ["/", "/api/db/dashboards", "/api/db/guest-links", "/api/db/backup", "/api/ha/states", "/api/ha/toggle", "/api/site/tile/1/2/3", "/api/models/search", "/api/automation/curtains", "/sw.js", "/api/guest", "/api/guest/", "/view", "/view/", "/viewer/x", "/icon.svg/x", "/data/housey.db", "/housey-plan.json"]) {
    assert.equal(guestOnlyAllows(no), false, no);
  }
});

test("a path that two programs could read two ways is refused even when it starts like an allowed one", () => {
  for (const sneaky of ["/view/../api/db/dashboards", "/view/%2e%2e/api/db/dashboards", "/view/%2E%2E/x", "/api/guest/%2f..%2fdb", "/api/guest/a%5c..%5cdb", "/api/guest\\..\\db", "/view//x", "/_next/../api/db/info", "view/x", ""]) {
    assert.equal(guestOnlyAllows(sneaky), false, sneaky);
  }
});

test("the guest page and API are the paths that get the privacy headers", () => {
  assert.equal(isGuestPath("/view/x"), true);
  assert.equal(isGuestPath("/api/guest/x/plan"), true);
  assert.equal(isGuestPath("/api/db/guest-links"), false);
  assert.equal(isGuestPath("/"), false);
});

test("the request gate: guest pages and the guest API get the privacy headers, guest-only mode blocks the rest, the owner's Doshy is untouched", () => {
  assert.equal(gateFor("/view/AbCdEfGhIjKlMnOpQrStUv", false), "guest");
  assert.equal(gateFor("/api/guest/AbCdEfGhIjKlMnOpQrStUv/plan", false), "guest");
  assert.equal(gateFor("/", false), "pass");
  assert.equal(gateFor("/api/db/dashboards", false), "pass");
  assert.equal(gateFor("/view/AbCdEfGhIjKlMnOpQrStUv", true), "guest");
  assert.equal(gateFor("/icon.svg", true), "pass");
  assert.equal(gateFor("/", true), "block");
  assert.equal(gateFor("/api/db/dashboards", true), "block");
  assert.equal(gateFor("/api/db/guest-links", true), "block");
  assert.equal(gateFor("/view/%2e%2e/api/db/info", true), "block");
});
