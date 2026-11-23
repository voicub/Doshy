"use client";
import { useFrame } from "@react-three/fiber";
import { keepAlive } from "@/lib/framePacer";
import { useEffect, useMemo, useRef } from "react";
import { Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { fireworksOn } from "@/lib/season";
import { live } from "../../skyLive";
import type { Anchors } from "../anchors";
import Sparks, { type SparkStep } from "../Sparks";
import { clamp } from "@/lib/mathUtil";

const wrap = (v: number) => v - Math.floor(v);
const noRaycast = () => null;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Plan rectangles of the rooms, to keep falling confetti and rising hearts out of the roofed interior. */
type Rooms = number[][];
const roofed = (rooms: Rooms, x: number, y: number, z: number) => y < 2.8 && rooms.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);

// ---------------------------------------------------------------- hearts (valentine)

const HEARTS = 26;

/** Pink hearts rising off the balcony (or the middle of the flat when there is none), swaying as they climb and fading out. */
export function Hearts({ a, fade }: { a: Anchors; fade: number }) {
  const seed = useMemo(() => Float32Array.from({ length: HEARTS * 4 }, rng(14)), []);
  const r = a.balcony ?? { x: (a.bounds.x0 + a.bounds.x1) / 2 - 1, y: (a.bounds.y0 + a.bounds.y1) / 2 - 1, w: 2, h: 2 };
  const step = useMemo<SparkStep>(
    () => (b, t) => {
      for (let i = 0; i < HEARTS; i++) {
        const o = i * 4, life = wrap(seed[o + 3] + t * 0.09);
        b.pos[i * 3] = r.x + seed[o] * r.w + Math.sin(t * 0.9 + seed[o + 1] * 20) * 0.25;
        b.pos[i * 3 + 1] = 1.1 + life * 3.4;
        b.pos[i * 3 + 2] = r.y + seed[o + 2] * r.h + Math.cos(t * 0.7 + seed[o] * 15) * 0.2;
        const pink = seed[o + 1] > 0.5;
        b.col[i * 4] = pink ? 1.9 : 2.1;
        b.col[i * 4 + 1] = pink ? 0.4 : 0.15;
        b.col[i * 4 + 2] = pink ? 0.7 : 0.35;
        b.col[i * 4 + 3] = Math.sin(Math.PI * life) * 0.95 * fade;
        b.size[i] = 0.2 + 0.18 * seed[o + 1];
      }
    },
    [seed, r.x, r.y, r.w, r.h, fade],
  );
  return <Sparks count={HEARTS} step={step} shape="heart" minPx={5} always />;
}

// ---------------------------------------------------------------- new year

const BURSTS = 4;
const PER = 64;
const CYCLE = 3.6;
const RISE = 0.9;
const LIFE = 2.3;
const SPARK_COLORS = ["#ffc040", "#ff4060", "#50a0ff", "#60ff90", "#ff60e0", "#ffffff"].map((h) => new Color(h));

/** Fibonacci sphere directions, one per spark of a burst. */
const DIRS = Array.from({ length: PER }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / PER, r = Math.sqrt(1 - y * y), a = i * 2.399963;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});

/**
 * Coloured firework bursts over the flat, looping every few seconds. They run around local midnight of 31 December
 * (20 minutes either side) or whenever the holiday is forced from the menu.
 */
export function Fireworks({ a, forced, fade }: { a: Anchors; forced: boolean; fade: number }) {
  const intensity = useRef({ v: forced ? 1 : fireworksOn(new Date()), checked: 0 });
  const cx = (a.bounds.x0 + a.bounds.x1) / 2, cz = (a.bounds.y0 + a.bounds.y1) / 2, reach = Math.max(a.bounds.x1 - a.bounds.x0, a.bounds.y1 - a.bounds.y0) / 2 + 4;
  const step = useMemo<SparkStep>(
    () => (b, t) => {
      const st = intensity.current;
      if (t - st.checked > 1) {
        st.checked = t;
        st.v = forced ? 1 : fireworksOn(new Date());
      }
      for (let e = 0; e < BURSTS; e++) {
        const local = t + e * (CYCLE / BURSTS), cycle = Math.floor(local / CYCLE), u = local - cycle * CYCLE;
        const r = rng(cycle * 31 + e * 977 + 5);
        const launch = [cx + (r() - 0.5) * reach * 1.6, cz + (r() - 0.5) * reach * 1.6], top = 4.5 + r() * 2.5;
        const c0 = SPARK_COLORS[(r() * SPARK_COLORS.length) | 0], c1 = SPARK_COLORS[(r() * SPARK_COLORS.length) | 0];
        const speed = 2 + r() * 0.9;
        for (let k = 0; k < PER; k++) {
          const i = e * PER + k;
          let x: number, y: number, z: number, alpha: number, size = 0.2;
          if (u < RISE) {
            // the rocket climbs; only a short trail of sparks shows
            const f = u / RISE, trail = k < 6 ? f - k * 0.03 : -1;
            x = launch[0];
            z = launch[1];
            y = 1 + clamp(trail, 0, 1) * (top - 1);
            alpha = trail > 0 ? 0.9 * (1 - k / 6) : 0;
            size = 0.12;
          } else {
            const s = u - RISE, drag = (1 - Math.exp(-1.5 * s)) / 1.5;
            x = launch[0] + DIRS[k][0] * speed * drag;
            z = launch[1] + DIRS[k][2] * speed * drag;
            y = top + DIRS[k][1] * speed * drag - 0.5 * 1.4 * s * s;
            alpha = Math.pow(clamp(1 - s / LIFE, 0, 1), 1.4) * (0.75 + 0.25 * Math.sin(t * 25 + k * 3));
          }
          const c = k % 3 === 0 ? c1 : c0;
          b.pos[i * 3] = x;
          b.pos[i * 3 + 1] = y;
          b.pos[i * 3 + 2] = z;
          b.col[i * 4] = c.r * 3;
          b.col[i * 4 + 1] = c.g * 3;
          b.col[i * 4 + 2] = c.b * 3;
          b.col[i * 4 + 3] = alpha * st.v * fade;
          b.size[i] = size;
        }
      }
    },
    [forced, fade, cx, cz, reach],
  );
  return <Sparks count={BURSTS * PER} step={step} shape="dot" additive minPx={2} always />;
}

const CONFETTI = 110;
const CONFETTI_COLORS = ["#ff4b6e", "#ffd23a", "#3ac4ff", "#6dff9a", "#c27aff", "#ffffff"].map((h) => new Color(h));

/** Tiny paper confetti drifting down over the flat, tumbling on the breeze. */
export function Confetti({ a, rooms, fade }: { a: Anchors; rooms: Rooms; fade: number }) {
  const seed = useMemo(() => Float32Array.from({ length: CONFETTI * 4 }, rng(2027)), []);
  const cx = (a.bounds.x0 + a.bounds.x1) / 2, cz = (a.bounds.y0 + a.bounds.y1) / 2, area = Math.max(a.bounds.x1 - a.bounds.x0, a.bounds.y1 - a.bounds.y0) + 10;
  const step = useMemo<SparkStep>(
    () => (b, t) => {
      for (let i = 0; i < CONFETTI; i++) {
        const o = i * 4, y = 7 * (1 - wrap(seed[o + 1] + t * 0.05));
        const x = cx + (wrap(seed[o] + t * 0.004) - 0.5) * area + Math.sin(t * 1.3 + seed[o + 3] * 30) * 0.4;
        const z = cz + (seed[o + 2] - 0.5) * area + Math.cos(t * 1.1 + seed[o + 3] * 20) * 0.4;
        const c = CONFETTI_COLORS[(seed[o + 3] * CONFETTI_COLORS.length) | 0];
        b.pos[i * 3] = x;
        b.pos[i * 3 + 1] = y;
        b.pos[i * 3 + 2] = z;
        b.col[i * 4] = c.r;
        b.col[i * 4 + 1] = c.g;
        b.col[i * 4 + 2] = c.b;
        b.col[i * 4 + 3] = roofed(rooms, x, y, z) ? 0 : 0.85 * fade * (0.55 + 0.45 * Math.abs(Math.sin(t * 3 + seed[o + 3] * 40))); // the flutter flashes each piece
        b.size[i] = 0.07;
      }
    },
    [seed, cx, cz, area, rooms, fade],
  );
  return <Sparks count={CONFETTI} step={step} shape="square" always />;
}

// ---------------------------------------------------------------- bats (halloween)

const BATS = 5;
const BAT_COLOR = new Color("#4a3a66");

/** A few bats circling above the flat at night: a body and two flapping wings each, one instanced mesh, gone by day. */
export function Bats({ a, fade, reduced }: { a: Anchors; fade: number; reduced: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const cx = (a.bounds.x0 + a.bounds.x1) / 2, cz = (a.bounds.y0 + a.bounds.y1) / 2, reach = Math.max(a.bounds.x1 - a.bounds.x0, a.bounds.y1 - a.bounds.y0) / 2;
  const seed = useMemo(() => Float32Array.from({ length: BATS * 4 }, rng(31)), []);
  const tmp = useMemo(() => ({ bat: new Matrix4(), part: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(), qf: new Quaternion() }), []);
  useEffect(() => {
    for (let i = 0; i < BATS * 3; i++) mesh.current?.setColorAt(i, BAT_COLOR);
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const { bat, part, q, e, p, s, qf } = tmp;
    const night = clamp((1 - live.daylight - 0.25) / 0.3, 0, 1) * fade; // shown only in the dark
    const t = reduced ? 0 : clock.elapsedTime;
    for (let i = 0; i < BATS; i++) {
      const o = i * 4, rad = reach + 2 + seed[o] * 5, speed = (0.12 + seed[o + 1] * 0.1) * (i % 2 ? 1 : -1), ang = seed[o + 2] * 6.28 + t * speed;
      p.set(cx + Math.cos(ang) * rad, 4 + seed[o + 3] * 3 + Math.sin(t * 0.8 + i) * 0.4, cz + Math.sin(ang) * rad);
      q.setFromEuler(e.set(0, -ang + (speed > 0 ? 0 : Math.PI), 0));
      bat.compose(p, q, s.set(night, night, night));
      const flap = Math.sin(t * 11 + i * 2) * 0.7;
      const parts: [number, number, number, number, number, number][] = [[0, 0, 0, 0.09, 0.05, 0.16], [-0.2, 0, 0, 0.3, 0.015, 0.1], [0.2, 0, 0, 0.3, 0.015, 0.1]];
      parts.forEach(([x, y, z, sx, sy, sz], k) => {
        const side = k === 0 ? 0 : k === 1 ? 1 : -1;
        qf.setFromEuler(e.set(0, 0, side * flap));
        part.compose(p.set(x, y, z), qf, s.set(sx, sy, sz));
        m.setMatrixAt(i * 3 + k, part.premultiply(bat));
      });
    }
    m.instanceMatrix.needsUpdate = true;
    m.visible = night > 0.01;
    if (m.visible && !reduced) keepAlive(false);
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, BATS * 3]} frustumCulled={false} raycast={noRaycast} visible={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
