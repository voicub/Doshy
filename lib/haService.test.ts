import test from "node:test";
import assert from "node:assert/strict";
import { validateService } from "./haService.ts";
import { callHaService } from "./server/haCall.ts";

const call = (domain: string, service: string, entity_id: string, data?: Record<string, unknown>, attrs = {}) => validateService({ domain, service, entity_id, data }, attrs);

test("allows a bounded climate target and adds entity_id to the payload", () => {
  const v = call("climate", "set_temperature", "climate.flat_thermostat", { temperature: 21.5 }, { min_temp: 15, max_temp: 25 });
  assert.deepEqual(v, { ok: true, domain: "climate", service: "set_temperature", data: { temperature: 21.5, entity_id: "climate.flat_thermostat" } });
});

test("rejects out of range targets using the entity's own limits", () => {
  assert.equal(call("climate", "set_temperature", "climate.a", { temperature: 26 }, { min_temp: 15, max_temp: 25 }).ok, false);
  assert.equal(call("climate", "set_temperature", "climate.a", { temperature: 14.9 }, { min_temp: 15, max_temp: 25 }).ok, false);
  assert.equal(call("climate", "set_temperature", "climate.a", {}).ok, false);
});

test("modes must be offered by the entity", () => {
  assert.equal(call("climate", "set_hvac_mode", "climate.a", { hvac_mode: "cool" }, { hvac_modes: ["heat", "off"] }).ok, false);
  assert.equal(call("climate", "set_hvac_mode", "climate.a", { hvac_mode: "off" }, { hvac_modes: ["heat", "off"] }).ok, true);
});

test("light arguments are validated and clamped to the bulb's kelvin range", () => {
  assert.equal(call("light", "turn_on", "light.a", { brightness_pct: 0 }).ok, false);
  assert.equal(call("light", "turn_on", "light.a", { rgb_color: [255, 0, 300] }).ok, false);
  assert.equal(call("light", "turn_on", "light.a", { color_temp_kelvin: 2000 }, { min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 }).ok, false);
  assert.equal(call("light", "turn_on", "light.a", { brightness_pct: 40, rgb_color: [255, 120, 0], transition: 1 }).ok, true);
});

test("rejects unknown services, mismatched domains, bad entity ids and extra keys", () => {
  assert.equal(call("homeassistant", "restart", "light.a").ok, false);
  assert.equal(call("script", "turn_on", "script.a").ok, false);
  assert.equal(call("light", "turn_on", "switch.a").ok, false);
  assert.equal(call("light", "turn_on", "light.a b").ok, false);
  assert.equal(call("switch", "turn_on", "switch.a", { evil: 1 }).ok, false);
  assert.equal(call("constructor", "x", "constructor.a").ok, false);
  assert.equal(validateService(null).ok, false);
});

test("media, humidifier, fan and cover ranges", () => {
  assert.equal(call("media_player", "volume_set", "media_player.a", { volume_level: 1.2 }).ok, false);
  assert.equal(call("media_player", "volume_set", "media_player.a", { volume_level: 0.3 }).ok, true);
  assert.equal(call("humidifier", "set_humidity", "humidifier.a", { humidity: 70 }, { min_humidity: 30, max_humidity: 60 }).ok, false);
  assert.equal(call("fan", "set_percentage", "fan.a", { percentage: 50 }).ok, true);
  assert.equal(call("cover", "set_cover_position", "cover.a", { position: 101 }).ok, false);
  assert.equal(call("cover", "stop_cover", "cover.a").ok, true);
});

test("media_player transport, seek, mute and source are validated", () => {
  assert.equal(call("media_player", "turn_off", "media_player.tv").ok, true);
  assert.equal(call("media_player", "media_seek", "media_player.tv", { seek_position: 90000 }).ok, false);
  assert.equal(call("media_player", "media_seek", "media_player.tv", {}).ok, false);
  assert.equal(call("media_player", "media_seek", "media_player.tv", { seek_position: 120.5 }).ok, true);
  assert.equal(call("media_player", "volume_mute", "media_player.tv", { is_volume_muted: "yes" }).ok, false);
  assert.equal(call("media_player", "volume_mute", "media_player.tv", { is_volume_muted: true }).ok, true);
  assert.equal(call("media_player", "select_source", "media_player.tv", { source: "x".repeat(101) }).ok, false);
  assert.equal(call("media_player", "select_source", "media_player.tv", { source: "HDMI 1" }).ok, true);
  assert.equal(call("media_player", "repeat_set", "media_player.tv", { repeat: "forever" }).ok, false);
  assert.equal(call("media_player", "repeat_set", "media_player.tv", { repeat: "one" }).ok, true);
});

test("play_media needs a known type and a clean id", () => {
  assert.equal(call("media_player", "play_media", "media_player.tv", { media_content_type: "movie" }).ok, false);
  assert.equal(call("media_player", "play_media", "media_player.tv", { media_content_type: "exe", media_content_id: "1" }).ok, false);
  assert.equal(call("media_player", "play_media", "media_player.tv", { media_content_type: "movie", media_content_id: "a\nb" }).ok, false);
  assert.equal(call("media_player", "play_media", "media_player.tv", { media_content_type: "movie", media_content_id: "x".repeat(501) }).ok, false);
  assert.equal(call("media_player", "play_media", "media_player.tv", { media_content_type: "movie", media_content_id: "plex://1234" }).ok, true);
});

test("remote commands are an allowlist of at most 8 keys", () => {
  assert.equal(call("remote", "send_command", "remote.tv", { command: ["DPAD_UP"] }).ok, true);
  assert.equal(call("remote", "send_command", "remote.tv", { command: ["DPAD_UP", "5"], num_repeats: 3, delay_secs: 0.5 }).ok, true);
  assert.equal(call("remote", "send_command", "remote.tv", { command: ["REBOOT"] }).ok, false);
  assert.equal(call("remote", "send_command", "remote.tv", { command: [] }).ok, false);
  assert.equal(call("remote", "send_command", "remote.tv", { command: Array(9).fill("HOME") }).ok, false);
  assert.equal(call("remote", "send_command", "remote.tv", { command: "HOME" }).ok, false);
  assert.equal(call("remote", "send_command", "remote.tv", { command: ["HOME"], num_repeats: 11 }).ok, false);
  assert.equal(call("remote", "send_command", "remote.tv", { command: ["HOME"], delay_secs: 3 }).ok, false);
  assert.equal(call("remote", "send_command", "remote.tv", {}).ok, false);
  assert.equal(call("remote", "turn_on", "remote.tv", { activity: "com.plexapp.android" }).ok, true);
  assert.equal(call("remote", "turn_on", "remote.tv", { activity: "a\u0000b" }).ok, false);
});

test("persistent_notification.dismiss takes only a well-formed notification_id and sends no entity_id", () => {
  const ok = validateService({ domain: "persistent_notification", service: "dismiss", data: { notification_id: "b63bb9caff-1_x.y" } });
  assert.deepEqual(ok, { ok: true, domain: "persistent_notification", service: "dismiss", data: { notification_id: "b63bb9caff-1_x.y" } });
  const bad = (data: unknown, extra: object = {}) => validateService({ domain: "persistent_notification", service: "dismiss", data, ...extra }).ok;
  assert.equal(bad({}), false);
  assert.equal(bad({ notification_id: "a/b" }), false);
  assert.equal(bad({ notification_id: "" }), false);
  assert.equal(bad({ notification_id: "x".repeat(129) }), false);
  assert.equal(bad({ notification_id: 5 }), false);
  assert.equal(bad({ notification_id: "ok", other: 1 }), false);
  assert.equal(bad({ notification_id: "ok" }, { entity_id: "light.a" }), false);
  assert.equal(validateService({ domain: "persistent_notification", service: "create", data: { message: "x" } }).ok, false);
});

const timed = { summary: "Dentist", start_date_time: "2026-11-21T14:00:00+02:00", end_date_time: "2026-11-21T15:00:00+02:00" };
const allDay = { summary: "Holiday", start_date: "2026-12-24", end_date: "2026-12-27" };

test("calendar.create_event accepts a timed event and an all-day one, and adds the entity", () => {
  assert.deepEqual(call("calendar", "create_event", "calendar.family", { ...timed, description: "Bring card\nand coat", location: "Main St" }), {
    ok: true, domain: "calendar", service: "create_event", data: { ...timed, description: "Bring card\nand coat", location: "Main St", entity_id: "calendar.family" },
  });
  assert.equal(call("calendar", "create_event", "calendar.family", allDay).ok, true);
  assert.equal(call("calendar", "create_event", "calendar.family", { summary: "x", start_date_time: "2026-11-21 14:00:00", end_date_time: "2026-11-21 15:30" }).ok, true, "HA's own space-separated format");
});

test("calendar.create_event refuses anything but a calendar entity", () => {
  for (const e of ["light.kitchen", "calendar", "calendar.", "calendar.A", "calendar.a b", "switch.calendar_x"]) assert.equal(call("calendar", "create_event", e, timed).ok, false, e);
  assert.equal(validateService({ domain: "calendar", service: "create_event", data: timed }).ok, false);
  assert.equal(call("calendar", "delete_event", "calendar.family", {}).ok, false, "only create is allowed");
  assert.equal(call("calendar", "create_event", "calendar.family", { ...timed, in: "2 hours" }).ok, false);
});

test("calendar.create_event title, notes and place are bounded", () => {
  const bad = (data: Record<string, unknown>) => call("calendar", "create_event", "calendar.family", { ...timed, ...data }).ok;
  assert.equal(bad({ summary: "" }), false);
  assert.equal(bad({ summary: "x".repeat(201) }), false);
  assert.equal(bad({ summary: "x".repeat(200) }), true);
  assert.equal(bad({ summary: "two\nlines" }), false);
  assert.equal(bad({ summary: 5 }), false);
  assert.equal(bad({ description: "x".repeat(2001) }), false);
  assert.equal(bad({ description: "x".repeat(2000) }), true);
  assert.equal(bad({ description: "bell\u0007" }), false);
  assert.equal(bad({ location: "x".repeat(201) }), false);
  assert.equal(bad({ location: "a\nb" }), false);
  assert.equal(call("calendar", "create_event", "calendar.family", { start_date: "2026-12-24", end_date: "2026-12-25" }).ok, false, "a title is required");
});

test("calendar.create_event dates must be real and in order", () => {
  const bad = (data: Record<string, unknown>) => !call("calendar", "create_event", "calendar.family", data).ok;
  assert.equal(bad({ ...timed, end_date_time: "2026-11-21T13:00:00+02:00" }), true, "end before start");
  assert.equal(bad({ ...timed, end_date_time: timed.start_date_time }), true, "empty event");
  assert.equal(bad({ ...allDay, end_date: "2026-12-24" }), true, "all-day end is exclusive: same day is empty");
  assert.equal(bad({ ...allDay, end_date: "2026-12-20" }), true);
  assert.equal(bad({ ...allDay, start_date: "2026-02-30" }), true);
  assert.equal(bad({ ...allDay, start_date: "2026-12-24T00:00" }), true);
  assert.equal(bad({ ...allDay, start_date: "1999-12-24", end_date: "1999-12-25" }), true);
  assert.equal(bad({ ...timed, start_date_time: "2026-11-21T25:00:00+02:00" }), true);
  assert.equal(bad({ ...timed, start_date_time: "tomorrow" }), true);
  assert.equal(bad({ ...timed, start_date_time: "2026-11-21T14:00:00" }), true, "one side with an offset and one without");
  assert.equal(bad({ ...timed, start_date_time: "2026-11-21T14:00:00", end_date_time: "2026-11-21T15:00:00" }), false);
  assert.equal(bad({ ...timed, end_date_time: "2028-11-21T15:00:00+02:00" }), true, "longer than a year");
});

test("calendar.create_event takes either dates or date-times, complete", () => {
  const bad = (data: Record<string, unknown>) => !call("calendar", "create_event", "calendar.family", data).ok;
  assert.equal(bad({ summary: "x" }), true);
  assert.equal(bad({ ...timed, ...allDay }), true, "not both");
  assert.equal(bad({ summary: "x", start_date: "2026-12-24" }), true);
  assert.equal(bad({ summary: "x", end_date: "2026-12-24" }), true);
  assert.equal(bad({ summary: "x", start_date_time: timed.start_date_time }), true);
  assert.equal(bad({ summary: "x", start_date: "2026-12-24", end_date_time: timed.end_date_time }), true);
});

const WASH = "button.bathroom_washing_machine";
test("WashData buttons: only pause, resume, force end and mark unloaded, only as button entities", () => {
  for (const s of ["pause_cycle", "resume_cycle", "force_end_cycle", "mark_unloaded"]) {
    assert.deepEqual(call("button", "press", `${WASH}_${s}`), { ok: true, domain: "button", service: "press", data: { entity_id: `${WASH}_${s}` } });
  }
  for (const bad of ["button.router_restart", "button.bathroom_washing_machine_record_cycle_start", "button.x_pause_cycle_now", "light.x_pause_cycle", "button.", "button.A_pause_cycle", "switch.x_mark_unloaded"]) {
    assert.equal(call("button", "press", bad).ok, false, bad);
  }
  assert.equal(call("button", "press", `${WASH}_pause_cycle`, { anything: 1 }).ok, false, "takes no data");
  assert.equal(validateService({ domain: "button", service: "press" }).ok, false);
  assert.equal(call("button", "push", `${WASH}_pause_cycle`).ok, false);
});

test("WashData program: the option must be one the entity lists", () => {
  const E = "select.bathroom_washing_machine_cycle_program";
  const attrs = { options: ["auto_detect", "Cotton 40", "Eco 50"] };
  assert.deepEqual(call("select", "select_option", E, { option: "Cotton 40" }, attrs), { ok: true, domain: "select", service: "select_option", data: { option: "Cotton 40", entity_id: E } });
  assert.equal(call("select", "select_option", E, { option: "auto_detect" }, attrs).ok, true);
  assert.equal(call("select", "select_option", E, { option: "Quick 15" }, attrs).ok, false, "not offered");
  assert.equal(call("select", "select_option", E, { option: "Cotton 40" }, {}).ok, false, "no options known: nothing can be chosen");
  assert.equal(call("select", "select_option", E, {}, attrs).ok, false, "option is required");
  assert.equal(call("select", "select_option", E, { option: 3 }, attrs).ok, false);
  assert.equal(call("select", "select_option", E, { option: "Cotton 40", extra: 1 }, attrs).ok, false);
  assert.equal(call("select", "select_option", "select.bathroom_washing_machine_switch_indicator_mode", { option: "Cotton 40" }, attrs).ok, false, "only the cycle program select");
  assert.equal(call("select", "select_option", "light.bathroom_washing_machine_cycle_program", { option: "Cotton 40" }, attrs).ok, false);
});

test("the server fetches the entity's options before validating select_option", async () => {
  const E = "select.bathroom_washing_machine_cycle_program";
  const sent: string[] = [];
  const fake = async (path: string, init?: RequestInit) => {
    sent.push(`${init?.method ?? "GET"} ${path}`);
    return Response.json(init ? {} : { attributes: { options: ["auto_detect", "Eco 50"] } });
  };
  assert.deepEqual(await callHaService({ domain: "select", service: "select_option", entity_id: E, data: { option: "Eco 50" } }, fake), { ok: true });
  assert.deepEqual(sent, [`GET states/${E}`, "POST services/select/select_option"]);
  const bad = await callHaService({ domain: "select", service: "select_option", entity_id: E, data: { option: "Sneaky" } }, fake);
  assert.equal(bad.ok, false);
});

test("a run of calls to one entity asks Home Assistant for its limits once, a failed answer is not remembered", async () => {
  const E = "light.desk";
  let reads = 0;
  const fake = async (_path: string, init?: RequestInit) => {
    if (init?.method !== "POST") reads++;
    return init ? Response.json({}) : Response.json({ attributes: { min_color_temp_kelvin: 2000, max_color_temp_kelvin: 3000 } });
  };
  const turnOn = (k: number) => callHaService({ domain: "light", service: "turn_on", entity_id: E, data: { color_temp_kelvin: k } }, fake);
  assert.equal((await turnOn(2500)).ok, true);
  assert.equal((await turnOn(2600)).ok, true);
  assert.equal((await turnOn(5000)).ok, false, "still bounded by the entity's own limit");
  assert.equal(reads, 1);
  let reads2 = 0;
  const flaky = async (_path: string, init?: RequestInit) => (init ? Response.json({}) : ++reads2 === 1 ? Promise.reject(new Error("down")) : Response.json({ attributes: {} }));
  const call = () => callHaService({ domain: "light", service: "turn_on", entity_id: E, data: { color_temp_kelvin: 2500 } }, flaky);
  assert.equal((await call()).ok, false, "Home Assistant unreachable");
  assert.equal((await call()).ok, true, "the failure was not kept");
});
