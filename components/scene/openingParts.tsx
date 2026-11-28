"use client";
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { ExtrudeGeometry, MeshPhysicalMaterial, MeshStandardMaterial, Path, Shape, type Group } from "three";
import { FRAME_DARK, FRAME_LIGHT, GLASS_TINTS } from "@/lib/openings";
import { useKnobs } from "@/lib/quality";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GlassTint, Opening } from "@/lib/types";
import { live } from "./skyLive";

export { FRAME_DARK };
export const FRAME = FRAME_LIGHT;
export const STONE = "#b9b2a6";
export const WOOD = "#8a6a4a";
export const BAR = 0.05;
export const AJAR = (35 * Math.PI) / 180; // a hinged door with no sensor stands slightly ajar
export const WINDOW_OPEN = (70 * Math.PI) / 180;
export const DOOR_OPEN = (90 * Math.PI) / 180;
const GLOW_MAX = 2.4; // >1 so bloom picks lit glass up

export type Ref = MutableRefObject<number>;

/** What every style renderer receives. Local frame: x along the wall (centre of the opening = 0), y up from the floor, +z = `inward` side of the wall is the room when inward = 1. */
export type StyleProps = {
  o: Opening;
  cutaway: boolean;
  /** 0..1 lamplight in the house: lit glass glows. */
  glow: Ref;
  /** Wall thickness (m). */
  thick: number;
  /** 0..1, how far the linked contact sensor / cover is open (damped). Meaningful only when `known`. */
  amount: Ref;
  /** The opening is linked to an entity whose state is loaded: follow `amount`; otherwise hinged leaves stand ajar and everything else rests closed. */
  known: boolean;
  /** Hinge end `h` (-1 start, +1 end) and side `n` (+1 / -1 local z) a leaf swings toward. */
  sw: { h: -1 | 1; n: -1 | 1 };
  /** +1 when local +z faces into a room, -1 when -z does. A bay window sticks out the other way. */
  inward: 1 | -1;
  /** Colour of the surrounding wall, for infill pieces (arch corners). */
  wallTint: string;
};

const barMats = new Map<string, MeshStandardMaterial>();
/** Painted frame material, shared by colour; slightly satin (lower roughness) when the quality tier draws material detail. */
export const barMat = (color: string, satin = false) => {
  const key = satin ? `${color}|s` : color;
  let m = barMats.get(key);
  if (!m) barMats.set(key, (m = new MeshStandardMaterial({ color, roughness: satin ? 0.42 : 0.6 })));
  return m;
};

/** A frame bar. With bevel segments in the quality tier its edges are rounded (the thinnest side decides how much), like a real planed profile. */
export function Bar({ p, s, color = FRAME }: { p: [number, number, number]; s: [number, number, number]; color?: string }) {
  const k = useKnobs();
  const seg = Math.max(0, k.bevelSegments - 1) || (k.bevelSegments > 0 ? 1 : 0);
  const geo = useMemo(() => (seg > 0 ? new RoundedBoxGeometry(s[0], s[1], s[2], seg, Math.min(0.006, Math.min(s[0], s[1], s[2]) * 0.3)) : null), [s[0], s[1], s[2], seg]); // keyed by the size values, not the array s
  useEffect(() => () => geo?.dispose(), [geo]);
  return (
    <mesh position={p} castShadow material={barMat(color, k.textures > 0)}>
      {geo ? <primitive object={geo} attach="geometry" /> : <boxGeometry args={s} />}
    </mesh>
  );
}

/** Glass of a window or glazed door: tinted, reflective, glows when the house lights are on, denser in rain. */
export function useGlass(tint: GlassTint | undefined, glow?: Ref): MeshPhysicalMaterial {
  const look = GLASS_TINTS[tint ?? "clear"];
  const glass = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: look.color,
        transparent: true,
        opacity: look.opacity,
        depthWrite: false,
        roughness: tint === "frosted" ? 0.5 : 0.05,
        metalness: 0.1,
        reflectivity: 0.6,
        emissive: "#ffcf8a",
        emissiveIntensity: 0,
        toneMapped: false,
        side: 2,
      }),
    [look, tint],
  );
  useEffect(() => () => glass.dispose(), [glass]);
  useFrame(() => {
    const g = glow ? glow.current : 0;
    if (Math.abs(glass.emissiveIntensity - g * GLOW_MAX) > 0.005) glass.emissiveIntensity = g * GLOW_MAX;
    const op = look.opacity + 0.16 * live.wet; // wet panes read denser
    if (Math.abs(glass.opacity - op) > 0.003) glass.opacity = op;
  });
  return glass;
}

/** One hinged leaf. Hinge at local x = `x`; `hinge` -1 = hinged on its left edge, +1 = right. Swings into the room by `max` radians as `amount` goes 0 -> 1. */
export function Leaf({
  x,
  hinge,
  width,
  y0,
  height,
  max,
  rest = 0,
  amount,
  known,
  inward,
  material,
  frame,
  muntins,
}: {
  x: number;
  hinge: 1 | -1;
  width: number;
  y0: number;
  height: number;
  max: number;
  rest?: number; // fixed angle when there is no sensor to follow
  amount: Ref;
  known: boolean;
  inward: 1 | -1;
  material?: MeshPhysicalMaterial;
  frame?: string; // sash frame colour; omitted for a plain glass leaf
  muntins?: [number, number]; // [columns, rows] of small panes: thin bars across the glass
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const a = known ? amount.current * max : rest;
    const r = hinge * inward * a;
    if (g.rotation.y !== r) g.rotation.y = r;
  });
  const cy = y0 + height / 2;
  const mid = -hinge * (width / 2);
  const T = 0.03;
  return (
    <group ref={ref} position={[x, 0, 0]}>
      <mesh position={[mid, cy, 0]} material={material}>
        <planeGeometry args={[width, Math.max(0.01, height)]} />
      </mesh>
      {frame && (
        <>
          <Bar p={[mid, y0 + T / 2, 0]} s={[width, T, 0.05]} color={frame} />
          <Bar p={[mid, y0 + height - T / 2, 0]} s={[width, T, 0.05]} color={frame} />
          <Bar p={[mid - (width - T) / 2, cy, 0]} s={[T, height, 0.05]} color={frame} />
          <Bar p={[mid + (width - T) / 2, cy, 0]} s={[T, height, 0.05]} color={frame} />
          {muntins &&
            Array.from({ length: muntins[0] - 1 }, (_, i) => (
              <Bar key={`c${i}`} p={[mid - width / 2 + (width * (i + 1)) / muntins[0], cy, 0]} s={[0.015, height - T, 0.03]} color={frame} />
            ))}
          {muntins &&
            Array.from({ length: muntins[1] - 1 }, (_, i) => (
              <Bar key={`r${i}`} p={[mid, y0 + (height * (i + 1)) / muntins[1], 0]} s={[width - T, 0.015, 0.03]} color={frame} />
            ))}
        </>
      )}
    </group>
  );
}

/** Slides its children sideways by `travel` metres as the opening opens; stays put with no sensor. */
export function Slide({ x = 0, z = 0, travel, amount, known, children }: { x?: number; z?: number; travel: number; amount: Ref; known: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const px = x + (known ? amount.current : 0) * travel;
    if (g.position.x !== px) g.position.x = px;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      {children}
    </group>
  );
}

/** Rise (m) of the round top of an arched opening `w` wide and `h` tall: a half circle, flatter when the opening is short. */
export const archRise = (w: number, h: number) => Math.min(w / 2, h * 0.5);

/** An arch-shaped ring: `t` wide trim around a half ellipse (`rx`, `ry`) sitting on y = 0, `depth` deep. Centred on z = 0. */
export function ArchRing({ rx, ry, t, depth, color = FRAME, position }: { rx: number; ry: number; t: number; depth: number; color?: string; position: [number, number, number] }) {
  const geo = useMemo(() => {
    const s = new Shape();
    s.moveTo(-rx, 0);
    s.absellipse(0, 0, rx, ry, Math.PI, 0, true);
    s.lineTo(rx - t, 0);
    s.absellipse(0, 0, Math.max(0.01, rx - t), Math.max(0.01, ry - t), 0, Math.PI, false);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [rx, ry, t, depth]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh position={position} geometry={geo} material={barMat(color)} castShadow />;
}

/**
 * Wall infill around a rounded opening, because the wall is cut as a plain rectangle. `arch`: the two top corners above a half ellipse whose
 * springing line is `y0 + h - rise`; `round`: the whole rectangle minus a circle. Flat wall colour (ponytail: not the wall's texture).
 */
export function Spandrels({ kind, w, h, y0, thick, tint }: { kind: "arch" | "round"; w: number; h: number; y0: number; thick: number; tint: string }) {
  const geos = useMemo(() => {
    const rx = w / 2;
    const make = (s: Shape) => {
      const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 24 });
      g.translate(0, 0, -thick / 2);
      return g;
    };
    if (kind === "round") {
      const s = new Shape();
      s.moveTo(-rx, -h / 2);
      s.lineTo(rx, -h / 2);
      s.lineTo(rx, h / 2);
      s.lineTo(-rx, h / 2);
      s.closePath();
      const r = (Math.min(w, h) / 2) * 0.998;
      const hole = new Path();
      hole.absellipse(0, 0, r, r, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [make(s)];
    }
    const ry = archRise(w, h);
    const left = new Shape();
    left.moveTo(-rx, 0);
    left.lineTo(-rx, ry);
    left.lineTo(0, ry);
    left.absellipse(0, 0, rx, ry, Math.PI / 2, Math.PI, false);
    const right = new Shape();
    right.moveTo(0, ry);
    right.lineTo(rx, ry);
    right.lineTo(rx, 0);
    right.absellipse(0, 0, rx, ry, 0, Math.PI / 2, false);
    return [make(left), make(right)];
  }, [kind, w, h, thick]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const mat = useMemo(() => new MeshStandardMaterial({ color: tint, roughness: 0.9 }), [tint]);
  useEffect(() => () => mat.dispose(), [mat]);
  const y = kind === "round" ? y0 + h / 2 : y0 + h - archRise(w, h);
  return (
    <group position={[0, y, 0]}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} castShadow receiveShadow />
      ))}
    </group>
  );
}
