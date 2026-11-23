"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, DoubleSide, InstancedMesh, MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace } from "three";
import { keepAlive } from "@/lib/framePacer";
import { useKnobs } from "@/lib/quality";
import { live } from "../skyLive";
import { clamp } from "@/lib/mathUtil";

const KINDS = 4; // maple, oak, birch, elm: one instanced mesh each
const PER_KIND = 16;
const AREA = 28; // metres across the drifting volume (as the petals)
const HEIGHT = 7;
const FALL_SPEED = 0.07; // share of the height per second
const SIZE_MIN = 0.32;
const SIZE_MAX = 0.52;
const TEX = 128;
const wrap = (v: number) => v - Math.floor(v);

/** Outline of each leaf as [x in -1..1, y in 0..1] pairs from the stalk (0) to the tip (1), one side; mirrored when drawn. */
const half = (n: number, width: (y: number) => number): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [width(i / n), i / n]);
const OUTLINES: [number, number][][] = [
  // maple: five pointed lobes
  [[0, 0], [0.07, 0.14], [0.55, 0.08], [0.36, 0.36], [0.95, 0.46], [0.55, 0.58], [0.62, 0.86], [0.28, 0.74], [0, 1]],
  // oak: rounded lobes along a long oval
  half(44, (y) => 0.5 * Math.sin(Math.PI * Math.pow(y, 0.85)) * (1 + 0.28 * Math.cos(y * 5.5 * Math.PI))),
  // birch: ovate with a pointed tip and fine teeth
  half(48, (y) => 0.62 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.72)), 0.9) * (1 - 0.15 * y) * (1 + 0.045 * Math.sin(y * 70))),
  // elm / willow: long and slim
  half(30, (y) => 0.36 * Math.pow(Math.sin(Math.PI * y), 0.8)),
];

/** One leaf drawn white-grey with darker veins, so the instance colour tints it. Transparent outside the leaf (alpha-tested, so no sorting). */
function leafTexture(kind: number): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = TEX;
  const g = cv.getContext("2d")!;
  const px = (x: number, y: number): [number, number] => [TEX / 2 + x * TEX * 0.46, TEX * 0.9 - y * TEX * 0.82];
  const outline = OUTLINES[kind];
  g.beginPath();
  outline.forEach(([x, y], i) => (i ? g.lineTo(...px(x, y)) : g.moveTo(...px(x, y))));
  [...outline].reverse().forEach(([x, y]) => g.lineTo(...px(-x, y)));
  g.closePath();
  const fill = g.createLinearGradient(0, TEX * 0.1, 0, TEX * 0.9);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(1, "#cfcfcf");
  g.fillStyle = fill;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(60,40,20,0.5)";
  g.lineCap = "round";
  // midrib, then side veins branching toward the lobes
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(...px(0, -0.08));
  g.lineTo(...px(0, 0.96));
  g.stroke();
  g.lineWidth = 1.3;
  const veins = kind === 0 ? [[0.14, 0.55, 0.12], [0.16, 0.95, 0.46], [0.5, 0.6, 0.78]] : Array.from({ length: 6 }, (_, i) => [0.1 + i * 0.13, 0.5, 0.2 + i * 0.13]);
  for (const [y0, x1, y1] of veins) for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(...px(0, y0));
    g.lineTo(...px(s * x1 * (kind === 0 ? 1 : 0.8), y1 + 0.05));
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "#e8e8e8"; // the stalk
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(...px(0, 0));
  g.lineTo(...px(0.02, -0.1));
  g.stroke();
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type Props = {
  /** 0..1 how much of the garden's current look is autumn (leaves fade in and out with it). */
  amount: number;
  colors: Color[];
  /** Room footprints [x0, z0, x1, z1]: nothing falls through a roof. */
  rooms: number[][];
  cx: number;
  cz: number;
};

/**
 * Autumn leaves that look like leaves: maple, oak, birch and elm shapes with veins, tumbling and fluttering as they sink and drift on the wind.
 * Four instanced meshes (one draw call each), alpha-tested so they need no sorting. A leaf is hidden by shrinking it to nothing.
 */
export default function FallingLeaves({ amount, colors, rooms, cx, cz }: Props) {
  const { ambient } = useKnobs();
  const geo = useMemo(() => new PlaneGeometry(1, 1), []);
  const textures = useMemo(() => Array.from({ length: KINDS }, (_, k) => leafTexture(k)), []);
  const mats = useMemo(
    () => textures.map((map) => new MeshLambertMaterial({ map, alphaTest: 0.5, side: DoubleSide, emissive: new Color("#2a1a0a"), emissiveMap: map })),
    [textures],
  );
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const dummy = useMemo(() => new Object3D(), []);
  const seed = useMemo(() => {
    let a = 31337;
    const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
    return Float32Array.from({ length: KINDS * PER_KIND * 6 }, r);
  }, []);
  const state = useRef({ amount, rooms, cx, cz });
  state.current = { amount, rooms, cx, cz };

  // each leaf's colour: a palette colour, lightened or darkened a little so no two are the same
  useEffect(() => {
    const c = new Color();
    meshes.current.forEach((m, k) => {
      if (!m || !colors.length) return;
      for (let j = 0; j < PER_KIND; j++) {
        const o = (k * PER_KIND + j) * 6;
        c.copy(colors[(seed[o + 3] * colors.length) | 0]).multiplyScalar(0.72 + seed[o + 4] * 0.5);
        m.setColorAt(j, c);
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }, [colors, seed]);
  useEffect(() => () => { geo.dispose(); mats.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); }, [geo, mats, textures]);

  useFrame(({ clock }) => {
    if (!ambient) return;
    const { amount: a, rooms: rs, cx: x0, cz: z0 } = state.current;
    const t = clock.elapsedTime;
    const wind = 0.15 + live.windX * live.wind * 0.12;
    for (let k = 0; k < KINDS; k++) {
      const m = meshes.current[k];
      if (!m) continue;
      m.visible = a > 0.001;
      if (!m.visible) continue;
      keepAlive();
      for (let j = 0; j < PER_KIND; j++) {
        const o = (k * PER_KIND + j) * 6;
        const s0 = seed[o], s1 = seed[o + 1], s2 = seed[o + 2], s3 = seed[o + 3], s4 = seed[o + 4], s5 = seed[o + 5];
        const share = clamp((a - 0.85 * (j / PER_KIND)) / 0.15, 0, 1);
        const y = HEIGHT * (1 - wrap(s1 + t * FALL_SPEED * (0.8 + s5 * 0.5)));
        const x = x0 + (wrap(s0 + (t * wind) / AREA) - 0.5) * AREA + Math.sin(t * 0.9 + s3 * 6.3) * 0.9;
        const z = z0 + (s2 - 0.5) * AREA + Math.cos(t * 0.6 + s3 * 4.1) * 0.6;
        const roofed = y < 2.8 && rs.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
        const size = (SIZE_MIN + s5 * (SIZE_MAX - SIZE_MIN)) * (roofed ? 0 : share);
        dummy.position.set(x, y, z);
        // lying flat, then tumbling: a slow spin, a rocking tilt and a roll, each on the leaf's own rhythm
        dummy.rotation.set(-Math.PI / 2 + 0.9 * Math.sin(t * (1.1 + s5) + s3 * 9), t * (0.5 + s4 * 1.3) + s0 * 6.3, 0.6 * Math.sin(t * (0.8 + s2) + s1 * 7), "YXZ");
        dummy.scale.setScalar(Math.max(size, 0.0001));
        dummy.updateMatrix();
        m.setMatrixAt(j, dummy.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  });

  if (!ambient) return null;
  return (
    <group>
      {textures.map((_, k) => (
        <instancedMesh key={k} ref={(m) => void (meshes.current[k] = m)} args={[geo, mats[k], PER_KIND]} frustumCulled={false} visible={false} raycast={() => null} />
      ))}
    </group>
  );
}
