import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../db/errors.ts";
import { MAX_URL, assertHostAllowed, isBlockedAddress, parseHaUrl } from "./haUrl.ts";

const refused = (input: unknown) => assert.throws(() => parseHaUrl(input), (e: unknown) => e instanceof HttpError && e.status === 400 && e.message.length > 10);

test("ordinary Home Assistant addresses pass, tidied: no trailing slash, a path prefix kept", () => {
  assert.equal(parseHaUrl("http://homeassistant.local:8123"), "http://homeassistant.local:8123");
  assert.equal(parseHaUrl("  https://ha.example.org/  "), "https://ha.example.org");
  assert.equal(parseHaUrl("http://192.168.1.20:8123/"), "http://192.168.1.20:8123");
  assert.equal(parseHaUrl("http://localhost:8123"), "http://localhost:8123");
  assert.equal(parseHaUrl("http://[::1]:8123"), "http://[::1]:8123");
  assert.equal(parseHaUrl("https://example.org/ha/"), "https://example.org/ha");
  assert.equal(parseHaUrl("http://supervisor/core"), "http://supervisor/core");
});

test("anything that is not a plain http(s) address is refused in plain words", () => {
  refused("file:///etc/passwd");
  refused("ftp://ha.local");
  refused("javascript:alert(1)");
  refused("gopher://x");
  refused("data:text/plain,hi");
  refused("homeassistant.local:8123"); // no scheme: parses as scheme 'homeassistant.local'
  refused("http://");
  refused("not a url");
  refused("");
  refused("   ");
  refused(undefined);
  refused(null);
  refused(42);
  refused({ href: "http://x" });
  refused("http://user:secret@ha.local");
  refused("http://user@ha.local");
  refused("http://:pw@ha.local");
  refused("http://ha.local/#fragment");
  refused("http://ha.local/?token=abc");
  refused(`http://ha.local/${"a".repeat(MAX_URL)}`);
});

test("link-local ranges are refused however they are written", () => {
  refused("http://169.254.169.254/latest/meta-data");
  refused("http://169.254.0.1");
  refused("http://169.254.169.254:80");
  refused("http://2852039166/"); // 169.254.169.254 as one decimal number
  refused("http://0xa9fea9fe/");
  refused("http://0251.0376.0251.0376/"); // octal
  refused("http://[fe80::1]/");
  refused("http://[fd00:ec2::254]/");
  refused("http://[::ffff:169.254.169.254]/");
  refused("http://[::ffff:a9fe:a9fe]/");
});

test("LAN, loopback and other private addresses are fine: Home Assistant is usually there", () => {
  for (const ok of ["http://10.0.0.5:8123", "http://172.16.3.4", "http://192.168.0.1", "http://127.0.0.1:8123", "http://[fd12:3456::1]/", "http://100.64.0.5:8123", "http://168.254.1.1", "http://169.253.1.1", "http://[::ffff:192.168.1.1]/"]) assert.doesNotThrow(() => parseHaUrl(ok), ok);
});

test("isBlockedAddress: exactly the link-local ranges", () => {
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("169.254.255.255"), true);
  assert.equal(isBlockedAddress("169.255.0.1"), false);
  assert.equal(isBlockedAddress("192.168.1.1"), false);
  assert.equal(isBlockedAddress("fe80::1"), true);
  assert.equal(isBlockedAddress("febf::1"), true);
  assert.equal(isBlockedAddress("fec0::1"), false);
  assert.equal(isBlockedAddress("fd00:ec2::254"), true);
  assert.equal(isBlockedAddress("fd00:ec3::1"), false);
  assert.equal(isBlockedAddress("::1"), false);
  assert.equal(isBlockedAddress("::ffff:169.254.1.1"), true);
  assert.equal(isBlockedAddress("::ffff:10.0.0.1"), false);
  assert.equal(isBlockedAddress("fe80::1%en0"), true);
});

test("assertHostAllowed: literal addresses are checked, a name that resolves is checked, a name that does not resolve is left to fail on its own", async () => {
  await assertHostAllowed("http://127.0.0.1:8123");
  await assertHostAllowed("http://localhost:8123");
  await assert.rejects(() => assertHostAllowed("http://169.254.169.254"), HttpError);
  await assert.rejects(() => assertHostAllowed("http://[fe80::1]:8123"), HttpError);
  await assertHostAllowed("http://this-host-does-not-exist.invalid");
});
