import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, type CommandContext, type Reply } from "./commandParse.ts";
import { contacts, sceneDevices } from "./sceneDevices.ts";
import { PLAN, STATES } from "./sceneFixture.ts";
import { checkBatch } from "./sceneRun.ts";
import type { HAState } from "./ha.ts";

const ctx = (over: Partial<CommandContext> = {}, states: Record<string, HAState> = STATES): CommandContext => ({
  rooms: PLAN.rooms.map((r) => ({ id: r.id, name: r.name, tempEntity: r.tempEntity })),
  devices: sceneDevices(PLAN, states),
  contacts: contacts(PLAN, states),
  scenes: [
    { id: "s1", name: "Movie night", steps: [{ entity: "light.living_main", on: true, brightness: 15 }, { entity: "cover.living_blind", position: 0 }] },
    { id: "s2", name: "Good morning", steps: [{ entity: "light.kitchen_ceiling", on: true, brightness: 80 }] },
  ],
  states,
  ...over,
});

const run = (text: string, over: Partial<CommandContext> = {}): Extract<Reply, { kind: "run" }> => {
  const r = parseCommand(text, ctx(over));
  assert.equal(r.kind, "run", `${text} -> ${JSON.stringify(r)}`);
  return r as Extract<Reply, { kind: "run" }>;
};
const services = (r: Extract<Reply, { kind: "run" }>) => r.actions.map((a) => `${a.domain}.${a.service} ${a.entity_id}`);

test("turn off the lights in a room, with synonyms and sloppy spelling", () => {
  for (const text of ["turn off the lights in the bedroom", "Turn the bedroom lights off", "switch off the lights in bedroom", "bedroom lights off", "kill the lights in the bedrom", "please turn off all the bedroom lamps", "shut off the bedroom lights"]) {
    const r = run(text);
    assert.deepEqual(services(r).sort(), ["light.turn_off light.bedroom_ceiling", "light.turn_off light.bedroom_lamp"], text);
    assert.equal(r.summary, "Turn off 2 lights in Bedroom", text);
  }
});

test("turn on, with room synonyms", () => {
  assert.equal(run("turn on the lounge lights").summary, "Turn on 2 lights in Living room");
  assert.equal(run("switch on the lights in the livingroom").summary, "Turn on 2 lights in Living room");
  assert.equal(run("turn on the tv").summary, "Turn on Living room TV", "a single device is told by its name");
});

test("a command may name several rooms, or the whole home", () => {
  const two = run("turn off the lights in the kitchen and the bathroom");
  assert.deepEqual(services(two).sort(), ["light.turn_off light.bath_mirror", "light.turn_off light.desk_lamp", "light.turn_off light.kitchen_ceiling"]);
  assert.equal(two.summary, "Turn off 3 lights in Kitchen and Bathroom");
  const all = run("turn off all the lights");
  assert.equal(all.actions.length, 9);
  assert.match(all.summary, /whole home/);
  assert.equal(run("turn off the lights everywhere").actions.length, 9);
});

test("close and open curtains, all or by room, never the garage door", () => {
  const all = run("close all curtains");
  assert.deepEqual(services(all).sort(), ["cover.close_cover cover.bedroom_curtain", "cover.close_cover cover.living_blind"]);
  assert.equal(all.summary, "Close 2 curtains in the whole home");
  assert.deepEqual(services(run("open the blinds in the living room")), ["cover.open_cover cover.living_blind"]);
  assert.deepEqual(services(run("raise the bedroom curtains")), ["cover.open_cover cover.bedroom_curtain"]);
  assert.deepEqual(services(run("shut the living room blinds")), ["cover.close_cover cover.living_blind"]);
  const half = run("open the living room blinds to 50%");
  assert.deepEqual(half.actions[0], { domain: "cover", service: "set_cover_position", entity_id: "cover.living_blind", data: { position: 50 } });
  assert.equal(half.summary, "Set Living blind to 50% open");
});

test("dim and brighten with a percent, a plain number or nothing", () => {
  const r = run("dim the kitchen lights to 30%");
  assert.deepEqual(r.actions.map((a) => [a.entity_id, a.data]).sort(), [["light.desk_lamp", { brightness_pct: 30 }], ["light.kitchen_ceiling", { brightness_pct: 30 }]]);
  assert.equal(r.summary, "Dim 2 lights in Kitchen to 30%");
  assert.equal(run("set the kitchen lights to 60").actions[0].data?.brightness_pct, 60);
  assert.equal(run("make the kitchen lights 45 percent").actions[0].data?.brightness_pct, 45);
  assert.equal(run("dim the kitchen lights").actions[0].data?.brightness_pct, 30);
  assert.equal(run("brighten the kitchen lights").actions[0].data?.brightness_pct, 100);
  assert.equal(run("set the kitchen lights to half").actions[0].data?.brightness_pct, 50);
});

test("lights that cannot dim are left out and said so, or refused when none can", () => {
  const r = run("dim the bedroom lights to 20%");
  assert.deepEqual(services(r), ["light.turn_on light.bedroom_ceiling"]);
  assert.match(r.summary, /1 cannot dim/);
  const onoff = { ...STATES, "light.bedroom_ceiling": { ...STATES["light.bedroom_ceiling"], attributes: { supported_color_modes: ["onoff"] } } };
  assert.equal(parseCommand("dim the bedroom lights to 20", ctx({}, onoff)).kind, "no");
});

test("set a room's temperature", () => {
  for (const text of ["set living room to 22", "set the living room temperature to 22", "set living room to 22 degrees", "heating in the living room to 22°", "set the lounge thermostat to 22"]) {
    const r = run(text);
    assert.deepEqual(r.actions, [{ domain: "climate", service: "set_temperature", entity_id: "climate.living", data: { temperature: 22 } }], text);
  }
  assert.equal(run("set living room to 22.5").actions[0].data?.temperature, 22.5);
  assert.equal(run("make it warmer in the living room").actions[0].data?.temperature, 22, "one degree up from the 21 it is set to");
  assert.equal(run("make the living room 2 degrees cooler").actions[0].data?.temperature, 19);
  assert.equal(parseCommand("set living room to 45", ctx()).kind, "no", "outside what the thermostat takes");
  assert.equal(parseCommand("set living room to 5", ctx()).kind, "no", "below the thermostat's 7 degrees");
});

test("run a scene by name, with or without the verb", () => {
  for (const text of ["run movie night", "start the movie night scene", "activate Movie Night", "movie night", "play movie night", "please run the Movie Night scene"]) {
    const r = run(text);
    assert.equal(r.scene, "Movie night", text);
    assert.deepEqual(services(r), ["light.turn_on light.living_main", "cover.close_cover cover.living_blind"]);
  }
  assert.equal(run("run good morning").summary, 'Run the scene "Good morning" (1 device)');
  const lights = parseCommand("turn off the movie night lights", ctx());
  assert.equal(lights.kind === "run" ? lights.scene : undefined, undefined, "a scene's name inside another request is not the scene");
  const gone = parseCommand("run movie night", ctx({ scenes: [{ id: "s", name: "Movie night", steps: [{ entity: "light.gone", on: true }] }] }));
  assert.equal(gone.kind, "no");
});

test("a device can be named", () => {
  const r = run("turn off the desk lamp");
  assert.deepEqual(services(r), ["light.turn_off light.desk_lamp"]);
  assert.equal(r.summary, "Turn off Desk lamp");
  assert.equal(parseCommand("turn off the sofa lamp", ctx()).kind, "no");
});

test("when the room is not said it asks which, or uses the room being looked at", () => {
  const r = parseCommand("turn off the lights", ctx());
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.match(r.question, /Which room/);
  assert.deepEqual(r.options.map((o) => o.label), ["Bedroom", "Living room", "Kitchen", "Bathroom", "Master bedroom", "Kids bedroom", "Everywhere"]);
  const picked = parseCommand("turn off the lights", ctx(), r.options[2].pick);
  assert.equal(picked.kind === "run" && picked.summary, "Turn off 2 lights in Kitchen");
  assert.equal(run("turn off the lights", { here: "bath" }).summary, "Turn off Bath mirror");
  assert.equal(run("turn off the lights in the kitchen", { here: "bath" }).summary, "Turn off 2 lights in Kitchen", "a named room beats the one being looked at");
});

test("a name that fits two rooms asks, a full name does not", () => {
  const ask = parseCommand("turn off the bedroom lights", ctx({ rooms: ctx().rooms.filter((r) => r.id !== "bed") }));
  assert.equal(ask.kind, "ask");
  if (ask.kind === "ask") assert.deepEqual(ask.options.map((o) => o.label), ["Master bedroom", "Kids bedroom", "All of them"]);
  assert.equal(run("turn off the master bedroom lights").summary, "Turn off Master lamp");
  assert.equal(run("turn off the kids bedroom lights").summary, "Turn off Kids lamp");
  assert.equal(run("turn off the bedroom lights").summary, "Turn off 2 lights in Bedroom", "a room literally called Bedroom is not confused with the others");
  const both = parseCommand("turn off the bedroom lights", ctx({ rooms: ctx().rooms.filter((r) => r.id !== "bed") }));
  const all = both.kind === "ask" ? parseCommand("turn off the bedroom lights", ctx(), both.options[2].pick) : both;
  assert.equal(all.kind === "run" && all.actions.length, 2);
});

test("questions are answered from the states, nothing is sent", () => {
  const answer = (text: string) => {
    const r = parseCommand(text, ctx());
    assert.equal(r.kind, "answer", `${text} -> ${JSON.stringify(r)}`);
    return r.kind === "answer" ? r.text : "";
  };
  assert.equal(answer("is the bathroom window open?"), "Bathroom window is closed.");
  assert.equal(answer("is the kitchen window open"), "Kitchen window is open.");
  assert.match(answer("are any windows open?"), /Kitchen window/);
  assert.match(answer("which windows are open"), /Open now: Kitchen window/);
  assert.match(answer("are the lights on in the kitchen?"), /^1 of 2 lights is on in Kitchen: /);
  assert.match(answer("which lights are on"), /^\d of 9 lights are on: /);
  assert.equal(answer("is the tv on?"), "Living room TV is off.");
  assert.equal(answer("are the curtains open in the bedroom"), "Bedroom curtain is open.");
  assert.equal(answer("what is the temperature in the bedroom?"), "Bedroom is 19.5°.");
  assert.equal(answer("how warm is the living room"), "Living room is 20.4°.");
  assert.match(answer("is the bedroom window open?"), /do not know of a window sensor in Bedroom/);
  assert.equal(answer("is the desk lamp on?"), "Desk lamp is off.");
  const garden = parseCommand("is the garden window open?", ctx());
  assert.equal(garden.kind, "no", "a place that is not in the plan is not answered with the whole home");
  assert.match(garden.kind === "no" ? garden.message : "", /garden/);
});

test("anything outside the allowlist is refused in plain words", () => {
  for (const text of ["unlock the front door", "lock the door", "open the garage door", "open the garage", "disarm the alarm", "restart home assistant", "reboot the router", "delete all automations", "turn off the router", "open the front door", "update everything"]) {
    const r = parseCommand(text, ctx());
    assert.equal(r.kind, "no", `${text} -> ${JSON.stringify(r)}`);
    assert.match(r.kind === "no" ? r.message : "", /will not do that|What should I|could not find|try/i, text);
  }
});

test("nothing it produces can fall outside the server's rules", () => {
  const phrases = ["turn off all the lights", "turn everything off", "close all curtains", "open the blinds", "dim the kitchen lights to 10", "set living room to 21", "run movie night", "turn on the tv", "set the lounge to 30", "turn off the desk lamp"];
  for (const text of phrases) {
    const r = parseCommand(text, ctx());
    if (r.kind !== "run") continue;
    assert.equal(checkBatch({ actions: r.actions.slice(0, 40) }, STATES).ok, true, text);
  }
  const everything = run("turn everything off");
  assert.equal(everything.actions.some((a) => a.entity_id === "switch.server"), false, "plugs are not part of everything");
  assert.equal(everything.actions.some((a) => a.entity_id === "cover.garage_door"), false);
});

test("empty, unclear and curtain-on commands get a hint", () => {
  assert.equal(parseCommand("", ctx()).kind, "no");
  assert.equal(parseCommand("banana", ctx()).kind, "no");
  assert.equal(parseCommand("turn off", ctx()).kind, "no");
  const r = parseCommand("turn on the curtains", ctx());
  assert.equal(r.kind, "no");
  assert.match(r.kind === "no" ? r.message : "", /open the curtains/);
});
