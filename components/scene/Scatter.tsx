"use client";
import { useMemo } from "react";
import type { Placement, Species } from "@/lib/vegetation";
import type { Plan } from "@/lib/types";
import { shellWalls } from "@/lib/fences";
import { keepPlantable } from "@/lib/ground";
import FoliageInstances from "./FoliageInstances";
import { lawnDensity } from "@/lib/vegetation";
import { useKnobs } from "@/lib/quality";
import { rngOf } from "@/lib/mathUtil";

const MARGIN = 14;
const MAX_RADIUS = 25;
const NEAR_RADIUS = 13; // metres: where the extra blade tufts of the denser tiers go
const SEED = 20240611;
const GRASS_N = 340;
const FLOWER_N = 50;
const CLOVER_N = 28;
const LEAF_LAWN_N = 80;
const LEAF_BRICK_N = 40;
const PEBBLE_N = 40;
const LEAF_Y_LAWN = 0.0;
const LEAF_Y_BRICK = 0.07;

/**
 * Lawn detail around the building: blade tufts, small flowers, clover, fallen leaves (on the lawn and on brick floors) and stones.
 * Season, snow and wind are the foliage shader's job (see FoliageDriver); this only decides where things stand.
 */
function build(plan: Plan, lawn: number): Placement[] | null {
  const rand = rngOf(SEED);
  const rr = (a: number, b: number) => a + rand() * (b - a);

  // Bounding box of the plan, expanded by MARGIN, clipped to a circle.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of plan.rooms) xs.push(r.x, r.x + r.w), ys.push(r.y, r.y + r.h);
  for (const w of shellWalls(plan.walls)) xs.push(w.a.x, w.b.x), ys.push(w.a.y, w.b.y); // a far fence does not move the lawn
  if (!xs.length) return null;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;

  const blocked = (x: number, y: number, allowRoom?: (id: string) => boolean) => {
    for (const r of plan.rooms) {
      if (allowRoom?.(r.id)) continue;
      if (x > r.x - 0.3 && x < r.x + r.w + 0.3 && y > r.y - 0.3 && y < r.y + r.h + 0.3) return true;
    }
    for (const w of plan.walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - w.a.x) * dx + (y - w.a.y) * dy) / l2));
      if (Math.hypot(x - (w.a.x + t * dx), y - (w.a.y + t * dy)) < 0.46) return true;
    }
    for (const i of plan.items) {
      const a = (i.rot * Math.PI) / 180;
      const hx = (Math.abs(Math.cos(a)) * i.w + Math.abs(Math.sin(a)) * i.d) / 2 + 0.2;
      const hy = (Math.abs(Math.sin(a)) * i.w + Math.abs(Math.cos(a)) * i.d) / 2 + 0.2;
      if (Math.abs(x - i.x) < hx && Math.abs(y - i.y) < hy) return true;
    }
    return false;
  };

  const lawnPoint = (maxR = MAX_RADIUS): [number, number] | null => {
    for (let k = 0; k < 40; k++) {
      const x = rr(x0 - MARGIN, x1 + MARGIN), y = rr(y0 - MARGIN, y1 + MARGIN);
      if (Math.hypot(x - cx, y - cy) > maxR) continue;
      if (!blocked(x, y)) return [x, y];
    }
    return null;
  };

  const bricks = plan.rooms.filter((r) => r.floor === "brick");
  const brickArea = bricks.reduce((s, r) => s + r.w * r.h, 0);
  const brickPoint = (): [number, number] | null => {
    if (!brickArea) return null;
    let a = rand() * brickArea;
    const room = bricks.find((r) => (a -= r.w * r.h) <= 0) ?? bricks[bricks.length - 1];
    const x = rr(room.x + 0.1, room.x + room.w - 0.1), y = rr(room.y + 0.1, room.y + room.h - 0.1);
    // keep clear of walls and furniture, but allow being inside any room
    return blocked(x, y, () => true) ? null : [x, y];
  };

  const out: Placement[] = [];
  const put = (species: Species, p: [number, number] | null, y: number, sx: number, sy: number, lod?: 1) => {
    if (p) out.push({ species, variant: (rand() * 4) | 0, x: p[0], y, z: p[1], yaw: rr(0, Math.PI * 2), sx, sy, sz: sx, rand: [rand(), rand(), rand(), rand()], tone: rr(0.9, 1.1), ...(lod && { lod }) });
  };
  const more = (n: number, share: number) => Math.round(n * (1 + (lawn - 1) * share)); // flowers, clover and leaves grow slower than the blades
  for (let n = 0; n < Math.min(GRASS_N, more(GRASS_N, 1)); n++) {
    const p = lawnPoint();
    // beyond the near ring the denser tiers draw the lighter tuft (the lawn is thinner there too: only these tufts stand out that far)
    put("tuft", p, 0, rr(0.9, 2.0), rr(0.7, 1.7), lawn > 1 && p && Math.hypot(p[0] - cx, p[1] - cy) > NEAR_RADIUS ? 1 : undefined);
  }
  // the denser tiers thicken the lawn where it is looked at: finer tufts close to the building
  for (let n = GRASS_N; n < more(GRASS_N, 1); n++) put("tuft", lawnPoint(NEAR_RADIUS), 0, rr(0.7, 1.4), rr(0.6, 1.3));
  for (let n = 0; n < more(FLOWER_N, 0.6); n++) put(n % 3 ? "daisy" : "tulip", lawnPoint(), 0, rr(0.7, 1.1), rr(0.8, 1.2));
  for (let n = 0; n < more(CLOVER_N, 0.6); n++) put("clover", lawnPoint(), 0, rr(0.8, 1.6), 1);
  for (let n = 0; n < more(LEAF_LAWN_N, 0.4); n++) put("litter", lawnPoint(), LEAF_Y_LAWN, 1, 1);
  for (let n = 0; n < LEAF_BRICK_N; n++) put("litter", brickPoint(), LEAF_Y_BRICK, rr(0.8, 1.2), 1);
  for (let n = 0; n < PEBBLE_N; n++) put(n % 4 ? "rock" : "rock_moss", lawnPoint(), 0, rr(0.2, 0.45), rr(0.2, 0.45));
  return keepPlantable(plan, out); // nothing stands in the middle of a patio, a drive, a path or a pond
}

export default function Scatter({ plan }: { plan: Plan }) {
  const lawn = lawnDensity(useKnobs().grass);
  const plants = useMemo(() => build(plan, lawn), [plan.rooms, plan.walls, plan.items, plan.ground, plan.paths, lawn]); // the slices the scatter reads, not the whole plan
  if (!plants) return null;
  return <FoliageInstances plants={plants} />;
}
