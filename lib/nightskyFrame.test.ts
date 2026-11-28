import test from "node:test";
import assert from "node:assert/strict";
import { applyToRaDec, equatorialToScene, sceneDirection } from "./nightskyFrame.ts";
import { precess, raDecToAltAz } from "./nightsky.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
test("GPU catalogue matrix agrees with precessed horizon coordinates in both hemispheres and every plan bearing", () => {
  const date = new Date("2026-11-27T22:00:00Z");
  for (const lat of [-45, 0, 52]) for (const lon of [-120, 0, 26]) for (const bearing of [0, 90, 230]) for (const [ra, dec] of [[101.287,-16.716], [37.95,89.264], [0,0]]) {
    const p = precess(ra, dec, date);
    const h = raDecToAltAz(p.ra, p.dec, date, lat, lon);
    const expected = sceneDirection(h.alt, h.az, bearing);
    const actual = applyToRaDec(equatorialToScene(date,lat,lon,bearing),ra,dec);
    actual.forEach((v,i) => close(v,expected[i]));
  }
});
test("north/east/up map to expected scene directions and rotate with the house", () => {
  close(sceneDirection(0,0,0)[2],-1);
  close(sceneDirection(0,90,0)[0],1);
  close(sceneDirection(90,0,0)[1],1);
  close(sceneDirection(0,90,90)[2],-1);
});
