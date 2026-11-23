"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { memo, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Line, LineDashedMaterial, MeshStandardMaterial, SphereGeometry, type Group } from "three";
import { CATALOG, type Def, type Part } from "@/lib/catalog";
import type { Placement } from "@/lib/partBake";
import { canBake, planBake, type BakePlan } from "./partMerge";
import { BEHAVIOUR, BODY_N, BONE_N, O_BOB, O_BREATH, O_PITCH, O_RX, O_ROLL, O_Y, O_Z, animate, critterParams, initState, outSize, stepCritter, type Cfg, type CritterState } from "@/lib/critters";
import { buildWorld } from "@/lib/critterWorld";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { useReducedMotion } from "./motion";
import { useKnobs } from "@/lib/quality";
import { live } from "./skyLive";

// A living animal: the catalog parts of a Def with `critter`, grouped into bones that move (lib/critters.ts). Per-frame work is imperative (refs), nothing re-renders.
// Wandering is live view only and needs the plan's walls and furniture; the editing views show the animal at its spot, breathing and blinking.

const NIGHT_FALLS = 0.2; // daylight below this: roaming animals go to bed
const NIGHT_ENDS = 0.4; // and get up again above this
const EMPTY: never[] = [];

const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 10);
const SPH = new SphereGeometry(0.5, 12, 8);
/** The unit geometry a part is stretched from, and the stretch (a cylinder's diameter is its first size). */
const unitOf = (p: Part) => (p.shape === "cyl" ? CYL : p.shape === "sph" ? SPH : BOX);
const scaleOf = (p: Part): [number, number, number] => (p.shape === "cyl" ? [p.s[0], p.s[1], p.s[0]] : p.shape === "sph" ? [p.s[0], p.s[0], p.s[0]] : p.s);
const mats = new Map<string, MeshStandardMaterial>();
/** One shared material per colour: forty parts of an animal are a handful of shader programs, not forty. */
function material(color: string, ghost: boolean): MeshStandardMaterial {
  const key = `${color}${ghost ? "!" : ""}`;
  let m = mats.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.9, transparent: ghost, opacity: ghost ? 0.22 : 1, depthWrite: !ghost });
    mats.set(key, m);
  }
  return m;
}
/** The material of a part: its own colour, or the owner's finish on the parts that take it. */
const paintOf = (p: Part, finish: string | undefined, ghost: boolean) => material(p.m && finish ? finish : p.c, ghost);

/** Where each animal got to, kept across remounts (a view change, a level switch) so it never jumps back. */
const states = new Map<string, CritterState>();
const stateOf = (id: string) => {
  let s = states.get(id);
  if (!s) states.set(id, (s = initState(id)));
  return s;
};

type Refs = MutableRefObject<(Group | null)[]>;

const Skeleton = memo(function Skeleton({ def, color, ghost, refs }: { def: Def; color?: string; ghost: boolean; refs: Refs }) {
  const spec = def.critter!;
  const owner = useMemo(() => {
    const own = def.parts.map(() => -1);
    spec.bones.forEach((bn, i) => bn.parts.forEach((pi) => (own[pi] = i)));
    return own;
  }, [def, spec]);
  const paint = (p: Part) => paintOf(p, color, ghost);
  // the parts of one bone (or of the body that never moves on its own) that share a colour are one mesh: they move as one anyway
  const plans = useMemo(() => {
    const plan = (members: readonly number[], pivot: readonly [number, number, number], tag: string) =>
      planBake(
        def.parts,
        def.parts.map((p): Placement => ({ p: [p.p[0] - pivot[0], p.p[1] - pivot[1], p.p[2] - pivot[2]], r: p.r, scale: scaleOf(p) })),
        def.parts.map(unitOf),
        def.parts.map((p, pi) => (members.includes(pi) && canBake(paintOf(p, color, ghost), true) ? paintOf(p, color, ghost) : null)),
        tag,
      );
    return { root: plan(def.parts.flatMap((_, pi) => (owner[pi] < 0 ? [pi] : [])), [0, 0, 0], "critter"), bones: spec.bones.map((bn, i) => plan(bn.parts, bn.pivot, `critter${i}`)) };
  }, [def, spec, owner, color, ghost]);
  const baked = (plan: BakePlan, key: string) => plan.baked.map((b, i) => <mesh key={`${key}${i}`} geometry={b.geometry} material={b.material} castShadow={!ghost} receiveShadow />);
  const mesh = (pi: number, o: [number, number, number], plan: BakePlan) => {
    if (plan.covered[pi]) return null;
    const p = def.parts[pi];
    return <mesh key={pi} geometry={unitOf(p)} material={paint(p)} position={[p.p[0] - o[0], p.p[1] - o[1], p.p[2] - o[2]]} rotation={p.r} scale={scaleOf(p)} castShadow={!ghost} receiveShadow />;
  };
  const bone = (i: number): ReactNode => {
    const bn = spec.bones[i];
    const par = bn.parent === undefined ? [0, 0, 0] : spec.bones[bn.parent].pivot;
    return (
      <group key={`b${i}`} ref={(g) => void (refs.current[i] = g)} position={[bn.pivot[0] - par[0], bn.pivot[1] - par[1], bn.pivot[2] - par[2]]}>
        {baked(plans.bones[i], "k")}
        {bn.parts.map((pi) => mesh(pi, bn.pivot, plans.bones[i]))}
        {spec.bones.flatMap((c, ci) => (c.parent === i ? [bone(ci)] : []))}
      </group>
    );
  };
  return (
    <>
      {baked(plans.root, "r")}
      {def.parts.map((_, pi) => (owner[pi] < 0 ? mesh(pi, [0, 0, 0], plans.root) : null))}
      {spec.bones.flatMap((bn, i) => (bn.parent === undefined ? [bone(i)] : []))}
    </>
  );
});

/** Dashed circle on the floor: how far the animal may wander (shown while it is selected in the editing views). */
function RoamRing({ radius }: { radius: number }) {
  const line = useMemo(() => {
    const g = new BufferGeometry();
    const n = 72;
    g.setAttribute("position", new Float32BufferAttribute(Array.from({ length: n }, (_, i) => [Math.sin((i / n) * Math.PI * 2) * radius, 0, Math.cos((i / n) * Math.PI * 2) * radius]).flat(), 3));
    const l = new Line(g, new LineDashedMaterial({ color: "#5ad7ff", dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
    l.computeLineDistances();
    l.renderOrder = 3;
    return l;
  }, [radius]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as LineDashedMaterial).dispose();
    },
    [line],
  );
  return <primitive object={line} position={[0, 0.08, 0]} />;
}

export default function Critter({ item, def, ghost, edit, elev }: { item: Item; def: Def; ghost: boolean; edit: boolean; elev: number }) {
  const spec = def.critter!;
  const calm = !useKnobs().ambient; // a calm tier keeps pets in their resting pose: no breathing, blinking or wandering to redraw
  const reduced = useReducedMotion() || calm;
  const par = critterParams(item.params, spec);
  const cfg = useMemo<Cfg>(() => ({ b: BEHAVIOUR[spec.kind], spec, radius: par.roam, speed: par.speed, pose: par.pose }), [spec, par.roam, par.speed, par.pose]);
  const roaming = !edit && !reduced && !ghost && par.roam > 0;
  const selected = useStore((s) => edit && s.sel?.type === "item" && s.sel.id === item.id);
  // the plan matters only to an animal that wanders
  const items = useStore((s) => (roaming ? s.plan.items : EMPTY));
  const walls = useStore((s) => (roaming ? s.plan.walls : EMPTY));
  const rooms = useStore((s) => (roaming ? s.plan.rooms : EMPTY));
  const place = useMemo(
    () => (roaming ? buildWorld(useStore.getState().plan, item, spec, par.roam, CATALOG) : null),
    // keyed by the item fields the world is built from, not the item object (other edits to it must not re-roam); the plan is read once
    [roaming, items, walls, rooms, item.id, item.x, item.y, item.rot, item.level, spec, par.roam],
  );

  const state = stateOf(item.id);
  const out = useMemo(() => new Float32Array(outSize(spec)), [spec]);
  const refs: Refs = useRef([]);
  const placeG = useRef<Group>(null);
  const poseG = useRef<Group>(null);
  const breathG = useRef<Group>(null);
  const night = useRef(false);
  // size: uniform scale from the item's size against the catalog's (the inspector's size slider keeps the three in step)
  const k = Math.cbrt((item.w / def.w) * (item.h / def.h) * (item.d / def.d));

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = state;
    if (!roaming && (s.x !== 0 || s.z !== 0 || s.h !== 0)) {
      // back at its spot in the editing views (and while it is a ghost or motion is reduced)
      s.x = 0;
      s.z = 0;
      if (s.mood === "walk" || s.mood === "sleep") s.mood = "idle";
    }
    night.current = live.daylight < (night.current ? NIGHT_ENDS : NIGHT_FALLS);
    if (reduced) {
      s.sit = par.pose === "sit" ? 1 : 0;
      s.lie = par.pose === "lie" ? 1 : 0;
      s.walk = 0;
    } else stepCritter(s, cfg, roaming ? place : null, night.current, dt);
    animate(spec, cfg, s, clock.elapsedTime, out, reduced);
    if (!reduced) keepAlive(); // breathing, blinking, walking
    const pg = placeG.current;
    const po = poseG.current;
    const bg = breathG.current;
    if (!pg || !po || !bg) return;
    pg.position.set(s.x, 0, s.z);
    pg.rotation.y = s.h;
    po.position.set(0, out[O_Y] + out[O_BOB], out[O_Z]);
    po.rotation.set(out[O_RX] + out[O_PITCH], 0, out[O_ROLL]);
    bg.scale.y = out[O_BREATH];
    for (let i = 0; i < spec.bones.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const o = BODY_N + i * BONE_N;
      g.rotation.set(out[o], out[o + 1], out[o + 2]);
      g.scale.y = out[o + 3];
    }
  });

  return (
    <group position={[0, elev, 0]}>
      <group ref={placeG} scale={k}>
        <group ref={poseG}>
          <group ref={breathG}>
            <Skeleton def={def} color={item.color} ghost={ghost} refs={refs} />
          </group>
        </group>
      </group>
      {selected && par.roam > 0 && <RoamRing radius={par.roam} />}
    </group>
  );
}
