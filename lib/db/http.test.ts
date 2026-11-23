import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "./errors.ts";
import { checkSameOrigin, contentType, rateLimit, readBody, readJson } from "./http.ts";

const req = (init: RequestInit & { headers?: Record<string, string> } = {}) => new Request("http://housey.local:3000/api/db/x", { method: "GET", ...init });
const refused = (status: number) => (e: unknown) => e instanceof HttpError && e.status === status;

test("requests from the dashboard's own origin pass; other sites are refused", () => {
  assert.doesNotThrow(() => checkSameOrigin(req({ headers: { "sec-fetch-site": "same-origin", host: "housey.local:3000" } })));
  assert.doesNotThrow(() => checkSameOrigin(req({ method: "PUT", headers: { origin: "http://housey.local:3000", host: "housey.local:3000" } })));
  assert.doesNotThrow(() => checkSameOrigin(req({ method: "PUT" })), "curl and scripts send neither header");
  assert.doesNotThrow(() => checkSameOrigin(req({ headers: { origin: "https://dash.example.com", host: "127.0.0.1:3000", "x-forwarded-host": "dash.example.com" } })), "behind a reverse proxy");
  for (const site of ["cross-site", "same-site"]) assert.throws(() => checkSameOrigin(req({ headers: { "sec-fetch-site": site } })), refused(403), site);
  assert.throws(() => checkSameOrigin(req({ method: "POST", headers: { origin: "https://evil.example", host: "housey.local:3000" } })), refused(403));
  assert.throws(() => checkSameOrigin(req({ method: "POST", headers: { origin: "null", host: "housey.local:3000" } })), refused(403));
  assert.throws(() => checkSameOrigin(req({ method: "POST", headers: { origin: "http://housey.local:3001", host: "housey.local:3000" } })), refused(403), "another port is another origin");
});

test("a typed-in address (Sec-Fetch-Site: none) may read but never write", () => {
  assert.doesNotThrow(() => checkSameOrigin(req({ headers: { "sec-fetch-site": "none" } })));
  assert.throws(() => checkSameOrigin(req({ method: "DELETE", headers: { "sec-fetch-site": "none" } })), refused(403));
});

test("writes are rate limited lightly, per class, in a fixed window", () => {
  const t0 = 10_000_000;
  for (let i = 0; i < 300; i++) rateLimit("write", t0);
  assert.throws(() => rateLimit("write", t0 + 1000), refused(429));
  assert.doesNotThrow(() => rateLimit("write", t0 + 60_000), "the next window starts fresh");
  for (let i = 0; i < 3; i++) rateLimit("heavy", t0);
  assert.throws(() => rateLimit("heavy", t0), refused(429));
});

test("an unexpected content type is refused (415), parameters are ignored", () => {
  assert.equal(contentType(req({ headers: { "content-type": "Application/JSON; charset=utf-8" } }), ["application/json"]), "application/json");
  assert.throws(() => contentType(req({ method: "POST", headers: { "content-type": "text/plain" } }), ["application/json"]), refused(415));
  assert.throws(() => contentType(req({ method: "POST" }), ["application/json"]), refused(415));
});

test("a body is refused as soon as it passes the limit, whatever Content-Length says", async () => {
  const post = (body: string, headers: Record<string, string> = {}) => req({ method: "POST", body, headers: { "content-type": "application/json", ...headers } });
  assert.equal((await readBody(post("hello"), 5)).toString(), "hello");
  await assert.rejects(readBody(post("hello!"), 5), refused(413));
  await assert.rejects(readBody(post("x", { "content-length": "999999" }), 10), refused(413), "an honest oversize header is refused up front");
});

test("JSON bodies must be JSON", async () => {
  const post = (body: string, type = "application/json") => req({ method: "PUT", body, headers: { "content-type": type } });
  assert.deepEqual(await readJson(post('{"a":1}'), 100), { a: 1 });
  await assert.rejects(readJson(post("{nope"), 100), refused(400));
  await assert.rejects(readJson(post("{}", "text/plain"), 100), refused(415));
  await assert.rejects(readJson(post('{"a":"' + "x".repeat(200) + '"}'), 100), refused(413));
});
