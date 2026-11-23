"use client";
import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type Group, type MeshPhysicalMaterial } from "three";
import { WALL_CUT_H } from "@/lib/geometry";
import { styleOf } from "@/lib/openings";
import { AJAR, ArchRing, BAR, Bar, DOOR_OPEN, FRAME, FRAME_DARK, Leaf, Slide, Spandrels, STONE, WOOD, archRise, useGlass, type StyleProps } from "./openingParts";
import DoorLeafDetail from "./DoorLeafDetail";
import { useKnobs } from "@/lib/quality";

const GOLD = "#c9a95a";
const STEEL = "#b8bcc2";

function Metal({ p, s, color = STEEL }: { p: [number, number, number]; s: [number, number, number]; color?: string }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.35} />
    </mesh>
  );
}

/** Jambs, optional head and stone threshold; in cutaway the jambs stop at WALL_CUT_H and the head is skipped. `trim` = bar width. */
function Frame({ p, color, trim = BAR, head = true, threshold = true }: { p: StyleProps; color: string; trim?: number; head?: boolean; threshold?: boolean }) {
  const { o, cutaway, thick } = p;
  const FD = thick + 0.02;
  const w = o.width;
  const full = o.sill + o.height;
  const top = cutaway ? Math.min(full, WALL_CUT_H) : full;
  const mid = (o.sill + top) / 2;
  return (
    <>
      {top > o.sill && (
        <>
          <Bar p={[-w / 2 + trim / 2, mid, 0]} s={[trim, top - o.sill, FD]} color={color} />
          <Bar p={[w / 2 - trim / 2, mid, 0]} s={[trim, top - o.sill, FD]} color={color} />
        </>
      )}
      {threshold && <Bar p={[0, o.sill + 0.02, 0]} s={[w, 0.04, FD + 0.06]} color={STONE} />}
      {head && !cutaway && <Bar p={[0, full - trim / 2, 0]} s={[w, trim, FD]} color={color} />}
    </>
  );
}

/** Opaque hinged leaf. Hinge at x; hinge -1 = hinged on its left edge. Swings like the legacy Door (rotation.y = hinge * n * angle). `children` live in the leaf frame (origin on the hinge axis). */
function SolidLeaf({
  p,
  x,
  hinge,
  width,
  y0,
  height,
  color,
  handle = true,
  children,
}: {
  p: StyleProps;
  x: number;
  hinge: 1 | -1;
  width: number;
  y0: number;
  height: number;
  color: string;
  handle?: boolean;
  children?: ReactNode;
}) {
  const { amount, known, sw } = p;
  const detailed = useKnobs().detail >= 1;
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const r = hinge * sw.n * (known ? amount.current * DOOR_OPEN : AJAR);
    if (g.rotation.y !== r) g.rotation.y = r;
  });
  const hy = y0 + Math.min(1.0, height * 0.48);
  return (
    <group ref={ref} position={[x, 0, 0]}>
      <mesh position={[-hinge * (width / 2), y0 + height / 2, 0]} castShadow>
        <boxGeometry args={[width, height, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      {detailed && <DoorLeafDetail x={-hinge * (width / 2)} width={width} height={height} y0={y0} hinge={hinge} color={color} handle={handle} />}
      {handle && !detailed &&
        [1, -1].map((side) => <Metal key={side} p={[-hinge * (width - 0.08), hy, side * 0.045]} s={[0.1, 0.03, 0.05]} color={GOLD} />)}
      {children}
    </group>
  );
}

function Double(p: StyleProps) {
  const { o } = p;
  const F = o.color ?? FRAME;
  const leafW = (o.width - BAR * 2) / 2;
  return (
    <group>
      <Frame p={p} color={F} />
      {!p.cutaway &&
        ([-1, 1] as const).map((hinge) => (
          <SolidLeaf key={hinge} p={p} x={hinge * (o.width / 2 - BAR)} hinge={hinge} width={leafW} y0={o.sill} height={o.height - BAR} color={o.color ?? WOOD} />
        ))}
    </group>
  );
}

/** Framed glass pane centred on x = cx. */
function GlassPanel({ cx, width, y0, height, color, glass }: { cx: number; width: number; y0: number; height: number; color: string; glass: MeshPhysicalMaterial }) {
  const T = 0.04;
  const cy = y0 + height / 2;
  return (
    <group>
      <mesh position={[cx, cy, 0]} material={glass}>
        <planeGeometry args={[width, Math.max(0.01, height)]} />
      </mesh>
      <Bar p={[cx, y0 + T / 2, 0]} s={[width, T, 0.045]} color={color} />
      <Bar p={[cx, y0 + height - T / 2, 0]} s={[width, T, 0.045]} color={color} />
      <Bar p={[cx - (width - T) / 2, cy, 0]} s={[T, height, 0.045]} color={color} />
      <Bar p={[cx + (width - T) / 2, cy, 0]} s={[T, height, 0.045]} color={color} />
    </group>
  );
}

function SlidingGlass(p: StyleProps) {
  const { o, glow, sw, amount, known } = p;
  const F = o.color ?? FRAME_DARK;
  const glass = useGlass(o.tint, glow);
  const w = o.width;
  const pw = (w - BAR * 2) / 2 + 0.04;
  const edge = w / 2 - BAR - pw / 2; // panel centre when flush against a jamb
  const y0 = o.sill + 0.04;
  const ph = o.height - BAR - 0.04;
  return (
    <group>
      <Frame p={p} color={F} />
      {!p.cutaway && (
        <>
          {/* fixed panel on the hinge side, moving panel in a second track so they can overlap */}
          <group position={[sw.h * edge, 0, -0.03]}>
            <GlassPanel cx={0} width={pw} y0={y0} height={ph} color={F} glass={glass} />
          </group>
          <Slide x={-sw.h * edge} z={0.03} travel={sw.h * (w - BAR * 2 - pw)} amount={amount} known={known}>
            <GlassPanel cx={0} width={pw} y0={y0} height={ph} color={F} glass={glass} />
            {[1, -1].map((side) => (
              <Metal key={side} p={[sw.h * (pw / 2 - 0.03), o.sill + 1.0, side * 0.035]} s={[0.025, 0.3, 0.025]} />
            ))}
          </Slide>
        </>
      )}
    </group>
  );
}

function Pocket(p: StyleProps) {
  const { o, thick, inward, sw, amount, known, cutaway } = p;
  const F = o.color ?? WOOD;
  const w = o.width;
  const lw = w + 0.1;
  const lh = o.height - 0.02;
  const full = o.sill + o.height;
  const rail = "#4a3626";
  const steel = "#2c2f34";
  const rz = inward * 0.026;
  const dy = lh - 0.4;
  const brace = Math.atan2(dy, lw - 0.2);
  return (
    <group>
      <Frame p={p} color={F} trim={BAR * 0.6} head={false} threshold={false} />
      {!cutaway && (
        <>
          <Bar p={[sw.h * (lw / 2 + 0.05), full + 0.08, inward * (thick / 2 + 0.035)]} s={[2 * w + 0.3, 0.03, 0.03]} color={steel} />
          <Slide z={inward * (thick / 2 + 0.035)} travel={sw.h * lw} amount={amount} known={known}>
            <mesh position={[0, o.sill + lh / 2, 0]} castShadow>
              <boxGeometry args={[lw, lh, 0.04]} />
              <meshStandardMaterial color={F} roughness={0.75} />
            </mesh>
            {[0.2, lh - 0.2].map((y) => (
              <Bar key={y} p={[0, o.sill + y, rz]} s={[lw - 0.06, 0.12, 0.012]} color={rail} />
            ))}
            <mesh position={[0, o.sill + lh / 2, rz]} rotation={[0, 0, brace]}>
              <boxGeometry args={[Math.hypot(dy, lw - 0.2), 0.09, 0.012]} />
              <meshStandardMaterial color={rail} roughness={0.8} />
            </mesh>
            <Metal p={[-lw / 2 + 0.2, full + 0.035, 0]} s={[0.06, 0.1, 0.05]} color={steel} />
            <Metal p={[lw / 2 - 0.2, full + 0.035, 0]} s={[0.06, 0.1, 0.05]} color={steel} />
            <Metal p={[sw.h * (lw / 2 - 0.12), o.sill + 1.0, inward * 0.04]} s={[0.025, 0.25, 0.03]} color={steel} />
          </Slide>
        </>
      )}
    </group>
  );
}

/** Door handle shown only while a linked sensor says closed: the leaves part when open. */
function MeetingHandle({ p, y }: { p: StyleProps; y: number }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (g) g.visible = p.known && p.amount.current < 0.03;
  });
  return (
    <group ref={ref}>
      {[1, -1].map((side) => (
        <group key={side}>
          <Metal p={[-0.03, y, side * 0.035]} s={[0.022, 0.25, 0.025]} color={GOLD} />
          <Metal p={[0.03, y, side * 0.035]} s={[0.022, 0.25, 0.025]} color={GOLD} />
        </group>
      ))}
    </group>
  );
}

function French(p: StyleProps) {
  const { o, glow, amount, known, sw, cutaway } = p;
  const F = o.color ?? FRAME;
  const glass = useGlass(o.tint, glow);
  const leafW = (o.width - BAR * 2) / 2;
  return (
    <group>
      <Frame p={p} color={F} />
      {!cutaway && (
        <>
          {([-1, 1] as const).map((hinge) => (
            <Leaf
              key={hinge}
              x={hinge * (o.width / 2 - BAR)}
              hinge={hinge}
              width={leafW}
              y0={o.sill + 0.04}
              height={o.height - BAR - 0.04}
              max={DOOR_OPEN}
              rest={AJAR}
              amount={amount}
              known={known}
              inward={sw.n}
              material={glass}
              frame={F}
              muntins={[3, 5]}
            />
          ))}
          <MeetingHandle p={p} y={o.sill + 1.0} />
        </>
      )}
    </group>
  );
}

function Arch(p: StyleProps) {
  const { o, thick, cutaway, wallTint } = p;
  const F = o.color ?? FRAME;
  const w = o.width;
  const rise = archRise(w, o.height);
  const spring = o.sill + o.height - rise;
  const top = cutaway ? Math.min(spring, WALL_CUT_H) : spring;
  const jw = BAR * 0.8;
  const FD = thick + 0.02;
  return (
    <group>
      {!cutaway && <Spandrels kind="arch" w={w} h={o.height} y0={o.sill} thick={thick} tint={wallTint} />}
      {!cutaway && <ArchRing rx={w / 2} ry={rise} t={0.06} depth={thick + 0.03} color={F} position={[0, spring, 0]} />}
      {top > o.sill &&
        [-1, 1].map((s) => <Bar key={s} p={[s * (w / 2 - jw / 2), (o.sill + top) / 2, 0]} s={[jw, top - o.sill, FD]} color={F} />)}
    </group>
  );
}

function GarageSectional(p: StyleProps) {
  const { o, glow, known, amount, cutaway } = p;
  const F = o.color ?? "#d9d6cf";
  const glass = useGlass(o.tint, glow);
  const refs = useRef<(Group | null)[]>([]);
  const w = o.width;
  const pw = w - BAR * 2;
  const n = Math.max(3, Math.round(o.height / 0.5));
  const pitch = (o.height - BAR) / n;
  const sh = pitch - 0.012;
  const closed = (i: number) => o.sill + i * pitch + pitch / 2;
  const topY = closed(n - 1);
  const panes = Math.floor(w / 0.65);
  useFrame(() => {
    const a = known ? amount.current : 0;
    for (let i = 0; i < n; i++) {
      const g = refs.current[i];
      if (!g) continue;
      // stacked under the head, spaced 0.045; the top section stays put
      const y = MathUtils.lerp(closed(i), topY - (n - 1 - i) * 0.045, a);
      if (g.position.y !== y) g.position.y = y;
      const vis = !(cutaway && y - sh / 2 >= WALL_CUT_H);
      if (g.visible !== vis) g.visible = vis;
    }
  });
  return (
    <group>
      <Frame p={p} color={F} threshold={false} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} position={[0, closed(i), 0]}>
          <mesh castShadow>
            <boxGeometry args={[pw, sh, 0.04]} />
            <meshStandardMaterial color={o.color ?? "#c8c3b8"} roughness={0.55} />
          </mesh>
          <Bar p={[0, -sh / 2 + 0.01, 0]} s={[pw, 0.02, 0.046]} color="#4d5158" />
          {i === n - 2 &&
            Array.from({ length: panes }, (_, k) => {
              const x = (k - (panes - 1) / 2) * 0.65;
              return [1, -1].map((side) => (
                <mesh key={`${k}${side}`} position={[x, 0, side * 0.0215]} rotation={[0, side === 1 ? 0 : Math.PI, 0]} material={glass}>
                  <planeGeometry args={[0.45, sh * 0.55]} />
                </mesh>
              ));
            })}
          {i === 0 &&
            [1, -1].map((side) => (
              <group key={side}>
                <Metal p={[0, 0, side * 0.0225]} s={[0.09, 0.09, 0.005]} color="#2c2f34" />
                <Metal p={[0, 0, side * 0.035]} s={[0.18, 0.025, 0.025]} color="#2c2f34" />
              </group>
            ))}
        </group>
      ))}
    </group>
  );
}

const MAX_SLATS = 20;

function GarageRoller(p: StyleProps) {
  const { o, inward, known, amount, cutaway } = p;
  const F = o.color ?? "#9aa0a8";
  const w = o.width;
  const ch = o.height - BAR; // curtain height
  const top = o.sill + ch; // curtain anchored under the head
  const slats = Math.min(MAX_SLATS, Math.floor(ch / 0.12));
  const curtain = useRef<Group>(null);
  const bar = useRef<Group>(null);
  useFrame(() => {
    const s = known ? 1 - 0.96 * amount.current : 1;
    if (curtain.current && curtain.current.scale.y !== s) curtain.current.scale.y = s;
    if (bar.current) bar.current.position.y = top - ch * s;
  });
  return (
    <group>
      <Frame p={p} color={F} threshold={false} />
      {!cutaway && (
        <>
          <Bar p={[0, o.sill + o.height + 0.11, inward * 0.09]} s={[w + 0.04, 0.22, 0.2]} color={F} />
          <group ref={curtain} position={[0, top, 0]}>
            <Bar p={[0, -ch / 2, 0]} s={[w - BAR * 2, ch, 0.03]} color={o.color ?? "#b8bdc4"} />
            {Array.from({ length: slats }, (_, i) => (
              <Bar key={i} p={[0, -0.06 - i * 0.12, 0]} s={[w - BAR * 2, 0.012, 0.04]} color="#7d838b" />
            ))}
          </group>
          <group ref={bar} position={[0, o.sill, 0]}>
            <Bar p={[0, 0.025, 0]} s={[w, 0.05, 0.05]} color="#4a4f57" />
          </group>
        </>
      )}
    </group>
  );
}

function Sidelight(p: StyleProps) {
  const { o, glow, sw, cutaway } = p;
  const F = o.color ?? FRAME;
  const slit = useGlass(o.tint, glow);
  const frosted = useGlass(o.tint ?? "frosted", glow);
  const w = o.width;
  const h = sw.h;
  const lw = Math.min(0.9, w - 0.35);
  const leafW = lw - BAR - 0.03;
  const leafH = o.height - BAR;
  const sideW = w - lw - BAR - 0.02;
  return (
    <group>
      <Frame p={p} color={F} />
      {!cutaway && (
        <>
          <SolidLeaf p={p} x={h * (w / 2 - BAR)} hinge={h} width={leafW} y0={o.sill} height={leafH} color={o.color ?? WOOD} handle={false}>
            {/* slit window near the top, a hair thicker than the leaf so both faces show glass */}
            <mesh position={[-h * (leafW / 2), o.sill + leafH - 0.5, 0]} material={slit}>
              <boxGeometry args={[Math.min(0.14, leafW * 0.3), 0.6, 0.046]} />
            </mesh>
            {[1, -1].map((side) => (
              <Metal key={side} p={[-h * (leafW - 0.08), o.sill + 1.0, side * 0.045]} s={[0.12, 0.025, 0.05]} />
            ))}
          </SolidLeaf>
          <Bar p={[h * (w / 2 - lw), o.sill + o.height / 2, 0]} s={[0.04, o.height - BAR, 0.05]} color={F} />
          <GlassPanel cx={h * (BAR - lw - 0.02) / 2} width={sideW} y0={o.sill + 0.04} height={o.height - BAR - 0.04} color={F} glass={frosted} />
        </>
      )}
    </group>
  );
}

const FOLD_MAX = (75 * Math.PI) / 180;

/** One bi-fold panel; the next panel hangs from its far end, so the chain zig-zags into the room. */
function FoldPanel({ p, i, pw, color, glass }: { p: StyleProps; i: number; pw: number; color: string; glass: MeshPhysicalMaterial }) {
  const { o, sw, amount, known } = p;
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const phi = known ? amount.current * FOLD_MAX : 0;
    const r = (i === 0 ? 1 : i % 2 ? -2 : 2) * sw.h * sw.n * phi;
    if (g.rotation.y !== r) g.rotation.y = r;
  });
  const d = -sw.h; // panels extend away from the hinge jamb
  const y0 = o.sill + 0.04;
  const ph = o.height - BAR - 0.04;
  return (
    <group ref={ref} position={[i === 0 ? sw.h * (o.width / 2 - BAR) : d * pw, 0, 0]}>
      <GlassPanel cx={d * (pw / 2)} width={pw - 0.005} y0={y0} height={ph} color={color} glass={glass} />
      {i === 3 && [1, -1].map((side) => <Metal key={side} p={[d * (pw - 0.07), o.sill + 1.0, side * 0.035]} s={[0.025, 0.3, 0.025]} />)}
      {i < 3 && <FoldPanel p={p} i={i + 1} pw={pw} color={color} glass={glass} />}
    </group>
  );
}

function Folding(p: StyleProps) {
  const { o, glow, cutaway } = p;
  const F = o.color ?? FRAME_DARK;
  const glass = useGlass(o.tint, glow);
  return (
    <group>
      <Frame p={p} color={F} />
      {!cutaway && <FoldPanel p={p} i={0} pw={(o.width - BAR * 2) / 4} color={F} glass={glass} />}
    </group>
  );
}

const GATE_WHITE = "#f4f1ea";
const GATE_GREEN = "#4a5d46";
const PICKET_STEP = 0.11;

/** A garden gate: two posts and one hinged leaf of rails and pickets with gaps between them. In cutaway only the posts remain. */
function Gate(p: StyleProps & { color: string }) {
  const { o, cutaway, amount, known, sw, color } = p;
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const r = sw.h * sw.n * (known ? amount.current * DOOR_OPEN : AJAR);
    if (g.rotation.y !== r) g.rotation.y = r;
  });
  const post = 0.08;
  const leafW = o.width - post * 2;
  const y0 = o.sill + 0.05;
  const h = o.height - 0.05;
  const n = Math.max(2, Math.round(leafW / PICKET_STEP));
  const step = (leafW - 0.04) / (n - 1);
  return (
    <group>
      <Frame p={p} color={color} trim={post} head={false} threshold={false} />
      {!cutaway && (
        <group ref={ref} position={[sw.h * (o.width / 2 - post), 0, 0]}>
          {Array.from({ length: n }, (_, i) => (
            <Bar key={i} p={[-sw.h * (0.02 + i * step), y0 + h / 2, 0]} s={[0.04, h, 0.02]} color={color} />
          ))}
          {[0.2, 0.8].map((k) => (
            <Bar key={k} p={[-sw.h * (leafW / 2), y0 + h * k, 0.025]} s={[leafW, 0.05, 0.025]} color={color} />
          ))}
          <Metal p={[-sw.h * (leafW - 0.06), y0 + h * 0.5, 0.05]} s={[0.04, 0.1, 0.03]} color={GOLD} />
        </group>
      )}
    </group>
  );
}

export default function DoorStyles(p: StyleProps) {
  switch (styleOf(p.o)) {
    case "double":
      return <Double {...p} />;
    case "slidingGlass":
      return <SlidingGlass {...p} />;
    case "pocket":
      return <Pocket {...p} />;
    case "french":
      return <French {...p} />;
    case "arch":
      return <Arch {...p} />;
    case "passage":
      return <Frame p={p} color={p.o.color ?? FRAME} trim={BAR * 0.7} threshold={false} />;
    case "garageSectional":
      return <GarageSectional {...p} />;
    case "garageRoller":
      return <GarageRoller {...p} />;
    case "sidelight":
      return <Sidelight {...p} />;
    case "folding":
      return <Folding {...p} />;
    case "gate":
      return <Gate {...p} color={p.o.color ?? GATE_WHITE} />;
    case "wicket":
      return <Gate {...p} color={p.o.color ?? GATE_GREEN} />;
    default:
      return null; // "single" is the legacy Door
  }
}
