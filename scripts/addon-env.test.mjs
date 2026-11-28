import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addonEnv, shellExports, SUPERVISOR_CORE_URL } from "./addon-env.mjs";

test("maps filled options to environment variables and skips empty ones", () => {
  const vars = addonEnv({ sketchfab_token: " abc ", nextzen_api_key: " key_1 ", site_tile_url: "", site_tile_max_zoom: 19, automation: true }, {});
  assert.deepEqual(vars, { SKETCHFAB_TOKEN: "abc", NEXTZEN_API_KEY: "key_1", SITE_TILE_MAX_ZOOM: "19" });
});

test("automation false switches the curtain automation off", () => {
  assert.equal(addonEnv({ automation: false }, {}).HOUSEY_AUTOMATION, "off");
  assert.equal("HOUSEY_AUTOMATION" in addonEnv({ automation: true }, {}), false);
});

test("uses the Supervisor proxy when no Home Assistant address or token is given", () => {
  assert.deepEqual(addonEnv({}, { SUPERVISOR_TOKEN: "sup" }), { HA_URL: SUPERVISOR_CORE_URL, HA_TOKEN: "sup" });
});

test("keeps an explicit Home Assistant (option or container variable) over the Supervisor", () => {
  assert.deepEqual(addonEnv({ ha_url: "https://ha.example.com", ha_token: "t" }, { SUPERVISOR_TOKEN: "sup" }), { HA_URL: "https://ha.example.com", HA_TOKEN: "t" });
  assert.deepEqual(addonEnv({}, { SUPERVISOR_TOKEN: "sup", HA_URL: "https://x", HA_TOKEN: "y" }), {});
});

test("sets nothing outside the add-on", () => {
  assert.deepEqual(addonEnv({}, {}), {});
});

test("shell exports survive single quotes and spaces", () => {
  assert.equal(shellExports({ A: "it's a b" }), `export A='it'\\''s a b'`);
});

test("the script prints exports that a shell evaluates back to the same values", () => {
  const dir = mkdtempSync(join(tmpdir(), "doshy-"));
  const file = join(dir, "options.json");
  writeFileSync(file, JSON.stringify({ sketchfab_token: "it's $HOME `x`", automation: false }));
  const env = { PATH: process.env.PATH, DOSHY_OPTIONS: file };
  const exports = execFileSync("node", [join(import.meta.dirname, "addon-env.mjs")], { env, encoding: "utf8" });
  const printed = execFileSync("sh", ["-c", `${exports}\nprintf '%s|%s' "$SKETCHFAB_TOKEN" "$HOUSEY_AUTOMATION"`], { encoding: "utf8" });
  assert.equal(printed, "it's $HOME `x`|off");
  const names = execFileSync("node", [join(import.meta.dirname, "addon-env.mjs"), "--names"], { env, encoding: "utf8" });
  assert.equal(names.trim(), "would set: SKETCHFAB_TOKEN HOUSEY_AUTOMATION");
});
