// package.json is the only place a version is typed. This copies it into the add-on (doshy/config.yaml) and the
// Home Assistant integration (custom_components/doshy/manifest.json).
//   npm version 0.2.0        bumps package.json, runs this (the "version" script), commits and tags v0.2.0
//   node scripts/sync-version.mjs          write the version into the targets
//   node scripts/sync-version.mjs --check  exit 1 when a target is behind (CI and `npm test` use this)
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);

/** Files that carry a copy of the version; `pattern` captures what surrounds the number. */
export const TARGETS = [
  { file: "doshy/config.yaml", pattern: /^(version: ")[^"]*(")$/m },
  { file: "custom_components/doshy/manifest.json", pattern: /^(  "version": ")[^"]*(",?)$/m },
];

export const packageVersion = () => JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version;

/** The files whose version differs from package.json; with `write`, they are fixed. */
export function syncVersions({ write }) {
  const version = packageVersion();
  const stale = [];
  for (const { file, pattern } of TARGETS) {
    const url = new URL(file, root);
    const text = readFileSync(url, "utf8");
    if (!pattern.test(text)) throw new Error(`${file}: no version line found`);
    const next = text.replace(pattern, (_, before, after) => `${before}${version}${after}`);
    if (next === text) continue;
    stale.push(file);
    if (write) writeFileSync(url, next);
  }
  return stale;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const stale = syncVersions({ write: !check });
  if (check && stale.length) {
    console.error(`Out of sync with package.json ${packageVersion()}: ${stale.join(", ")}. Run: node scripts/sync-version.mjs`);
    process.exit(1);
  }
  console.log(stale.length && !check ? `Updated ${stale.join(", ")} to ${packageVersion()}` : `Versions match ${packageVersion()}`);
}
