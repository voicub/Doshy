import assert from "node:assert/strict";
import { test } from "node:test";
import { agoText, countsText, planLink } from "./planLabels.ts";

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);
const MIN = 60_000;

test("how long ago, in plain words", () => {
  assert.equal(agoText(NOW - 20_000, NOW), "just now");
  assert.equal(agoText(NOW + 5 * MIN, NOW), "just now"); // a clock a little ahead is not "in the future"
  assert.equal(agoText(NOW - MIN, NOW), "1 minute ago");
  assert.equal(agoText(NOW - 25 * MIN, NOW), "25 minutes ago");
  assert.equal(agoText(NOW - 120 * MIN, NOW), "2 hours ago");
  assert.equal(agoText(NOW - 60 * MIN, NOW), "1 hour ago");
  assert.equal(agoText(NOW - 36 * 60 * MIN, NOW), "2 days ago");
  assert.equal(agoText(NOW - 24 * 60 * MIN, NOW), "yesterday");
  assert.match(agoText(NOW - 90 * 24 * 60 * MIN, NOW), /2026/);
});

test("what is in a plan", () => {
  assert.equal(countsText(null), "");
  assert.equal(countsText({ items: 0, rooms: 0, walls: 0 }), "Empty");
  assert.equal(countsText({ items: 1, rooms: 1, walls: 4 }), "1 item, 1 room");
  assert.equal(countsText({ items: 12, rooms: 4, walls: 9 }), "12 items, 4 rooms");
  assert.equal(countsText({ items: 0, rooms: 3, walls: 9 }), "3 rooms");
  assert.equal(countsText({ items: 0, rooms: 0, walls: 1 }), "1 wall"); // a plan with only a wall drawn is not "0 items, 0 rooms"
});

test("the link to a plan keeps the page and other parameters, replaces plan and drops the hash", () => {
  assert.equal(planLink("http://doshy.local:3000/", 3), "http://doshy.local:3000/?plan=3");
  assert.equal(planLink("http://doshy.local:3000/?kiosk=1&plan=2#x", 5), "http://doshy.local:3000/?kiosk=1&plan=5");
});
