import assert from "node:assert/strict";
import { test } from "node:test";
import { externalCacheDir, externalDataEnabled } from "./externalData.ts";

test("third-party downloads are on unless the owner switches them off", () => {
  assert.equal(externalDataEnabled({}), true);
  assert.equal(externalDataEnabled({ DOSHY_EXTERNAL_DATA: "1" }), true);
  for (const off of ["0", "off", "FALSE", " no "]) assert.equal(externalDataEnabled({ DOSHY_EXTERNAL_DATA: off }), false, off);
});

test("downloads are cached in a folder of their own under the site cache", () => {
  assert.match(externalCacheDir("polyhaven", { HOUSEY_SITE_CACHE: "/srv/cache" }), /^\/srv\/cache\/polyhaven$|\\srv\\cache\\polyhaven$/);
  assert.match(externalCacheDir("polyhaven", {}), /data[\\/]site-cache[\\/]polyhaven$/);
});
