import assert from "node:assert/strict";
import { test } from "node:test";
import { packageVersion, syncVersions, TARGETS } from "./sync-version.mjs";

test("the add-on and the integration carry the package.json version", () => {
  assert.deepEqual(syncVersions({ write: false }), [], `run: node scripts/sync-version.mjs (package.json is ${packageVersion()})`);
});

test("each target pattern replaces only the version number", () => {
  const samples = {
    "doshy/config.yaml": 'name: Doshy\nversion: "0.1.0"\nslug: doshy\n',
    "custom_components/doshy/manifest.json": '{\n  "domain": "doshy",\n  "version": "0.1.0"\n}\n',
  };
  for (const { file, pattern } of TARGETS) {
    const replaced = samples[file].replace(pattern, (_, before, after) => `${before}9.9.9${after}`);
    assert.equal(replaced, samples[file].replace("0.1.0", "9.9.9"), file);
  }
});
