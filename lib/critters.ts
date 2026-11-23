// Living animals: rig types, idle animation and optional roaming. Pure and allocation-free per frame (components/scene/Critter.tsx drives it from useFrame).
// Only `import type` here: catalog.animals.ts (and so catalog.ts) pulls this file in, so it must not import the catalog back. The plan-reading half is lib/critterWorld.ts.
import type { Item } from "./types";
import { clamp, hashStr, type V3 } from "./mathUtil.ts";

export type Pose = "stand" | "sit" | "lie";
/** What a bone does. Legs are named by position (F front, B back, L/R sides); a bird or a rabbit's pair of hind legs use the B pair, a two-legged bird the F pair. */
export type Role = "head" | "tail" | "earL" | "earR" | "eyes" | "legFL" | "legFR" | "legBL" | "legBR" | "wingL" | "wingR";
/** A group of catalog parts (indices into Def.parts) that swings about `pivot` (footprint coords). `parent` = index of the bone it is attached to (a head carries its ears and eyes). */
export type Bone = { role: Role; pivot: V3; parent?: number; parts: number[] };
/** How an animal behaves and moves. */
export type Kind = "dog" | "cat" | "hop" | "small" | "fowl" | "hoof" | "slow";

export type CritterSpec = {
  kind: Kind;
  bones: Bone[];
  /** Natural coat colours offered as chips (the first is the model's own). */
  coats: string[];
  /** Poses the model can take (chips: Stand / Sit / Lie). Always includes "stand". */
  poses: Pose[];
  /** Hip pivot (y, z) the body tilts about when sitting. */
  hip: [number, number];
  /** Pitch (rad) of the body when sitting. 0 for birds and hooved animals (they fold down instead). */
  sitPitch: number;
  /** How far (m) the body sinks when sitting / lying. */
  sitDrop: number;
  lieDrop: number;
  /** Body radius (m) used to keep clear of walls while wandering. */
  r: number;
  /** Radius the "Let it wander" chip starts with; 0 = it cannot wander (perched, caged). Absent = the kind's usual. */
  roam?: number;
};

/** A critter kind is any catalog id starting an_ ; houses and structures share the prefix, only `Def.critter` ones live. */
export const isAnimalKind = (kind: string) => kind.startsWith("an_");

/** An animal linked to a pet tracker (device_tracker / person): "home" or "away" (shown as a ghost). Same rule as a car (lib/cars.ts carPresence). */
export function critterPresence(kind: string, entity: string | undefined, state: string | undefined): "home" | "away" | undefined {
  if (!isAnimalKind(kind) || !entity || !/^(device_tracker|person)\./.test(entity)) return undefined;
  return state === "home" ? "home" : state === "not_home" ? "away" : undefined;
}

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
export const ROAM_MAX = 6;
const SPEED_MIN = 0.5;
const SPEED_MAX = 2;

/** Per-piece options of an animal, read from Item.params with defaults. */
export function critterParams(params: Item["params"], spec: CritterSpec) {
  const roam = typeof params?.roam === "number" && params.roam > 0 && spec.roam !== 0 ? clamp(params.roam, 0.3, ROAM_MAX) : 0;
  const speed = typeof params?.speed === "number" ? clamp(params.speed, SPEED_MIN, SPEED_MAX) : 1;
  const p = params?.pose;
  const pose: Pose = (p === "sit" || p === "lie") && spec.poses.includes(p) ? p : "stand";
  return { roam, speed, pose };
}

/** A plain word for a coat colour (chip tooltips and screen-reader names). */
export function coatName(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 510;
  if (l < 0.2) return "Black";
  if (l > 0.88) return "White";
  if (max - min < 28) return l > 0.6 ? "Light grey" : "Grey";
  const hue = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  const warm = hue * 60;
  if (warm < 40 && l < 0.4) return "Brown";
  if (warm < 25) return l > 0.65 ? "Pink" : "Ginger";
  if (warm < 50) return l > 0.7 ? "Cream" : l < 0.4 ? "Brown" : "Tan";
  if (warm < 70) return "Golden";
  return "Coloured";
}

/** The coat chips of an animal: colour and a unique name (the name is the chip's key, so two tans become "Tan" and "Tan 2"). */
export const coatSwatches = (coats: string[]) =>
  coats.map((c, i) => {
    const n = coatName(c);
    const seen = coats.slice(0, i).filter((x) => coatName(x) === n).length;
    return { c, name: seen ? `${n} ${seen + 1}` : n };
  });

// ---------- behaviour per kind ----------

type Behaviour = {
  walk: number; // m/s at speed 1
  turn: number; // rad/s
  stride: number; // metres per leg cycle
  swing: number; // leg swing amplitude (rad)
  bob: number; // body bob (m)
  gait: "trot" | "hop" | "strut";
  rest: Pose[]; // what it does when it settles
  sleeps: boolean;
  forage: "sniff" | "graze" | "peck"; // head-down behaviour between walks
  forageP: number; // chance that a pause is spent with the head down (a hen pecks most of the time, a dog now and then)
  wag: number; // tail activity 0..1
  roam: number; // radius (m) the "Let it wander" chip starts with
  flock?: true;
  likes: RegExp; // furniture it likes to be near (kinds)
  shelter: RegExp; // where it goes to sleep
  pause: [number, number]; // idle seconds between walks
};

export const BEHAVIOUR: Record<Kind, Behaviour> = {
  dog: { walk: 0.9, turn: 4, stride: 0.55, swing: 0.6, bob: 0.012, gait: "trot", rest: ["sit", "lie"], sleeps: true, forage: "sniff", forageP: 0.2, wag: 0.8, roam: 1.5, likes: /^an_(kennel|dog_house|dog_bed|bowls|dog_run|kennel_run)/, shelter: /^an_(kennel|dog_house|dog_bed)/, pause: [2, 6] },
  small: { walk: 0.35, turn: 6, stride: 0.2, swing: 0.7, bob: 0.004, gait: "trot", rest: ["lie", "sit"], sleeps: true, forage: "sniff", forageP: 0.3, wag: 0, roam: 0.8, likes: /^an_(bowls|feeder|hay|cat_house)/, shelter: /^an_(cat_house|hutch)/, pause: [2, 7] },
  cat: { walk: 0.55, turn: 5, stride: 0.4, swing: 0.55, bob: 0.008, gait: "trot", rest: ["lie", "sit"], sleeps: true, forage: "sniff", forageP: 0.15, wag: 0.3, roam: 1.5, likes: /^an_(cat_|bowls|scratch|dog_bed)/, shelter: /^an_(cat_house|cat_tree|dog_bed)/, pause: [3, 8] },
  hop: { walk: 0.7, turn: 6, stride: 0.38, swing: 0.7, bob: 0.07, gait: "hop", rest: ["lie", "sit"], sleeps: true, forage: "sniff", forageP: 0.3, wag: 0, roam: 1, likes: /^an_(hutch|rabbit_|bowls|feeder|hay)/, shelter: /^an_(hutch|rabbit_)/, pause: [2, 6] },
  fowl: { walk: 0.5, turn: 7, stride: 0.22, swing: 0.8, bob: 0.01, gait: "strut", rest: ["sit"], sleeps: true, forage: "peck", forageP: 0.6, wag: 0.2, roam: 1.5, flock: true, likes: /^an_(coop|chicken_|feeder|duck_|bird_|trough|pond)/, shelter: /^an_(coop|chicken_|duck_house)/, pause: [1, 4] },
  hoof: { walk: 0.55, turn: 2.2, stride: 0.9, swing: 0.4, bob: 0.01, gait: "trot", rest: ["lie"], sleeps: true, forage: "graze", forageP: 0.5, wag: 0.4, roam: 3, flock: true, likes: /^an_(barn|stable|trough|hay|feeder)/, shelter: /^an_(barn|stable)/, pause: [4, 10] },
  slow: { walk: 0.1, turn: 1.2, stride: 0.12, swing: 0.5, bob: 0, gait: "trot", rest: ["lie"], sleeps: true, forage: "sniff", forageP: 0.2, wag: 0, roam: 1, likes: /^an_(bowls|feeder)/, shelter: /^an_(hutch)/, pause: [5, 12] },
};

// ---------- deterministic randomness ----------

/** Hash of two integers to [0, 1). */
const h01 = (a: number, b: number) => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** A once-per-`period` event: a smooth 0..1..0 bump of length `dur` that starts at a hashed moment in each cell and fires with probability `p`. */
function bump(t: number, period: number, dur: number, seed: number, p = 1): number {
  const u = t / period;
  const cell = Math.floor(u);
  if (p < 1 && h01(cell, seed + 1) >= p) return 0;
  const k = (u - cell) * period - h01(cell, seed) * (period - dur);
  if (k < 0 || k > dur) return 0;
  const s = Math.sin((Math.PI * k) / dur);
  return s * s;
}

// ---------- the world an animal moves in (item-local metres) ----------

/** An oriented rectangle in the item's local frame: centre, half sizes, cos/sin of its turn. */
export type Box = { x: number; z: number; hx: number; hz: number; c: number; s: number };
/** Spot it likes: centre and clearance radius (it stops this far from the centre). */
export type Spot = { x: number; z: number; r: number };
export type Place = {
  boxes: Box[]; // walls, solid furniture, water: it walks around them
  rooms: Box[]; // when `indoor` it must stay inside one of these; otherwise outside all of them
  indoor: boolean;
  pen?: Box; // a run or paddock it lives in: it stays inside
  spots: Spot[]; // things it likes to be near
  shelters: Spot[]; // where it sleeps
  flock?: { x: number; z: number }; // centre of the homes of its flock mates: it drifts that way
};

const inBox = (b: Box, x: number, z: number, m: number) => {
  const dx = x - b.x;
  const dz = z - b.z;
  return Math.abs(dx * b.c + dz * b.s) <= b.hx + m && Math.abs(-dx * b.s + dz * b.c) <= b.hz + m;
};

/** Can it stand here? Inside the wander circle, its pen, its room, and clear of every box by its own radius `m`. */
export function standable(p: Place, radius: number, m: number, x: number, z: number): boolean {
  if (p.pen) {
    if (!inBox(p.pen, x, z, -m)) return false;
  } else if (x * x + z * z > radius * radius) return false;
  for (const b of p.boxes) if (inBox(b, x, z, m)) return false;
  if (p.indoor) {
    let ok = false;
    for (const b of p.rooms) if (inBox(b, x, z, -m * 0.5)) ok = true;
    if (!ok) return false;
  } else for (const b of p.rooms) if (inBox(b, x, z, m * 0.5)) return false;
  return true;
}

const STEP_CHECK = 0.12;
/** Is the straight line from (ax, az) to (bx, bz) walkable? */
function pathClear(p: Place, radius: number, m: number, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_CHECK));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    if (!standable(p, radius, m, ax + (bx - ax) * k, az + (bz - az) * k)) return false;
  }
  return true;
}

// ---------- state machine ----------

type Mood = "idle" | "walk" | "forage" | "rest" | "sleep";
export type CritterState = {
  x: number;
  z: number; // offset from home, item-local metres
  h: number; // heading, rad about y (0 = facing the item's front)
  mood: Mood;
  left: number; // seconds left in this mood
  tx: number;
  tz: number;
  goSleep: boolean;
  restPose: Pose;
  sit: number;
  lie: number; // displayed pose weights 0..1
  walk: number; // 0..1 how much it is walking (legs, bob)
  phase: number; // gait phase, rad
  rng: number;
  seed: number; // per-animal constant for idle timing
};

export function initState(id: string): CritterState {
  const seed = hashStr(id);
  return { x: 0, z: 0, h: 0, mood: "idle", left: 1 + (seed % 300) / 100, tx: 0, tz: 0, goSleep: false, restPose: "sit", sit: 0, lie: 0, walk: 0, phase: 0, rng: seed ^ 0x5bd1e995, seed: seed & 0xffff };
}

/** Next random number in [0, 1) from the animal's own stream (mulberry32). Mutates the state: the sequence depends only on the id and how many were drawn. */
export function rnd(s: CritterState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const between = (s: CritterState, [a, b]: [number, number]) => a + rnd(s) * (b - a);
const wrapPi = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const damp = (cur: number, want: number, rate: number, dt: number) => cur + (want - cur) * (1 - Math.exp(-rate * dt));

export type Cfg = { b: Behaviour; spec: CritterSpec; radius: number; speed: number; pose: Pose };

/** Choose somewhere to walk: a spot it likes (40%), its flock, or a random place in range. Needs a clear line. Returns false when nothing fits. */
function pickTarget(s: CritterState, c: Cfg, p: Place, toShelter: boolean): boolean {
  const list = toShelter ? p.shelters : p.spots;
  for (let i = 0; i < 8; i++) {
    let tx: number;
    let tz: number;
    if (list.length && (toShelter || rnd(s) < 0.4)) {
      const sp = list[Math.floor(rnd(s) * list.length)];
      const a = Math.atan2(s.x - sp.x, s.z - sp.z) + (rnd(s) - 0.5) * 1.6; // stop on the side it comes from
      const d = sp.r + c.spec.r + 0.15;
      tx = sp.x + Math.sin(a) * d;
      tz = sp.z + Math.cos(a) * d;
    } else {
      const r = c.radius * Math.sqrt(rnd(s));
      const a = rnd(s) * Math.PI * 2;
      tx = Math.sin(a) * r;
      tz = Math.cos(a) * r;
      if (p.pen) {
        tx = p.pen.x + (rnd(s) * 2 - 1) * p.pen.hx;
        tz = p.pen.z + (rnd(s) * 2 - 1) * p.pen.hz;
      }
      if (c.b.flock && p.flock && rnd(s) < 0.6) {
        tx = (tx + p.flock.x * 1.5) / 2.5;
        tz = (tz + p.flock.z * 1.5) / 2.5;
      }
    }
    if (Math.hypot(tx - s.x, tz - s.z) < 0.25) continue;
    if (!standable(p, c.radius, c.spec.r, tx, tz) || !pathClear(p, c.radius, c.spec.r, s.x, s.z, tx, tz)) continue;
    s.tx = tx;
    s.tz = tz;
    s.mood = "walk";
    s.goSleep = toShelter;
    return true;
  }
  return false;
}

/** After idling: walk, forage, settle down or stand around. */
function nextMood(s: CritterState, c: Cfg, p: Place | null) {
  if (p && rnd(s) < 0.5 && pickTarget(s, c, p, false)) return;
  const r = rnd(s);
  if (r < c.b.forageP) {
    s.mood = "forage";
    s.left = between(s, [2.5, 6]);
    return;
  }
  if (p && r < c.b.forageP + 0.25) {
    s.mood = "rest";
    s.restPose = c.b.rest[Math.floor(rnd(s) * c.b.rest.length)];
    s.left = between(s, [6, 18]);
    return;
  }
  s.mood = "idle";
  s.left = between(s, c.b.pause);
}

/**
 * Advance one animal by dt seconds. `p` null = it cannot move (not roaming): it only idles and forages in place and holds its chosen pose.
 * `night` makes a roaming animal walk to its shelter and sleep. Mutates `s`.
 */
export function stepCritter(s: CritterState, c: Cfg, p: Place | null, night: boolean, dt: number): void {
  s.left -= dt;
  const roams = p !== null && c.radius > 0;
  if (roams && c.b.sleeps) {
    if (night && s.mood !== "sleep" && !(s.mood === "walk" && s.goSleep)) {
      if (!(p.shelters.length && pickTarget(s, c, p, true))) {
        s.mood = "sleep";
        s.walk = 0;
      }
    } else if (!night && s.mood === "sleep") {
      s.mood = "idle";
      s.left = 1 + rnd(s) * 2;
    }
  }
  if (s.mood === "walk") {
    if (!roams) s.mood = "idle";
    else walk(s, c, p, dt);
  } else if (s.mood !== "sleep" && s.left <= 0) {
    if (s.mood === "forage" || s.mood === "rest") {
      s.mood = "idle";
      s.left = between(s, c.b.pause);
    } else nextMood(s, c, roams ? p : null);
  }
  s.walk = damp(s.walk, s.mood === "walk" ? 1 : 0, 6, dt);
  if (s.walk < 0.002) s.walk = 0;
  const lieWant = s.mood === "sleep" || (s.mood === "rest" && s.restPose === "lie") || (!roams && c.pose === "lie") ? 1 : 0;
  const sitWant = (s.mood === "rest" && s.restPose === "sit") || (!roams && c.pose === "sit") ? 1 : 0;
  s.sit = damp(s.sit, sitWant, 3.5, dt);
  s.lie = damp(s.lie, lieWant, 3.5, dt);
}

function walk(s: CritterState, c: Cfg, p: Place, dt: number) {
  const dx = s.tx - s.x;
  const dz = s.tz - s.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.08) {
    arrive(s, c);
    return;
  }
  const want = Math.atan2(dx, dz);
  const diff = wrapPi(want - s.h);
  s.h += Math.sign(diff) * Math.min(Math.abs(diff), c.b.turn * dt);
  if (Math.abs(diff) > 0.6) return; // turn on the spot before setting off
  const step = Math.min(dist, c.b.walk * c.speed * dt * (c.spec.kind === "hop" ? 0.6 + 0.8 * Math.abs(Math.sin(s.phase / 2)) : 1));
  const nx = s.x + Math.sin(s.h) * step;
  const nz = s.z + Math.cos(s.h) * step;
  if (!standable(p, c.radius, c.spec.r, nx, nz) && standable(p, c.radius, c.spec.r, s.x, s.z)) {
    s.mood = "idle"; // something moved into its way: stop and think again
    s.left = 0.5 + rnd(s);
    return;
  }
  s.x = nx;
  s.z = nz;
  s.phase = (s.phase + (step / c.b.stride) * Math.PI * 2) % (Math.PI * 4);
}

function arrive(s: CritterState, c: Cfg) {
  if (s.goSleep) {
    s.mood = "sleep";
    return;
  }
  s.goSleep = false;
  if (rnd(s) < 0.5 && c.b.rest.length) {
    s.mood = "rest";
    s.restPose = c.b.rest[Math.floor(rnd(s) * c.b.rest.length)];
    s.left = between(s, [6, 16]);
  } else {
    s.mood = "idle";
    s.left = between(s, c.b.pause);
  }
}

// ---------- pose and idle animation ----------

/** Layout of the array `animate` fills: 8 body numbers, then rx, ry, rz, sy per bone. */
export const BODY_N = 8;
export const BONE_N = 4;
/** Number of floats `animate` writes for a spec. */
export const outSize = (spec: CritterSpec) => BODY_N + BONE_N * spec.bones.length;
// body slots
export const O_RX = 0; // pose tilt about x
export const O_Y = 1; // pose lift (negative = sunk)
export const O_Z = 2; // pose shift along z that keeps the tilt pivot on the hip
export const O_BOB = 3;
export const O_ROLL = 4;
export const O_BREATH = 5; // body scale y
export const O_PITCH = 6; // extra nose up/down while moving
const O_SPARE = 7;

/** Leg angle and length scale for a pose weight pair. */
function legPose(spec: CritterSpec, bone: Bone, sit: number, lie: number): [number, number] {
  const front = bone.role === "legFL" || bone.role === "legFR";
  const [hy, hz] = spec.hip;
  const y0 = bone.pivot[1];
  const z0 = bone.pivot[2];
  const th = spec.sitPitch;
  let rx = 0;
  let sy = 1;
  if (sit > 0) {
    if (spec.sitPitch > 0) {
      if (front) {
        const y1 = hy + (y0 - hy) * Math.cos(th) + (z0 - hz) * Math.sin(th) - spec.sitDrop;
        rx += th * sit;
        sy += (clamp(y1 / y0, 0.5, 1.7) - 1) * sit;
      } else {
        rx += (-1.25 + th) * sit;
        sy += (0.55 - 1) * sit;
      }
    } else sy += (0.12 - 1) * sit; // birds and hooved animals fold their legs away
  }
  if (lie > 0) {
    const l = 0.55;
    const y1 = y0 - spec.lieDrop;
    const a = Math.acos(clamp(y1 / (y0 * l), 0, 1));
    rx += (front ? -a : a) * lie;
    sy += (l - 1) * lie;
  }
  return [rx, sy];
}

/** Body slots: tilt about the hip, gait bob / roll / pitch, breathing. Allocation-free. */
function bodySlots(spec: CritterSpec, b: Behaviour, s: CritterState, out: Float32Array | number[], calm: boolean, tt: number, ph: number, walkK: number, asleep: boolean) {
  const th = spec.sitPitch * s.sit;
  const [hy, hz] = spec.hip;
  // tilt about the hip: rotation by -th about x, so the front rises
  const ca = Math.cos(-th);
  const sa = Math.sin(-th);
  out[O_RX] = -th;
  out[O_Y] = hy - (hy * ca - hz * sa) - spec.sitDrop * s.sit - spec.lieDrop * s.lie;
  out[O_Z] = hz - (hy * sa + hz * ca);
  const gaitS = Math.sin(s.phase);
  out[O_BOB] = walkK * (b.gait === "hop" ? b.bob * Math.max(0, gaitS) : b.bob * Math.abs(gaitS));
  out[O_ROLL] = walkK * (b.gait === "strut" ? 0.05 * gaitS : 0);
  out[O_PITCH] = walkK * (b.gait === "hop" ? 0.25 * Math.cos(s.phase) : 0);
  out[O_BREATH] = calm ? 1 : 1 + (asleep ? 0.02 : 0.012) * Math.sin(tt * (asleep ? 1.3 : 2.2) + ph);
  out[O_SPARE] = 0;
}

/** Head tilt shared by every head: dip to sniff / graze / peck while foraging, bob when strutting, nod off when asleep, stay up while the body tilts. */
function headTilt(spec: CritterSpec, b: Behaviour, s: CritterState, calm: boolean, tt: number, ph: number, walkK: number, foraging: boolean, asleep: boolean): number {
  let headRx = 0;
  if (foraging) {
    if (b.forage === "peck") headRx = 0.95 * Math.pow(0.5 + 0.5 * Math.sin(tt * 13 + ph), 2);
    else if (b.forage === "graze") headRx = 0.95;
    else headRx = 0.65 + 0.1 * Math.sin(tt * 7 + ph);
  } else if (!calm && b.gait === "strut") headRx = 0.18 * walkK * Math.sin(s.phase * 2);
  if (asleep) headRx = 0.5;
  if (spec.sitPitch > 0) headRx += spec.sitPitch * s.sit * 0.9; // keep the head up while the body tilts
  return headRx;
}

/** Tail sway about the vertical axis (every tail but a hoofed animal's hanging one). */
function tailYaw(spec: CritterSpec, b: Behaviour, s: CritterState, tt: number, ph: number, walkK: number, asleep: boolean, excited: number): number {
  if (b.gait === "strut") return 0.15 * Math.sin(tt * 1.1 + ph) + 0.1 * walkK * Math.sin(s.phase);
  if (spec.kind === "cat") return 0.35 * Math.sin(tt * 1.3 + ph) * (asleep ? 0.2 : 1);
  return b.wag * (asleep ? 0.05 : excited) * 0.7 * Math.sin(tt * 9 + ph) + 0.15 * walkK * Math.sin(s.phase);
}

/** Extra leg swing while walking: diagonal pairs when it has four legs, opposite sides for two, a bounding spring for hoppers. */
function legSwing(spec: CritterSpec, b: Behaviour, bone: Bone, s: CritterState, walkK: number): number {
  const front = bone.role === "legFL" || bone.role === "legFR";
  const left = bone.role === "legFL" || bone.role === "legBL";
  let a: number;
  if (b.gait === "hop") a = front ? 0.9 * Math.sin(s.phase + 0.5) : -1.1 * Math.sin(s.phase);
  else if (spec.bones.some((x) => x.role === "legBL")) a = Math.sin(s.phase + (front === left ? 0 : Math.PI)); // trot: diagonal pairs
  else a = Math.sin(s.phase + (left ? 0 : Math.PI));
  return walkK * b.swing * a * (1 - s.sit - s.lie);
}

/**
 * Write the pose and idle animation of an animal into `out` (see the O_* slots, then 4 numbers per bone). `calm` = reduced motion:
 * only the pose, no movement. Allocation-free.
 */
export function animate(spec: CritterSpec, c: Cfg, s: CritterState, t: number, out: Float32Array | number[], calm: boolean): void {
  const b = c.b;
  const sit = s.sit;
  const lie = s.lie;
  const asleep = s.mood === "sleep";
  const ph = s.seed * 0.0137;
  const tt = t + s.seed * 0.01;
  const walkK = calm ? 0 : s.walk;
  bodySlots(spec, b, s, out, calm, tt, ph, walkK, asleep);
  const foraging = s.mood === "forage" && !calm;
  const idleish = !calm && s.mood !== "walk" && !asleep;
  // head: look around while idle, dip to sniff / graze / peck while foraging, bob when walking
  const look = idleish ? (0.5 * Math.sin(tt * 0.37 + ph) + 0.2 * Math.sin(tt * 0.91 + ph * 2)) * (1 - 0.7 * (sit + lie)) : 0;
  const headRx = headTilt(spec, b, s, calm, tt, ph, walkK, foraging, asleep);
  const flickL = calm ? 0 : bump(tt, 7, 0.35, s.seed, 0.8);
  const flickR = calm ? 0 : bump(tt, 8, 0.35, s.seed + 7, 0.8);
  const blink = calm ? 0 : asleep ? 1 : bump(tt, 4.2, 0.22, s.seed + 3);
  const excited = 0.35 + 0.65 * bump(tt, 11, 6, s.seed + 5, 0.7);
  const flap = calm || b.gait !== "strut" || s.mood === "walk" ? 0 : bump(tt, 40, 1.1, s.seed + 9, 0.5);
  for (let i = 0; i < spec.bones.length; i++) {
    const bone = spec.bones[i];
    const o = BODY_N + i * BONE_N;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let sy = 1;
    switch (bone.role) {
      case "head": {
        const k = i * 1.9; // a group of chicks has several heads: each on its own beat
        rx = foraging && b.forage === "peck" ? 0.95 * Math.pow(0.5 + 0.5 * Math.sin(tt * 13 + ph + k), 2) : headRx;
        ry = look * Math.cos(k);
        break;
      }
      case "tail":
        if (!calm) {
          // a hanging tail swishes about its root, not about the vertical
          if (spec.kind === "hoof" && b.gait !== "strut") rz = 0.45 * Math.sin(tt * 2 + ph) * bump(tt, 9, 4, s.seed + 11, 0.8);
          else ry = tailYaw(spec, b, s, tt, ph, walkK, asleep, excited);
        }
        rx = sit * 0.25;
        break;
      case "earL":
        rz = 0.35 * flickL;
        break;
      case "earR":
        rz = -0.35 * flickR;
        break;
      case "eyes":
        sy = 1 - 0.9 * blink;
        break;
      case "wingL":
        rz = flap * 0.9 * Math.sin(tt * 30) + (asleep ? 0 : 0.04 * Math.sin(tt * 1.7 + ph));
        break;
      case "wingR":
        rz = -flap * 0.9 * Math.sin(tt * 30) - (asleep ? 0 : 0.04 * Math.sin(tt * 1.7 + ph));
        break;
      default: {
        // a leg
        const [pr, ps] = legPose(spec, bone, sit, lie);
        rx = pr;
        sy = ps;
        if (walkK > 0) rx += legSwing(spec, b, bone, s, walkK);
      }
    }
    out[o] = rx;
    out[o + 1] = ry;
    out[o + 2] = rz;
    out[o + 3] = sy;
  }
}
