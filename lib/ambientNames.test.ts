import test from "node:test";
import assert from "node:assert/strict";
import { matchRoomName, normName } from "./ambientNames.ts";

const rooms = [{ name: "Living room" }, { name: "Kitchen" }, { name: "Master Bedroom" }, { name: "Kids bedroom" }, { name: "Bathroom" }];
const find = (n: string) => matchRoomName(n, rooms)?.name;

test("names are compared without case, accents and punctuation", () => {
  assert.equal(normName("  Café-Bar #2 "), "cafe bar 2");
  assert.equal(find("KITCHEN"), "Kitchen");
  assert.equal(find("living-room"), "Living room");
  assert.equal(matchRoomName("Küche", [{ name: "Kuche" }])?.name, "Kuche");
});

test("words contained on either side match", () => {
  assert.equal(find("Living"), "Living room");
  assert.equal(find("the kitchen area"), "Kitchen");
  assert.equal(find("Master"), "Master Bedroom");
});

test("an ambiguous or unknown name matches nothing", () => {
  assert.equal(find("Bedroom"), undefined); // master and kids bedroom fit equally
  assert.equal(find("Garage"), undefined);
  assert.equal(find(""), undefined);
  assert.equal(find("---"), undefined);
});

test("the closest containing name wins; an exact name beats a longer one", () => {
  const list = [{ name: "Kitchen nook" }, { name: "Kitchen" }, { name: "Hall" }, { name: "Upstairs hall way" }];
  assert.equal(matchRoomName("kitchen", list)?.name, "Kitchen");
  assert.equal(matchRoomName("hall", list)?.name, "Hall");
  assert.equal(matchRoomName("upstairs hall", list)?.name, "Upstairs hall way");
  assert.equal(matchRoomName("kitchen", [{ name: "Kitchen" }, { name: "kitchen" }]), undefined); // two exact: ambiguous
});
