import test from "node:test";
import assert from "node:assert/strict";
import { episodeLabel, isTvEntity, isTvIn, pickTv, playbackEntity, plexActivity, positionAt, tvIsOn } from "./plex.ts";
import type { HAState } from "./ha.ts";

const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id, state, attributes });
const map = (...l: HAState[]) => Object.fromEntries(l.map((s) => [s.entity_id, s]));
const real = map(
  st("media_player.bedroom_tv_2", "off", { device_class: "tv", friendly_name: "Bedroom TV" }),
  st("media_player.bedroom_tv", "off", { friendly_name: "Bedroom TV" }),
  st("remote.bedroom_tv", "off", { friendly_name: "Bedroom TV", current_activity: "com.plexapp.android", activity_list: [] }),
  st("media_player.plex_plex_for_android_tv_smart_tv", "unavailable", { friendly_name: "Plex (Plex for Android (TV) - Bedroom TV)" }),
  st("media_player.kitchen_echo_dot", "idle"),
);

test("finds the TV, its remote and the Plex client", () => {
  assert.deepEqual(pickTv(real), { power: "media_player.bedroom_tv_2", remote: "remote.bedroom_tv", plex: "media_player.plex_plex_for_android_tv_smart_tv" });
  assert.equal(isTvEntity(real, "media_player.kitchen_echo_dot"), false);
  assert.equal(isTvEntity(real, "remote.bedroom_tv"), true);
});

test("plays from the Plex client only while it reports, TV on-state from power then remote", () => {
  const tv = pickTv(real);
  assert.equal(playbackEntity(tv, real), "media_player.bedroom_tv_2");
  assert.equal(tvIsOn(tv, real), false);
  const on = { ...real, [tv.plex!]: st(tv.plex!, "playing"), [tv.power!]: st(tv.power!, "on") };
  assert.equal(playbackEntity(tv, on), tv.plex);
  assert.equal(tvIsOn(tv, on), true);
});

test("position advances only while playing and stops at the duration", () => {
  const t0 = Date.parse("2026-01-01T20:00:00Z");
  const a = { media_position: 100, media_duration: 130, media_position_updated_at: "2026-01-01T20:00:00Z" };
  assert.equal(positionAt(st("m.x", "playing", a), t0 + 10_000), 110);
  assert.equal(positionAt(st("m.x", "paused", a), t0 + 10_000), 100);
  assert.equal(positionAt(st("m.x", "playing", a), t0 + 999_000), 130);
  assert.equal(positionAt(st("m.x", "playing", {}), t0), 0);
});

test("episode label and Plex activity", () => {
  assert.equal(episodeLabel({ media_season: 1, media_episode: 4 }), "S01 E04");
  assert.equal(episodeLabel({ media_title: "A movie" }), undefined);
  assert.equal(plexActivity({ activity_list: ["com.netflix", "com.plexapp.android"] }), "com.plexapp.android");
  assert.equal(plexActivity({ activity_list: [], current_activity: "com.plexapp.android" }), "com.plexapp.android");
  assert.equal(plexActivity({ activity_list: [], current_activity: "com.netflix" }), undefined);
});

test("isTvIn with a ready pick answers like isTvEntity", () => {
  const tv = pickTv(real);
  for (const id of Object.keys(real)) assert.equal(isTvIn(tv, real, id), isTvEntity(real, id), id);
  assert.equal(isTvIn(tv, real, "light.nothing"), false);
});
