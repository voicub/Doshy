import test from "node:test";
import assert from "node:assert/strict";
import { parseIssFeed } from "./issFeed.ts";
const now = Date.UTC(2026,10,27,22);
const fix = { lat:44,lon:26,altitudeKm:420,velocityKmh:27600,timestamp:now/1000,footprintKm:4500 };
test("accepts a fresh validated pair and preserves disabled without fake data", () => {
  const reading = parseIssFeed({fix,prevFix:{...fix,timestamp:fix.timestamp-30}},now);
  assert.equal(reading.status,"ready"); assert.equal(reading.prevFix?.timestamp,fix.timestamp-30);
  assert.equal(parseIssFeed({disabled:true},now).status,"disabled");
});
test("rejects stale, malformed or reversed ISS fixes", () => {
  for(const v of [null,{}, {fix:{...fix,lat:100},prevFix:null},{fix:{...fix,timestamp:fix.timestamp-200},prevFix:null},{fix,prevFix:fix},{fix,prevFix:{...fix,timestamp:fix.timestamp-200}}]) assert.equal(parseIssFeed(v,now).status,"unavailable");
});
