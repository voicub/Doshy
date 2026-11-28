import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedGuestRequest } from "./guestFetch.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const ORIGIN = "https://doshy.example";
const ok = (url: string) => isAllowedGuestRequest(url, ORIGIN, TOKEN);

test("the guest page may ask for its own link's data and Next's files, nothing else", () => {
  for (const url of [`/api/guest/${TOKEN}/plan`, `/api/guest/${TOKEN}/resource/m_1`, `${ORIGIN}/api/guest/${TOKEN}/states`, "/_next/static/chunks/a.js", "data:image/png;base64,AAAA", "blob:https://doshy.example/1234"]) assert.equal(ok(url), true, url);
  for (const url of ["/api/db/dashboards", "/api/db/guest-links", "/api/ha/states", "/api/ha/toggle", "/api/site/data", "/api/guest/OtherOtherOtherOtherOt/plan", `/api/guest/${TOKEN}`, "https://elsewhere.example/api/guest/" + TOKEN + "/plan", `//elsewhere.example/api/guest/${TOKEN}/plan`]) assert.equal(ok(url), false, url);
});

test("dot segments and encoded slashes cannot walk out of the allowed paths", () => {
  for (const url of [`/api/guest/${TOKEN}/../../db/info`, `/api/guest/${TOKEN}/%2e%2e/%2e%2e/db/info`, `/api/guest/${TOKEN}/resource/..%2f..%2fdb`, "/_next/../api/db/info"]) assert.equal(ok(url), false, url);
});

test("a bad token never allows anything", () => {
  assert.equal(isAllowedGuestRequest("/api/guest/x/plan", ORIGIN, "x"), false);
  assert.equal(isAllowedGuestRequest("/_next/static/a.js", ORIGIN, "not a token"), false);
});
