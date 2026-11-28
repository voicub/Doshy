import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../db/errors.ts";
import { homeIdForName } from "../homeNames.ts";
import { explainFetchError, homeProblem, probeHome } from "./haProbe.ts";

const TOKEN = "probe-token-9999-secret";
const answer = (status: number, body: unknown): typeof fetch => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const fails = (name: string, code?: string): typeof fetch => async () => {
  const e = new Error("fetch failed", code ? { cause: Object.assign(new Error(code), { code }) } : undefined);
  e.name = name;
  throw e;
};

test("Test connection answers in plain words for every way it can go wrong, and never repeats the token", async () => {
  const url = "http://127.0.0.1:8123";
  const ok = await probeHome(url, TOKEN, answer(200, { version: "2026.1.0", location_name: "Cabin" }));
  assert.deepEqual(ok, { ok: true, version: "2026.1.0", locationName: "Cabin" });
  const cases: [typeof fetch, RegExp][] = [
    [answer(401, "no"), /refused the token/],
    [answer(200, "<html>router login</html>"), /does not look like Home Assistant/],
    [answer(200, { hello: "world" }), /does not look like Home Assistant/],
    [answer(404, "nope"), /does not look like Home Assistant/],
    [answer(302, ""), /somewhere else/],
    [fails("TimeoutError"), /did not answer in time/],
    [fails("TypeError", "ENOTFOUND"), /could not be found/],
    [fails("TypeError", "ECONNREFUSED"), /Nothing answered/],
    [fails("TypeError", "DEPTH_ZERO_SELF_SIGNED_CERT"), /certificate/],
  ];
  for (const [f, re] of cases) {
    const r = await probeHome(url, TOKEN, f);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, re);
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  }
});

test("a link-local address is refused before anything is sent", async () => {
  let called = false;
  await assert.rejects(() => probeHome("http://169.254.169.254", TOKEN, async () => ((called = true), new Response("{}"))), HttpError);
  assert.equal(called, false);
});

test("the sentence a failed poll leaves in the Homes list", () => {
  assert.equal(homeProblem(new Error("Home Assistant HTTP 401")), "Home Assistant refused the token.");
  assert.match(homeProblem(new Error("Home Assistant HTTP 502")), /HTTP 502/);
  assert.match(explainFetchError(new Error("boom")), /Could not reach/);
});

test("a plan file's home name finds a home here only by the same name", () => {
  const homes = [{ id: "abc123def4", name: "Holiday house" }];
  assert.equal(homeIdForName(homes, " holiday HOUSE "), "abc123def4");
  assert.equal(homeIdForName(homes, "Parents"), null);
  assert.equal(homeIdForName(homes, undefined), null);
  assert.equal(homeIdForName([], "Holiday house"), null);
});
