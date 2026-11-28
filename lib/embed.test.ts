import assert from "node:assert/strict";
import test from "node:test";
import { parseEmbed, roomIdByName } from "./embed.ts";

test("embed mode needs an explicit embed=1", () => {
  assert.equal(parseEmbed("").embed, false);
  assert.equal(parseEmbed("?kiosk=1").embed, false);
  assert.equal(parseEmbed("?embed=10").embed, false);
  assert.equal(parseEmbed("?embed=0").embed, false);
  assert.equal(parseEmbed("?plan=2&embed=1").embed, true);
});

test("taps are off unless interactive=1", () => {
  assert.equal(parseEmbed("?embed=1").interactive, false);
  assert.equal(parseEmbed("?embed=1&interactive=1").interactive, true);
  assert.equal(parseEmbed("?embed=1&interactive=true").interactive, false);
});

test("view: a room name is read decoded; anything else is the whole plan", () => {
  assert.equal(parseEmbed("?embed=1&view=room:Living%20Room").room, "Living Room");
  assert.equal(parseEmbed("?embed=1&view=room%3ALiving+Room").room, "Living Room");
  assert.equal(parseEmbed("?embed=1&view=ROOM:Kitchen").room, "Kitchen");
  assert.equal(parseEmbed("?embed=1&view=overview").room, null);
  assert.equal(parseEmbed("?embed=1&view=3d").room, null);
  assert.equal(parseEmbed("?embed=1&view=room:").room, null);
  assert.equal(parseEmbed(`?embed=1&view=room:${"x".repeat(500)}`).room?.length, 80);
});

test("rooms are found by name, ignoring case and outer spaces", () => {
  const rooms = [{ id: "a", name: "Kitchen" }, { id: "b", name: " Living Room " }, { id: "c", name: "kitchen" }];
  assert.equal(roomIdByName(rooms, "KITCHEN"), "a", "the first of two equal names");
  assert.equal(roomIdByName(rooms, "living room"), "b");
  assert.equal(roomIdByName(rooms, "Bath"), null);
  assert.equal(roomIdByName(rooms, "  "), null);
});
