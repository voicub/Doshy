"use client";
import { useMemo, useRef } from "react";
import { Color } from "three";
import { yearPalette } from "@/lib/seasonYear";
import { useKnobs } from "@/lib/quality";
import { foliageLookAt, levelOfFoliage } from "@/lib/vegetation";
import { useStore } from "@/lib/store";
import { useSky } from "@/lib/useSky";
import FoliageInstances from "../FoliageInstances";
import { useSiteBlock } from "../site/siteBlock";
import { speciesDef } from "@/lib/vegetation";
import { useReducedMotion } from "../motion";
import { live } from "../skyLive";
import { gardenLayout } from "./layout";
import FallingLeaves from "./FallingLeaves";
import Sparks, { type SparkStep } from "./Sparks";
import { clamp } from "@/lib/mathUtil";


const FALL = 56; // spring petals
const GLOW = 56; // fireflies and cold mist, each
const AREA = 28; // metres across the drifting volume
const HEIGHT = 7;
const wrap = (v: number) => v - Math.floor(v);

/** Deterministic per-particle seeds in [0,1). */
function seeds(n: number) {
  let a = 90210;
  const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Float32Array.from({ length: n * 4 }, r);
}

/** 0..1 how much of the garden's current look belongs to season `s`. */
const share = (season: string, next: string, mix: number, s: string) => (season === s ? 1 - mix : 0) + (next === s ? mix : 0);

type Drift = { petals: Color[]; petalAmount: number; season: string; next: string; mix: number; rooms: number[][]; cx: number; cz: number };

/**
 * The garden follows the season: organic instanced trees, shrubs, hedges, grasses and flower beds (components/scene/FoliageInstances,
 * recoloured, shed and snowed on by the shared foliage shader), plus drifting petals, leaves, fireflies and winter mist.
 * A few dozen draw calls for the whole garden (one per species variant).
 */
export default function SeasonGarden({ cx, cz }: { cx: number; cz: number }) {
  const plan = useStore((s) => s.plan);
  const sky = useSky();
  const reduced = useReducedMotion();
  const { season, next } = sky.season;
  const mix = Math.round(sky.season.mix * 100) / 100;
  const { year } = sky;
  const pal = useMemo(() => yearPalette(year), [year.palette.season, year.palette.mix, year.snow]);
  // blossom petals drift for the weeks the trees flower on the denser tiers; the lighter tiers keep the four-step garden's spring
  const petalAmount = levelOfFoliage(useKnobs().foliage) >= 2 ? year.blossom : share(season, next, mix, "spring");
  const layout = useMemo(() => gardenLayout(plan), [plan.rooms, plan.walls, plan.ground, plan.paths]); // the slices the layout reads, not the whole plan
  // the real surroundings take precedence: nothing grows inside a neighbour's walls, and the made-up trees give way to the real ones
  const { inside, realTrees } = useSiteBlock();
  const plants = useMemo(() => layout && layout.filter((p) => !inside(p.x, p.z) && !(realTrees && speciesDef(p.species).tree)), [layout, inside, realTrees]);

  const drift = useRef<Drift | null>(null);
  const petals = useMemo(() => [pal.canopy[0], pal.canopy[1]].map((h) => new Color(h)), [pal]);
  // leaves in the air are the colour the tree turned, going browner as the weeks pass (the same colours the leaf litter on the ground has)
  const leaves = useMemo(() => foliageLookAt(year, 2).litter.map((h) => new Color(h)), [year.phase, year.palette.mix]);
  const rooms = plan.rooms.map((r) => [r.x, r.y, r.x + r.w, r.y + r.h]);
  drift.current = { petals, petalAmount, season, next, mix, rooms, cx, cz };
  const seed = useMemo(() => seeds(FALL + 2 * GLOW), []);

  /** Petals (spring): square sprites that sink and sway on the wind. Autumn leaves are real leaf shapes (FallingLeaves.tsx). */
  const fall = useMemo<SparkStep>(
    () => (b, t) => {
      const d = drift.current;
      if (!d) return;
      const wind = 0.15 + live.windX * live.wind * 0.12;
      for (let i = 0; i < FALL; i++) {
        const k = i / FALL, o = i * 4;
        const on = clamp((d.petalAmount - 0.85 * k) / 0.15, 0, 1);
        const y = HEIGHT * (1 - wrap(seed[o + 1] + t * 0.045));
        const x = d.cx + (wrap(seed[o] + (t * wind) / AREA) - 0.5) * AREA + Math.sin(t * 0.7 + seed[o + 3] * 6.3) * 0.5;
        const z = d.cz + (seed[o + 2] - 0.5) * AREA + Math.cos(t * 0.5 + seed[o + 3] * 4.1) * 0.5;
        const roofed = y < 2.8 && d.rooms.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
        const c = d.petals[seed[o + 3] > 0.5 ? 1 : 0];
        b.pos[i * 3] = x;
        b.pos[i * 3 + 1] = y;
        b.pos[i * 3 + 2] = z;
        b.col[i * 4] = c.r;
        b.col[i * 4 + 1] = c.g;
        b.col[i * 4 + 2] = c.b;
        b.col[i * 4 + 3] = roofed ? 0 : on * 0.9;
        b.size[i] = 0.075;
      }
    },
    [seed],
  );

  /** Fireflies (summer nights, additive and bright enough to bloom) and the faint breath of cold hanging over a winter lawn. */
  const glow = useMemo<SparkStep>(
    () => (b, t) => {
      const d = drift.current;
      if (!d) return;
      for (let i = 0; i < 2 * GLOW; i++) {
        const mist = i >= GLOW, k = (i % GLOW) / GLOW, o = (FALL + i) * 4;
        const on = clamp((share(d.season, d.next, d.mix, mist ? "winter" : "summer") - 0.85 * k) / 0.15, 0, 1);
        const x = d.cx + (seed[o] - 0.5) * AREA * 0.8 + Math.sin(t * 0.4 + seed[o + 3] * 20) * (mist ? 0.6 : 1.4);
        const z = d.cz + (seed[o + 2] - 0.5) * AREA * 0.8 + Math.cos(t * 0.33 + seed[o + 3] * 17) * (mist ? 0.6 : 1.4);
        const rise = wrap(seed[o + 1] + t * 0.02);
        const y = mist ? 0.1 + rise * 1.4 : 0.35 + seed[o + 1] * 1.7 + Math.sin(t * 0.8 + seed[o + 3] * 30) * 0.25;
        const roofed = d.rooms.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
        const a = mist ? on * Math.sin(Math.PI * rise) * 0.07 : on * (1 - live.daylight) * (0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + seed[o + 3] * 40)));
        b.pos[i * 3] = x;
        b.pos[i * 3 + 1] = y;
        b.pos[i * 3 + 2] = z;
        // firefly: warm yellow-green far above 1 so bloom picks it up; mist: cool white
        b.col[i * 4] = mist ? 0.8 : 1.6;
        b.col[i * 4 + 1] = mist ? 0.9 : 2.4;
        b.col[i * 4 + 2] = mist ? 1 : 0.35;
        b.col[i * 4 + 3] = roofed ? 0 : a;
        b.size[i] = mist ? 1.1 : 0.11;
      }
    },
    [seed],
  );

  if (!plants) return null;
  return (
    <group>
      <FoliageInstances plants={plants} />
      {!reduced && (
        <>
          <Sparks count={FALL} step={fall} shape="square" />
          <FallingLeaves amount={year.falling} colors={leaves} rooms={rooms} cx={cx} cz={cz} />
          <Sparks count={2 * GLOW} step={glow} shape="dot" additive />
        </>
      )}
    </group>
  );
}
