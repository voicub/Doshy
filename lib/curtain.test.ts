import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "./catalog.ts";
import { blackoutDawnOn, curtainLayers, curtainOpenness, curtainParams, curtainRig, drapeAt, isWindowCurtain, readingOf, type CurtainRig, type Drape } from "./curtain.ts";
import type { HAState } from "./ha.ts";

const st = (entity_id: string, state: string, attributes: HAState["attributes"] = {}): HAState => ({ entity_id, state, attributes });
const P = curtainParams();

test("a cover gives its position, else open / closed", () => {
  assert.equal(curtainOpenness(st("cover.living", "open", { current_position: 40 }), P), 0.4);
  assert.equal(curtainOpenness(st("cover.living", "closed"), P), 0);
  assert.equal(curtainOpenness(st("cover.living", "open"), P), 1);
  assert.equal(curtainOpenness(st("cover.living", "opening"), P), 0.5);
});

test("a switch, a binary sensor and the sun: on / above the horizon is open", () => {
  assert.equal(curtainOpenness(st("binary_sensor.motion", "on"), P), 1);
  assert.equal(curtainOpenness(st("input_boolean.day", "off"), P), 0);
  assert.equal(curtainOpenness(st("sun.sun", "above_horizon"), P), 1);
  assert.equal(curtainOpenness(st("sun.sun", "below_horizon"), P), 0);
});

test("a percentage sensor is the opening; any other number needs a threshold", () => {
  assert.equal(curtainOpenness(st("sensor.blind", "35", { unit_of_measurement: "%" }), P), 0.35);
  assert.equal(curtainOpenness(st("sensor.lux", "600", { unit_of_measurement: "lx" }), P), undefined, "a lux value alone says nothing");
  const above = curtainParams({ curtainAbove: 500 });
  assert.equal(curtainOpenness(st("sensor.lux", "600", { unit_of_measurement: "lx" }), above), 1);
  assert.equal(curtainOpenness(st("sensor.lux", "120", { unit_of_measurement: "lx" }), above), 0);
});

test("reverse flips it, and nothing to go by gives undefined", () => {
  const rev = curtainParams({ curtainInvert: true });
  assert.equal(curtainOpenness(st("binary_sensor.motion", "on"), rev), 0);
  assert.equal(curtainOpenness(st("cover.living", "open", { current_position: 25 }), rev), 0.75);
  assert.equal(curtainOpenness(undefined, P), undefined);
  assert.equal(curtainOpenness(st("cover.living", "unavailable"), P), undefined);
  assert.equal(curtainOpenness(st("sensor.x", "abc", { unit_of_measurement: "%" }), P), undefined);
  assert.equal(readingOf(st("sensor.x", "1", { unit_of_measurement: "%" })), "percent");
});

const rigOf = (kind: string): CurtainRig => curtainRig(CATALOG[kind].parts)!;
const movedIn = (kind: string, layer: "sheer" | "blackout") => (rigOf(kind)[layer]?.drapes ?? []).map((d) => d.i);

test("each layer has its own settings and its own entity", () => {
  const none = curtainLayers({});
  assert.deepEqual(none.sheer, { invert: false });
  assert.deepEqual(none.blackout, { invert: false, dawn: false });
  const both = curtainLayers({
    entity: "cover.sheer",
    params: { curtainInvert: true, blackoutEntity: "cover.blackout", blackoutInvert: false, blackoutAbove: 300, blackoutOpenAt: "09:30" },
  });
  assert.deepEqual(both.sheer, { invert: true, entity: "cover.sheer" });
  assert.deepEqual(both.blackout, { invert: false, above: 300, entity: "cover.blackout", dawn: true, openAt: "09:30" });
  assert.equal(curtainParams({ curtainInvert: true, blackoutAbove: 5 }, "blackout").invert, false, "the layers do not share settings");
  assert.equal(curtainParams({ curtainInvert: true, blackoutAbove: 5 }, "blackout").above, 5);
  assert.equal(curtainParams({ curtainAbove: 7 }, "sheer").above, 7);
});

test("the dawn rule is on for a linked cover until switched off; an odd time is ignored", () => {
  assert.equal(blackoutDawnOn({}, "cover.bed"), true);
  assert.equal(blackoutDawnOn({ blackoutDawn: false }, "cover.bed"), false);
  assert.equal(blackoutDawnOn({ blackoutDawn: true }, undefined), false, "nothing linked");
  assert.equal(blackoutDawnOn({}, "sensor.lux"), false, "only a cover can be closed by the rule");
  assert.equal(curtainLayers({ params: { blackoutEntity: "cover.a", blackoutOpenAt: "25:99" } }).blackout.openAt, undefined);
  assert.equal(curtainLayers({ params: { blackoutEntity: "cover.a", blackoutOpenAt: "07:05" } }).blackout.openAt, "07:05");
});

test("pleats gathered at both sides draw toward the middle; a single curtain gathers toward its left", () => {
  const dark = rigOf("of_curtain_dark").blackout!;
  assert.equal(dark.mode, "pair");
  const parts = CATALOG.of_curtain_dark.parts;
  const d = dark.drapes.find((x) => x.x > 0)!;
  assert.equal(drapeAt(d, 1).x, d.x, "modelled open: nothing moves");
  const shut = drapeAt(d, 0);
  assert.ok(shut.x < d.x && shut.s > 1, "drawn: moves in and gets wider");
  const right = dark.drapes.filter((x) => x.edge > 0).map((x) => drapeAt(x, 0).x - (parts[x.i].s[0] * drapeAt(x, 0).s) / 2);
  assert.ok(Math.min(...right) < 0.02, "the right-hand pleats reach the middle");

  const single = rigOf("curtain");
  assert.equal(single.blackout, undefined, "a plain curtain is one fabric: the sheer layer only");
  assert.equal(single.sheer!.mode, "single");
  const p = single.sheer!.drapes[single.sheer!.drapes.length - 1];
  assert.ok(Math.abs(drapeAt(p, 0).x - p.x) < 1e-9, "modelled drawn");
  assert.ok(drapeAt(p, 1).x < p.x && drapeAt(p, 1).s < 1, "open: bunches left");
});

test("the owner's door curtain: the net is the sheer layer, the grey velvet side panels the blackout layer, and they move apart", () => {
  const kind = "lv_sheer_curtain_door";
  const rig = rigOf(kind);
  const parts = CATALOG[kind].parts;
  assert.equal(rig.sheer!.drapes.length, 1);
  assert.equal(parts[rig.sheer!.drapes[0].i].s[0], 1.8, "the net");
  assert.equal(rig.blackout!.mode, "pair");
  assert.equal(rig.blackout!.drapes.length, 6);
  const all = [...movedIn(kind, "sheer"), ...movedIn(kind, "blackout")];
  assert.equal(new Set(all).size, all.length, "a part belongs to one layer only");
  assert.ok(all.every((i) => parts[i].layer), "only layered parts move: the rod, rings and brackets stay");
  assert.ok(parts.filter((p) => !p.layer).every((p) => p.s[1] < 1.5), "everything that is not layered is hardware");
  // layers move independently: the net's gathered position does not depend on where the velvet is
  const net = rig.sheer!.drapes[0];
  assert.equal(drapeAt(net, 0).x, net.x, "modelled: drawn across");
  const gathered = drapeAt(net, 1);
  assert.ok(Math.abs(gathered.s - 0.2) < 1e-9, "open: a fifth of its width");
  assert.ok(Math.abs(gathered.x - (net.edge - (net.edge - net.x) * 0.2)) < 1e-9);
  assert.ok(net.edge < 0 && gathered.x < net.x, "gathers toward the side it is nearest (the left when centred), tied to its outer edge");
  assert.ok(isWindowCurtain(kind, CATALOG[kind].cat));
  assert.ok(!isWindowCurtain("bt_shower_tray_curtain", CATALOG.bt_shower_tray_curtain.cat), "a shower curtain is not window cloth");
});

test("a layer with pleats on one side only is gathered there (the grey blackout beside the sheer)", () => {
  const kind = "of_curtain_grey_sheer";
  const rig = rigOf(kind);
  assert.equal(rig.blackout!.mode, "pair");
  assert.ok(rig.blackout!.drapes.every((d) => d.edge < 0 && d.m === 1), "dark pleats gathered at the left");
  const shut = rig.blackout!.drapes.map((d) => drapeAt(d, 0).x);
  assert.ok(Math.max(...shut) > -0.2, "drawn they reach toward the middle");
  const sheer = rig.sheer!;
  assert.ok(sheer.drapes.some((d) => d.m === 1 && d.edge > 0), "light pleats gathered at the right");
  const sheet = sheer.drapes.find((d) => CATALOG[kind].parts[d.i].s[0] === 1.6)!;
  assert.equal(sheet.m, 0, "the net behind is modelled drawn");
  assert.ok(sheet.edge > 0, "and gathers to the right, the side it is nearest");
});

test("every window curtain in the catalog moves, and its layers are what the name says", () => {
  const kinds = Object.entries(CATALOG).filter(([k, d]) => isWindowCurtain(k, d.cat));
  assert.ok(kinds.length >= 8);
  for (const [kind] of kinds) assert.ok(curtainRig(CATALOG[kind].parts), `${kind} has moving cloth`);
  assert.deepEqual(Object.keys(rigOf("kt_patio_door_sheer")).sort(), ["blackout", "sheer"]);
  assert.ok(isWindowCurtain("kt_patio_door_sheer", "Decor"));
  assert.deepEqual(Object.keys(rigOf("of_curtain_grey_sheer")).sort(), ["blackout", "sheer"]);
  assert.deepEqual(Object.keys(rigOf("of_curtain_dark")).sort(), ["blackout", "sheer"]);
  assert.deepEqual(Object.keys(rigOf("dc_curtain_sheer_240")), ["sheer"]);
  assert.deepEqual(Object.keys(rigOf("dc_curtain_blackout_240")), ["blackout"]);
  assert.deepEqual(Object.keys(rigOf("dc_curtain_pair_200")), ["sheer"]);
  assert.equal(curtainRig(CATALOG.bt_bathtub.parts), null, "a shower curtain has no layers");
});

test("drawn, the sun-blocking layer is in front of the sheer net", () => {
  const front = (d: Drape, kind: string) => CATALOG[kind].parts[d.i].p[2] + CATALOG[kind].parts[d.i].s[2] / 2;
  for (const kind of ["lv_sheer_curtain_door", "of_curtain_grey_sheer", "of_curtain_dark", "kt_patio_door_sheer"]) {
    const rig = rigOf(kind);
    const nets = rig.sheer!.drapes.filter((d) => CATALOG[kind].parts[d.i].s[0] >= 0.8);
    const velvetFront = Math.min(...rig.blackout!.drapes.map((d) => front(d, kind)));
    for (const net of nets) assert.ok(front(net, kind) < velvetFront, `${kind}: the net is behind the velvet`);
  }
});

test("an unlinked curtain keeps exactly the look it was modelled with: every panel sits at its own place and width", () => {
  for (const [kind, def] of Object.entries(CATALOG)) {
    const rig = isWindowCurtain(kind, def.cat) ? curtainRig(def.parts) : null;
    for (const layer of [rig?.sheer, rig?.blackout]) {
      for (const d of layer?.drapes ?? []) {
        const at = drapeAt(d, d.m);
        assert.ok(Math.abs(at.x - d.x) < 1e-9 && Math.abs(at.s - 1) < 1e-9, `${kind} part ${d.i} is moved at its modelled openness`);
      }
    }
  }
});
