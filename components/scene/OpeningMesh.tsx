"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, MeshBasicMaterial, MeshPhysicalMaterial, type Group, type Mesh } from "three";
import { WALL_CUT_H, openingSwing } from "@/lib/geometry";
import { isOpenState } from "@/lib/ha";
import { frameColor, styleDef, styleOf } from "@/lib/openings";
import { glowTexture } from "@/lib/textures";
import { useStore } from "@/lib/store";
import type { Opening } from "@/lib/types";
import DoorStyles from "./DoorStyles";
import DoorLeafDetail from "./DoorLeafDetail";
import SillTrim from "./SillTrim";
import { useKnobs } from "@/lib/quality";
import { useReducedMotion } from "./motion";
import { keepAlive } from "@/lib/framePacer";
import { AJAR, BAR, Bar, DOOR_OPEN, FRAME, Leaf, STONE, WINDOW_OPEN, WOOD, useGlass, type Ref } from "./openingParts";
import { EntranceDoorOrnament } from "./BuildingHallway";
import { hallwayOf } from "@/lib/hallway";
import { Marker } from "./DeclutterLayer";
import Shafts from "./Shafts";
import { live } from "./skyLive";
import Stream, { type StreamDrive, type StreamShape } from "./Stream";
import WindowStyles from "./WindowStyles";

const ALERT = "#ff5b2a"; // open-window hairline: red-orange, kept below the bloom threshold
const GLAZED_DOOR_MIN = 1.5; // doors this wide are glass patio doors
const GLAZED_DOOR_TALL = 2.15; // ... and so are floor-to-ceiling ones
const SWING_RATE = 3.2; // damping of the leaf swing and every open-state cue (1/s)
const TWO_LEAF_MIN = 1.2; // wider windows get two casements
const SILL_SPLASH_MIN = 0.15; // drops only fall in over a raised sill
const PLAIN_WALL = "#f1efea";

/** A plain single door still goes glass when it is wide or floor-to-ceiling (as before styles existed); every other style says for itself. */
const isGlazed = (o: Opening) => (styleOf(o) === "single" ? o.width >= GLAZED_DOOR_MIN || o.height >= GLAZED_DOOR_TALL : !!styleDef(o).glazed);


/** Hairline red-orange frame that pulses around an open opening. */
function OpenGlow({ w, y0, y1, depth, amount, sill }: { w: number; y0: number; y1: number; depth: number; amount: Ref; sill: number }) {
  const group = useRef<Group>(null);
  const mat = useMemo(() => new MeshBasicMaterial({ color: ALERT, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const reduced = useReducedMotion();
  useFrame(({ clock }) => {
    const a = amount.current;
    if (group.current) group.current.visible = a > 0.01;
    mat.opacity = a * (reduced ? 0.85 : 0.6 + 0.4 * Math.sin(clock.elapsedTime * 3.4));
    if (a > 0.01 && !reduced) keepAlive(false);
  });
  const L = 0.014;
  const h = y1 - y0;
  const D = depth + 0.05;
  const bars: [number, number, number, number][] = [
    [-w / 2 - L / 2, (y0 + y1) / 2, L, h + L * 2],
    [w / 2 + L / 2, (y0 + y1) / 2, L, h + L * 2],
    [0, y1 + L / 2, w + L * 2, L],
  ];
  if (sill > 0.01) bars.push([0, y0 - L / 2, w + L * 2, L]);
  return (
    <group ref={group} visible={false}>
      {bars.map(([px, py, bw, bh], i) => (
        <mesh key={i} position={[px, py, 0]} renderOrder={6} raycast={() => null} material={mat}>
          <boxGeometry args={[bw, bh, D]} />
        </mesh>
      ))}
    </group>
  );
}

/** Cold air drifting in through an open opening; rain or snow falling in over an open window sill. */
function OpenAir({ o, amount, inward, cut }: { o: Opening; amount: Ref; inward: 1 | -1; cut: boolean }) {
  const dpr = useThree((s) => s.gl.getPixelRatio());
  const reduced = useReducedMotion();
  const w = o.width;
  const draught = useMemo<StreamShape>(
    () => ({ origin: [0, o.sill + o.height / 2, 0.02 * inward], ext: [w * 0.9, o.height * 0.9, 0.05], dir: [0, -0.1, 1.5 * inward], g: -0.4, sway: 0.1, px: 3.4 }),
    [w, o.sill, o.height, inward],
  );
  const drips = useMemo<StreamShape>(
    () => ({ origin: [0, o.sill + 0.02, 0.05 * inward], ext: [w * 0.85, 0, 0], dir: [0, 0, 0.3 * inward], g: -(o.sill - 0.05), flat: 1, px: 2.6 }),
    [w, o.sill, inward],
  );
  const hidden = cut && o.sill >= WALL_CUT_H;
  const coldDrive = useMemo<StreamDrive>(
    () => (u) => {
      u.uLevel.value = hidden ? 0 : amount.current * 0.5;
      u.uColor.value.set(0.72, 0.86, 1);
      return 0.2 + 0.05 * live.wind;
    },
    [amount, hidden],
  );
  const dripDrive = useMemo<StreamDrive>(
    () => (u) => {
      const snow = live.snow > live.rain;
      const fall = Math.max(live.rain, live.snow);
      u.uLevel.value = hidden ? 0 : amount.current * Math.min(1, fall * 1.6) * (snow ? 0.75 : 0.85);
      if (snow) u.uColor.value.set(0.93, 0.96, 1);
      else u.uColor.value.set(0.68, 0.8, 1);
      return snow ? 0.3 : 1.7 + live.pour;
    },
    [amount, hidden],
  );
  const patch = useRef<Mesh>(null);
  useFrame(() => {
    const p = patch.current;
    if (!p) return;
    const k = hidden ? 0 : amount.current * live.wet;
    (p.material as MeshBasicMaterial).opacity = k * 0.55;
    p.visible = k > 0.01;
  });
  if (reduced) return null;
  return (
    <>
      <Stream count={56} shape={draught} drive={coldDrive} dpr={dpr} />
      {o.type === "window" && o.sill >= SILL_SPLASH_MIN && (
        <>
          <Stream count={40} shape={drips} drive={dripDrive} dpr={dpr} />
          <mesh ref={patch} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.078, 0.3 * inward]} renderOrder={2} raycast={() => null} visible={false}>
            <planeGeometry args={[w * 1.1, 0.7]} />
            <meshBasicMaterial map={glowTexture()} color="#0a1626" transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
    </>
  );
}

/** Pulsing "OPEN" tag above an open opening; fades out and unmounts after it closes. Cinema mode hides badges in CSS. */
function OpenTag({ open, position }: { open: boolean; position: [number, number, number] }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 700);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <Marker kind="badge" alert position={position} label="Open">
      <div className={`badge warn${open ? "" : " off"}`} role="status">
        OPEN
      </div>
    </Marker>
  );
}

function Window({ o, cutaway, glow, thick, amount, known, sw }: { o: Opening; cutaway: boolean; glow: Ref; thick: number; amount: Ref; known: boolean; sw: { h: -1 | 1; n: -1 | 1 } }) {
  const FD = thick + 0.02; // frame depth, slightly proud of the wall
  const w = o.width;
  const sill = o.sill;
  const full = sill + o.height;
  const top = cutaway ? Math.min(full, WALL_CUT_H) : full;
  const h = top - sill;
  const cy = sill + h / 2;
  const glass = useGlass(o.tint, glow);
  const detailed = useKnobs().detail >= 1;
  const dark = frameColor(o); // jambs, sill and head; one chosen colour paints the sashes too
  const sash = o.color ?? FRAME;
  if (h <= BAR) return null; // entirely above the cut-away height
  const clipped = top < full;
  const inner = w - BAR * 2;
  const sashH = h - BAR * (clipped ? 1 : 2);
  const two = styleOf(o) === "twin" || w > TWO_LEAF_MIN;
  const leaf = (x: number, hinge: 1 | -1, width: number) => (
    <Leaf x={x} hinge={hinge} width={width} y0={sill + BAR} height={sashH} max={WINDOW_OPEN} amount={amount} known={known} inward={sw.n} material={glass} frame={sash} />
  );
  return (
    <group>
      <Bar p={[-w / 2 + BAR / 2, cy, 0]} s={[BAR, h, FD]} color={dark} />
      <Bar p={[w / 2 - BAR / 2, cy, 0]} s={[BAR, h, FD]} color={dark} />
      <Bar p={[0, sill + BAR / 2, 0]} s={[w, BAR, FD]} color={dark} />
      {!clipped && <Bar p={[0, full - BAR / 2, 0]} s={[w, BAR, FD]} color={dark} />}
      {two ? (
        <>
          {leaf(-w / 2 + BAR, -1, inner / 2)}
          {leaf(w / 2 - BAR, 1, inner / 2)}
        </>
      ) : (
        leaf(sw.h * (w / 2 - BAR), sw.h, inner)
      )}
      {/* outer stone sill + inner sill */}
      {detailed ? (
        <SillTrim w={w} sill={sill} thick={thick} inner={FRAME} />
      ) : (
        <>
          <Bar p={[0, sill - 0.025, thick / 2 + 0.03]} s={[w + 0.1, 0.05, 0.12]} color={STONE} />
          <Bar p={[0, sill - 0.015, -thick / 2 - 0.03]} s={[w + 0.06, 0.03, 0.1]} color={FRAME} />
        </>
      )}
    </group>
  );
}

function Door({ o, cutaway, thick, amount, known, sw, outside }: { o: Opening; cutaway: boolean; thick: number; amount: Ref; known: boolean; sw: { h: -1 | 1; n: -1 | 1 }; outside?: 1 | -1 }) {
  const FD = thick + 0.02;
  const w = o.width;
  const sill = o.sill;
  const full = sill + o.height;
  const top = cutaway ? Math.min(full, WALL_CUT_H) : full;
  const leafW = w - BAR * 2;
  const leafH = o.height - BAR;
  const glazed = isGlazed(o);
  const F = frameColor(o);
  const detailed = useKnobs().detail >= 1;
  const half = (top - sill) / 2;
  const glass = useMemo(() => new MeshPhysicalMaterial({ color: "#9bb8cc", transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.05, side: 2 }), []);
  useEffect(() => () => glass.dispose(), [glass]);
  const swing = useRef<Group>(null);
  useFrame(() => {
    const g = swing.current;
    if (!g) return;
    const r = sw.h * sw.n * (known ? amount.current * DOOR_OPEN : AJAR);
    if (g.rotation.y !== r) g.rotation.y = r;
  });
  return (
    <group>
      <Bar p={[-w / 2 + BAR / 2, sill + half, 0]} s={[BAR, top - sill, FD]} color={F} />
      <Bar p={[w / 2 - BAR / 2, sill + half, 0]} s={[BAR, top - sill, FD]} color={F} />
      <Bar p={[0, sill + 0.02, 0]} s={[w, 0.04, FD + 0.06]} color={STONE} />
      {!cutaway && (
        <>
          <Bar p={[0, full - BAR / 2, 0]} s={[w, BAR, FD]} color={F} />
          {glazed ? (
            <>
              <Bar p={[0, sill + o.height / 2, 0]} s={[BAR * 0.8, o.height, FD * 0.7]} color={F} />
              <Leaf x={-w / 2 + BAR} hinge={-1} width={leafW / 2} y0={sill} height={leafH} max={DOOR_OPEN} amount={amount} known={known} inward={sw.n} material={glass} />
              <Leaf x={w / 2 - BAR} hinge={1} width={leafW / 2} y0={sill} height={leafH} max={DOOR_OPEN} amount={amount} known={known} inward={sw.n} material={glass} />
            </>
          ) : (
            <group ref={swing} position={[sw.h * (w / 2 - BAR - 0.021), 0, 0]}>
              <mesh position={[-sw.h * (leafW / 2), sill + leafH / 2, 0]} castShadow>
                <boxGeometry args={[leafW, leafH, 0.04]} />
                <meshStandardMaterial color={o.color ?? WOOD} roughness={0.75} />
              </mesh>
              {detailed ? (
                <DoorLeafDetail x={-sw.h * (leafW / 2)} width={leafW} height={leafH} y0={sill} hinge={sw.h} color={o.color ?? WOOD} />
              ) : (
                [1, -1].map((side) => (
                  <mesh key={side} position={[-sw.h * (leafW - 0.1), sill + Math.min(1.0, o.height * 0.48), side * 0.045]}>
                    <boxGeometry args={[0.1, 0.03, 0.05]} />
                    <meshStandardMaterial color="#c9a95a" metalness={0.6} roughness={0.35} />
                  </mesh>
                ))
              )}
              {outside && <EntranceDoorOrnament x={-sw.h * (leafW / 2)} y0={sill} side={outside} />}
            </group>
          )}
        </>
      )}
    </group>
  );
}

export default function OpeningMesh({
  opening,
  wallLen,
  cutaway,
  glow,
  inward,
  thickness,
  wallTint = PLAIN_WALL,
}: {
  opening: Opening;
  wallLen: number;
  cutaway: boolean;
  glow: Ref;
  inward: 1 | -1; // which side of the wall (local +z or -z) faces into a room
  thickness: number;
  wallTint?: string; // colour of the wall around it, for the infill beside arches and round windows
}) {
  const x = opening.t * wallLen - wallLen / 2;
  const isWindow = opening.type === "window";
  // an explicit swing wins; otherwise doors follow the editor default (left) and windows open into the room
  const sw = openingSwing(opening, isWindow ? (inward === 1 ? "right" : "left") : "left");
  const top = opening.sill + opening.height;
  const known = useStore((s) => !!(opening.entity && s.states[opening.entity]));
  const outside = useStore((s) => { // the flat's own front door, seen from the building hallway, wears its number plate and peephole
    const h = hallwayOf(s.plan);
    return h?.openingId === opening.id ? (h.facade === 1 ? -1 : 1) : undefined;
  });
  const open = useStore((s) => !!opening.entity && isOpenState(s.states[opening.entity]));
  const amount = useRef(open ? 1 : 0);
  useFrame((_, dt) => {
    const t = open ? 1 : 0;
    const a = amount.current;
    amount.current = Math.abs(a - t) < 0.001 ? t : MathUtils.damp(a, t, SWING_RATE, Math.min(dt, 0.1));
    if (amount.current !== t) keepAlive();
  });
  const visTop = cutaway ? Math.min(top, WALL_CUT_H) : top;
  const hiddenInCut = cutaway && opening.sill >= WALL_CUT_H;
  const tagY = hiddenInCut ? opening.sill + opening.height / 2 : visTop + 0.32;
  const style = styleOf(opening);
  const styleProps = { o: opening, cutaway, glow, thick: thickness, amount, known, sw, inward, wallTint };
  return (
    <group position={[x, 0, 0]}>
      {isWindow ? (
        style === "casement" || style === "twin" ? (
          <Window o={opening} cutaway={cutaway} glow={glow} thick={thickness} amount={amount} known={known} sw={sw} />
        ) : (
          <WindowStyles {...styleProps} />
        )
      ) : style === "single" ? (
        <Door o={opening} cutaway={cutaway} thick={thickness} amount={amount} known={known} sw={sw} outside={outside} />
      ) : (
        <DoorStyles {...styleProps} />
      )}
      {isGlazed(opening) && (
        <group scale={[1, 1, inward]}>
          <Shafts w={opening.width - BAR * 2} sill={isWindow ? opening.sill : opening.sill + 0.05} top={top} glow={glow} cutaway={cutaway} />
        </group>
      )}
      {opening.entity && known && (
        <>
          {!hiddenInCut && <OpenGlow w={opening.width} y0={opening.sill} y1={visTop} depth={thickness} amount={amount} sill={opening.sill} />}
          <OpenAir o={opening} amount={amount} inward={inward} cut={cutaway} />
          <OpenTag open={open} position={[0, tagY, 0]} />
        </>
      )}
    </group>
  );
}
