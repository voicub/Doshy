import test from "node:test";
import assert from "node:assert/strict";
import { listUpdates, shortSummary, updateKind, type UpdateAttrs } from "./haUpdates.ts";

test("classifies updates by where they come from", () => {
  assert.equal(updateKind("update.home_assistant_core_update", "/api/brands/integration/homeassistant/icon.png"), "core");
  assert.equal(updateKind("update.home_assistant_supervisor_update"), "core");
  assert.equal(updateKind("update.home_assistant_operating_system_update"), "os");
  assert.equal(updateKind("update.grafana_update", "/api/hassio/addons/a0d7b954_grafana/icon"), "addon");
  assert.equal(updateKind("update.slzb_06p10_zigbee_firmware", "/api/brands/integration/smlight/icon.png"), "device");
  assert.equal(updateKind("update.office_fp2", "https://github.com/Koenkk/zigbee2mqtt/raw/master/images/logo.png"), "device");
  assert.equal(updateKind("update.alexa_media_player_update", "/api/brands/integration/alexa_media/icon.png", "https://github.com/a/b/releases"), "integration");
  assert.equal(updateKind("update.mushroom_update", undefined, "https://github.com/piitaya/lovelace-mushroom/releases"), "card");
  assert.equal(updateKind("update.mystery", undefined, undefined), "other");
});

test("summary is short plain text", () => {
  assert.equal(shortSummary("## Fixes\n\n* **a** [b]"), "Fixes a b");
  assert.ok(shortSummary("x ".repeat(300)).length <= 160);
  assert.equal(shortSummary(undefined), "");
});

const st = (state: string, a: UpdateAttrs) => ({ state, attributes: a });

test("lists available updates grouped and sorted, skipped apart, counts up to date", () => {
  const list = listUpdates({
    "update.zeta_update": st("on", { title: "Zeta", installed_version: "1", latest_version: "2", entity_picture: "/api/hassio/addons/x/icon", release_url: "javascript:alert(1)" }),
    "update.alpha_update": st("on", { friendly_name: "Alpha update", installed_version: "1", latest_version: "2", entity_picture: "/api/hassio/addons/y/icon", release_url: "https://github.com/a/b" }),
    "update.home_assistant_core_update": st("on", { title: "Home Assistant Core", installed_version: "2026.11.1", latest_version: "2026.11.2", in_progress: true, update_percentage: 140 }),
    "update.done": st("off", { installed_version: "3", latest_version: "3" }),
    "update.skipme": st("off", { installed_version: "3", latest_version: "4", skipped_version: "4" }),
    "update.gone": st("unavailable", {}),
    "light.kitchen": st("on", {}),
  });
  assert.deepEqual(list.available.map((g) => g.kind), ["core", "addon"]);
  assert.deepEqual(list.available[1].items.map((i) => i.name), ["Alpha", "Zeta"]);
  assert.equal(list.available[0].items[0].percent, 100);
  assert.equal(list.available[0].items[0].installing, true);
  assert.equal(list.available[1].items[0].releaseUrl, "https://github.com/a/b");
  assert.equal(list.available[1].items[1].releaseUrl, null);
  assert.equal(list.availableCount, 3);
  assert.deepEqual(list.skipped.map((i) => i.id), ["update.skipme"]);
  assert.deepEqual(list.upToDate.map((i) => i.id), ["update.done"]);
});

test("nothing pending gives an empty list", () => {
  assert.deepEqual(listUpdates({}), { available: [], availableCount: 0, skipped: [], upToDate: [] });
});
