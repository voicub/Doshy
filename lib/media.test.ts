import test from "node:test";
import assert from "node:assert/strict";
import type { HAState } from "./ha.ts";
import { validateService } from "./haService.ts";
import { FEATURE, featuresOf, groupByRoom, leadPlayer, listPlayers, normalise, positionAt, pctToVolume, seekTarget, sortPlayers, volumeToPct, byline, headline } from "./media.ts";

const st = (id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id: id, state, attributes });
const P = (id: string, state: string, a: HAState["attributes"] = {}) => normalise(st(`media_player.${id}`, state, { friendly_name: id, ...a }));

test("decodes every standard supported_features bit", () => {
  const all = Object.values(FEATURE).reduce((a, b) => a | b, 0);
  assert.ok(Object.values(featuresOf(all)).every(Boolean));
  assert.ok(Object.values(featuresOf(0)).every((v) => !v));
  const f = featuresOf(FEATURE.PAUSE | FEATURE.VOLUME_SET | FEATURE.NEXT_TRACK | FEATURE.GROUPING);
  assert.deepEqual([f.pause, f.volumeSet, f.next, f.grouping, f.seek, f.mute, f.previous, f.source, f.shuffle, f.repeat], [true, true, true, true, false, false, false, false, false, false]);
  assert.equal(featuresOf(FEATURE.SHUFFLE_SET).shuffle, true);
  assert.equal(featuresOf(FEATURE.SELECT_SOUND_MODE).soundMode, true);
  assert.equal(featuresOf(FEATURE.REPEAT_SET).repeat, true);
});

test("garbage supported_features means no controls", () => {
  for (const bad of [undefined, null, "4", NaN, Infinity, -1]) assert.ok(Object.values(featuresOf(bad)).every((v) => !v), String(bad));
});

test("normalises a full player and survives a bare one", () => {
  const p = normalise(st("media_player.k", "playing", { friendly_name: "Kitchen", media_title: "Song", media_artist: "Band", media_album_name: "LP", media_duration: 200, media_position: 10, media_position_updated_at: "2026-01-01T00:00:00+00:00", volume_level: 0.3, is_volume_muted: true, source: "Spotify", source_list: ["Spotify", 3 as unknown as string], repeat: "all", shuffle: true, supported_features: 4 | 1 }));
  assert.equal(p.name, "Kitchen");
  assert.deepEqual([p.title, p.artist, p.album, p.duration, p.position, p.volume, p.muted, p.repeat, p.shuffle, p.sources], ["Song", "Band", "LP", 200, 10, 0.3, true, "all", true, ["Spotify"]]);
  assert.equal(p.positionAt, Date.parse("2026-01-01T00:00:00+00:00"));
  const bare = normalise(st("media_player.living_room_tv", "weird"));
  assert.equal(bare.name, "living room tv");
  assert.equal(bare.state, "unavailable");
  assert.deepEqual([bare.title, bare.volume, bare.duration, bare.repeat, bare.group, bare.muted], [undefined, undefined, 0, undefined, [], false]);
  assert.equal(normalise(st("media_player.a", "idle", { repeat: "sideways" })).repeat, undefined);
  assert.equal(normalise(st("media_player.a", "idle", { volume_level: 7 })).volume, 1);
});

test("position advances only while playing and clamps to the duration", () => {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const base = { position: 100, positionAt: t0, duration: 130 };
  assert.equal(positionAt({ ...base, state: "playing" }, t0 + 10_000), 110);
  assert.equal(positionAt({ ...base, state: "playing" }, t0 + 999_000), 130);
  assert.equal(positionAt({ ...base, state: "paused" }, t0 + 10_000), 100);
  assert.equal(positionAt({ ...base, state: "playing" }, t0 - 5_000), 100); // clock skew never rewinds
  assert.equal(positionAt({ ...base, state: "playing", duration: 0 }, t0 + 500_000), 600); // live stream: no clamp
  assert.equal(positionAt({ state: "playing", position: 5, duration: 0 }, t0), 5); // no timestamp: no advance
});

test("seek target and volume maths stay in range", () => {
  assert.equal(seekTarget(0.5, 201), 101);
  assert.equal(seekTarget(-1, 200), 0);
  assert.equal(seekTarget(2, 200), 200);
  assert.equal(seekTarget(NaN, 200), 0);
  assert.equal(seekTarget(0.5, 0), 0);
  assert.equal(volumeToPct(0.304), 30);
  assert.equal(volumeToPct(9), 100);
  assert.equal(pctToVolume(33), 0.33);
  assert.equal(pctToVolume(150), 1);
  assert.equal(pctToVolume(-4), 0);
  assert.equal(pctToVolume(NaN), 0);
});

test("sorts playing, then paused, then the rest, by name", () => {
  const order = sortPlayers([P("z_off", "off"), P("b_idle", "idle"), P("c_paused", "paused"), P("a_play", "playing"), P("d_play", "buffering"), P("a_idle", "idle")]).map((p) => p.name);
  assert.deepEqual(order, ["a_play", "d_play", "c_paused", "a_idle", "b_idle", "z_off"]);
  const input = [P("b", "off"), P("a", "playing")];
  sortPlayers(input);
  assert.equal(input[0].name, "b"); // input untouched
});

test("groups by area, areas alphabetical, unmapped last", () => {
  const areas = [{ id: "office", name: "Office" }, { id: "kitchen", name: "Kitchen" }, { id: "empty", name: "Empty" }];
  const ps = [P("e1", "idle"), P("e2", "playing"), P("e3", "idle"), P("e4", "idle")];
  const g = groupByRoom(ps, areas, { "media_player.e1": "office", "media_player.e2": "kitchen", "media_player.e3": null, "media_player.e4": "gone" });
  assert.deepEqual(g.map((x) => [x.name, x.players.map((p) => p.name)]), [["Kitchen", ["e2"]], ["Office", ["e1"]], ["Elsewhere", ["e3", "e4"]]]);
  assert.deepEqual(groupByRoom(ps.slice(0, 1), [], {}).map((x) => x.area), [null]);
  assert.deepEqual(groupByRoom([], areas, {}), []);
  const busy = groupByRoom([P("a", "idle"), P("b", "playing")], [{ id: "bed", name: "Bedroom" }, { id: "zed", name: "Zed" }], { "media_player.a": "bed", "media_player.b": "zed" });
  assert.deepEqual(busy.map((x) => x.name), ["Zed", "Bedroom"]); // the room with music leads
});

test("lists only media players and picks the lead player", () => {
  const states = { "light.a": st("light.a", "on"), "media_player.a": st("media_player.a", "idle"), "media_player.b": st("media_player.b", "paused"), "media_player.c": st("media_player.c", "playing") };
  const ps = listPlayers(states);
  assert.equal(ps.length, 3);
  assert.equal(leadPlayer(ps)?.id, "media_player.c");
  assert.equal(leadPlayer(ps.filter((p) => p.id !== "media_player.c"))?.id, "media_player.b");
  assert.equal(leadPlayer(ps.filter((p) => p.state === "idle")), undefined);
});

test("headline and byline fall back sensibly", () => {
  assert.equal(headline(P("a", "playing", { app_name: "Netflix" })), "Netflix");
  assert.equal(headline(P("a", "off", { app_name: "Netflix" })), undefined);
  assert.equal(byline(P("a", "playing", { media_artist: "Band", media_album_name: "LP" })), "Band · LP");
  assert.equal(byline(P("a", "playing", { app_name: "Spotify" })), "Spotify");
  assert.equal(byline(P("a", "playing")), undefined);
});

const call = (service: string, entity_id: string, data?: Record<string, unknown>) => validateService({ domain: "media_player", service, entity_id, data });
const E = "media_player.kitchen_echo_dot";

test("every media_player service the panel uses accepts a valid body", () => {
  for (const s of ["media_play", "media_pause", "media_stop", "media_next_track", "media_previous_track", "volume_up", "volume_down", "turn_on", "turn_off", "unjoin"]) {
    assert.deepEqual(call(s, E), { ok: true, domain: "media_player", service: s, data: { entity_id: E } }, s);
  }
  assert.equal(call("volume_set", E, { volume_level: 0 }).ok, true);
  assert.equal(call("volume_set", E, { volume_level: 1 }).ok, true);
  assert.equal(call("media_seek", E, { seek_position: 0 }).ok, true);
  assert.equal(call("volume_mute", E, { is_volume_muted: false }).ok, true);
  assert.equal(call("select_source", E, { source: "Local Speaker" }).ok, true);
  assert.equal(call("select_sound_mode", E, { sound_mode: "Movie" }).ok, true);
  assert.equal(call("shuffle_set", E, { shuffle: true }).ok, true);
  for (const r of ["off", "all", "one"]) assert.equal(call("repeat_set", E, { repeat: r }).ok, true);
  assert.equal(call("join", E, { group_members: ["media_player.office_echo_dot"] }).ok, true);
});

test("media_player services reject bad entity ids and non-player entities", () => {
  for (const s of ["media_pause", "turn_off", "unjoin", "media_next_track"]) {
    for (const bad of ["light.a", "media_player.", "media_player.A", "media_player.a b", "media_player.a.b", "media_player.a;b", ""]) assert.equal(call(s, bad).ok, false, `${s} ${bad}`);
    assert.equal(validateService({ domain: "media_player", service: s }).ok, false);
  }
});

test("media_player arguments are bounds checked", () => {
  assert.equal(call("volume_set", E, { volume_level: 1.01 }).ok, false);
  assert.equal(call("volume_set", E, { volume_level: -0.01 }).ok, false);
  assert.equal(call("volume_set", E, { volume_level: "0.5" }).ok, false);
  assert.equal(call("volume_set", E, {}).ok, false);
  assert.equal(call("media_seek", E, { seek_position: -1 }).ok, false);
  assert.equal(call("media_seek", E, { seek_position: NaN }).ok, false);
  assert.equal(call("select_source", E, { source: 5 }).ok, false);
  assert.equal(call("select_source", E, { source: ["a"] }).ok, false);
  assert.equal(call("select_source", E, { source: "x".repeat(101) }).ok, false);
  assert.equal(call("select_source", E, { source: "x".repeat(100) }).ok, true);
  assert.equal(call("select_source", E, {}).ok, false);
  assert.equal(call("select_sound_mode", E, { sound_mode: "x".repeat(101) }).ok, false);
  assert.equal(call("select_sound_mode", E, {}).ok, false);
  assert.equal(call("shuffle_set", E, { shuffle: "yes" }).ok, false);
  assert.equal(call("repeat_set", E, { repeat: "forever" }).ok, false);
  assert.equal(call("media_pause", E, { volume_level: 1 }).ok, false);
});

test("join takes only distinct media_player ids", () => {
  assert.equal(call("join", E, {}).ok, false);
  assert.equal(call("join", E, { group_members: [] }).ok, false);
  assert.equal(call("join", E, { group_members: "media_player.a" }).ok, false);
  assert.equal(call("join", E, { group_members: ["light.a"] }).ok, false);
  assert.equal(call("join", E, { group_members: ["media_player.a", "media_player.a"] }).ok, false);
  assert.equal(call("join", E, { group_members: Array.from({ length: 21 }, (_, i) => `media_player.p${i}`) }).ok, false);
  assert.equal(call("join", E, { group_members: [5] }).ok, false);
});
