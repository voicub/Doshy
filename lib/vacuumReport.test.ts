import test from "node:test";
import assert from "node:assert/strict";
import { cleaningLine, readVacuumReport } from "./vacuumReport.ts";

test("Dreame: segment id resolved through the map-name -> rooms list", () => {
  const r = readVacuumReport({
    current_segment: 3,
    rooms: { "Ground floor": [{ id: 1, name: "Living room" }, { id: 3, name: "Kitchen", icon: "mdi:x" }] },
    cleaned_area: 23.4,
    cleaning_time: 12,
    cleaning_progress: 45,
  });
  assert.deepEqual(r, { room: "Kitchen", cleanedAreaM2: 23.4, minutes: 12, progress: 45 });
});

test("rooms as id -> name, id -> {name} and a list of segment objects", () => {
  assert.equal(readVacuumReport({ segment: "16", segments: { 16: "Study", 17: "Hall" } }).room, "Study");
  assert.equal(readVacuumReport({ current_segment: 17, rooms: { 16: { name: "Study" }, 17: { name: "Hall" } } }).room, "Hall");
  assert.equal(readVacuumReport({ current_segment: 2, segments: [{ segment_id: 2, name: "Bedroom" }] }).room, "Bedroom");
});

test("a room given by name is taken as it is", () => {
  assert.equal(readVacuumReport({ current_room: "Küche" }).room, "Küche");
  assert.equal(readVacuumReport({ room_name: " Hall " }).room, "Hall");
  assert.equal(readVacuumReport({ room: "unknown", current_segment: "Office", rooms: {} }).room, "Office");
});

test("an id with no room list or no entry gives no room", () => {
  assert.equal(readVacuumReport({ current_segment: 3 }).room, undefined);
  assert.equal(readVacuumReport({ current_segment: 3, rooms: { 4: "Hall" } }).room, undefined);
  assert.equal(readVacuumReport({ current_room: 7 }).room, undefined);
});

test("junk values are dropped", () => {
  assert.deepEqual(readVacuumReport(undefined), {});
  assert.deepEqual(readVacuumReport("cleaning"), {});
  assert.deepEqual(readVacuumReport([1, 2]), {});
  assert.deepEqual(
    readVacuumReport({ current_room: "", room: "unavailable", current_segment: null, cleaned_area: -3, cleaning_progress: 140, cleaning_time: NaN, area: {}, rooms: "x", segments: 4 }),
    {},
  );
});

test("area: numbers and m2-ending text only, other units are not guessed", () => {
  assert.equal(readVacuumReport({ cleaned_area: 23.4 }).cleanedAreaM2, 23.4);
  assert.equal(readVacuumReport({ cleaned_area: "23.4" }).cleanedAreaM2, 23.4);
  assert.equal(readVacuumReport({ cleaned_area: "23.4 m²" }).cleanedAreaM2, 23.4);
  assert.equal(readVacuumReport({ cleaned_area: "23.4m2" }).cleanedAreaM2, 23.4);
  assert.equal(readVacuumReport({ cleaned_area: "10 SQM" }).cleanedAreaM2, 10);
  assert.equal(readVacuumReport({ cleaned_area: "23400 cm²" }).cleanedAreaM2, undefined);
  assert.equal(readVacuumReport({ cleaned_area: "23 ft2" }).cleanedAreaM2, undefined);
  assert.equal(readVacuumReport({ cleaned_area: "abc" }).cleanedAreaM2, undefined);
  assert.equal(readVacuumReport({ cleaned_area: Infinity }).cleanedAreaM2, undefined);
  assert.equal(readVacuumReport({ cleaned_area: null, cleaning_area: 8 }).cleanedAreaM2, 8);
});

test("progress is 0..100, time is minutes within a day", () => {
  assert.equal(readVacuumReport({ cleaning_progress: "60%" }).progress, 60);
  assert.equal(readVacuumReport({ progress: 0 }).progress, 0);
  assert.equal(readVacuumReport({ progress: 101 }).progress, undefined);
  assert.equal(readVacuumReport({ cleaning_time: "35 min" }).minutes, 35);
  assert.equal(readVacuumReport({ cleaning_time: 1800 }).minutes, undefined); // seconds, not minutes
  assert.equal(readVacuumReport({ cleaning_time: "20 s" }).minutes, undefined);
});

test("cleaning line shows the area only when it is worth showing", () => {
  assert.equal(cleaningLine("Kitchen", 23.4), "Cleaning Kitchen · 23 m²");
  assert.equal(cleaningLine("Kitchen", 0.2), "Cleaning Kitchen");
  assert.equal(cleaningLine("Kitchen"), "Cleaning Kitchen");
});
