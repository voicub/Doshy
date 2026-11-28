import assert from "node:assert/strict";
import { test } from "node:test";
import { GUEST_TOKEN, guestStorage, guestTokenOf, onGuestPage, putGuestDoc } from "./guestMode.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

test("only a path of exactly one 22-character token is a guest address", () => {
  assert.equal(guestTokenOf(`/view/${TOKEN}`), TOKEN);
  assert.equal(guestTokenOf(`/view/${TOKEN}/`), TOKEN);
  for (const bad of ["/view/", "/view", "/view/short", `/view/${TOKEN}x`, `/view/${TOKEN}/more`, `/api/guest/${TOKEN}`, `/x/view/${TOKEN}`, "/view/AbCdEfGhIjKlMnOpQrSt!v"]) assert.equal(guestTokenOf(bad), null, bad);
  assert.equal(GUEST_TOKEN.test(TOKEN), true);
});

test("any /view address counts as the guest page, even a mistyped one; the owner's page does not", () => {
  const was = (globalThis as { location?: unknown }).location;
  try {
    for (const [path, want] of [["/view/nothing", true], ["/view", true], ["/", false], ["/viewer", false], ["/api/db/info", false]] as const) {
      (globalThis as { location?: unknown }).location = { pathname: path };
      assert.equal(onGuestPage(), want, path);
    }
  } finally {
    (globalThis as { location?: unknown }).location = was;
  }
  assert.equal(onGuestPage(), false); // no browser at all (the server, the tests)
});

test("the guest's storage is memory: a store is handed its data and told to read it", () => {
  const storage = guestStorage("housey-test-doc");
  let reads = 0;
  storage.bind(() => reads++);
  assert.equal(storage.getItem("housey-test-doc"), null);
  putGuestDoc("housey-test-doc", { plan: { walls: [] } }, 7);
  assert.equal(reads, 1);
  assert.deepEqual(JSON.parse(String(storage.getItem("housey-test-doc"))), { state: { plan: { walls: [] } }, version: 7 });
  storage.setItem("housey-test-doc", "x");
  assert.equal(storage.getItem("housey-test-doc"), "x");
  storage.removeItem("housey-test-doc");
  assert.equal(storage.getItem("housey-test-doc"), null);
  putGuestDoc("housey-nobody-listens", {}, 1); // a store that is not on this page: nothing happens
  assert.equal(reads, 1);
});
