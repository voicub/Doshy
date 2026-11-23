"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, ExtrudeGeometry, MeshPhysicalMaterial, Shape, ShapeGeometry, type Group } from "three";
import { WALL_CUT_H } from "@/lib/geometry";
import { styleOf } from "@/lib/openings";
import type { Opening } from "@/lib/types";
import { ArchRing, BAR, Bar, FRAME, FRAME_DARK, STONE, Slide, Spandrels, archRise, barMat, useGlass, type StyleProps } from "./openingParts";

const STEEL = "#b8bcc2";

/** Visible extent of the opening: in a cut-away view everything above WALL_CUT_H is dropped. */
function dims(o: Opening, cutaway: boolean) {
  const full = o.sill + o.height;
  const top = cutaway ? Math.min(full, WALL_CUT_H) : full;
  return { w: o.width, sill: o.sill, full, top, h: top - o.sill, clipped: top < full };
}

/** Outer stone sill and inner sill, as under the legacy Window. */
function Sills({ w, sill, thick }: { w: number; sill: number; thick: number }) {
  return (
    <>
      <Bar p={[0, sill - 0.025, thick / 2 + 0.03]} s={[w + 0.1, 0.05, 0.12]} color={STONE} />
      <Bar p={[0, sill - 0.015, -thick / 2 - 0.03]} s={[w + 0.06, 0.03, 0.1]} color={FRAME} />
    </>
  );
}

/** Jambs, sill bar and head bar like the legacy Window. `across` off leaves just the jambs (bay). */
function WinFrame({ p, color, bw = BAR, stone = true, across = true }: { p: StyleProps; color: string; bw?: number; stone?: boolean; across?: boolean }) {
  const { w, sill, full, h, clipped } = dims(p.o, p.cutaway);
  const FD = p.thick + 0.02;
  return (
    <>
      <Bar p={[-w / 2 + bw / 2, sill + h / 2, 0]} s={[bw, h, FD]} color={color} />
      <Bar p={[w / 2 - bw / 2, sill + h / 2, 0]} s={[bw, h, FD]} color={color} />
      {across && <Bar p={[0, sill + bw / 2, 0]} s={[w, bw, FD]} color={color} />}
      {across && !clipped && <Bar p={[0, full - bw / 2, 0]} s={[w, bw, FD]} color={color} />}
      {stone && <Sills w={w} sill={sill} thick={p.thick} />}
    </>
  );
}

/** A glass plane with a thin frame ring around it, centred at (x, y). `clipped` drops the top bar. */
function Pane({ w, h, x = 0, y, glass, color, clipped = false, t = 0.03, d = 0.04 }: { w: number; h: number; x?: number; y: number; glass: MeshPhysicalMaterial; color: string; clipped?: boolean; t?: number; d?: number }) {
  return (
    <group position={[x, y, 0]}>
      <mesh material={glass}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <Bar p={[0, -h / 2 + t / 2, 0]} s={[w, t, d]} color={color} />
      {!clipped && <Bar p={[0, h / 2 - t / 2, 0]} s={[w, t, d]} color={color} />}
      <Bar p={[-w / 2 + t / 2, 0, 0]} s={[t, h, d]} color={color} />
      <Bar p={[w / 2 - t / 2, 0, 0]} s={[t, h, d]} color={color} />
    </group>
  );
}

const Handle = ({ p, s = [0.02, 0.12, 0.025] }: { p: [number, number, number]; s?: [number, number, number] }) => <Bar p={p} s={s} color={STEEL} />;

function Picture({ p, high }: { p: StyleProps; high?: boolean }) {
  const glass = useGlass(p.o.tint, p.glow);
  const { w, sill, h, clipped } = dims(p.o, p.cutaway);
  if (h <= BAR) return null;
  const F = p.o.color ?? FRAME_DARK;
  const bw = high ? 0.03 : BAR;
  const gh = h - bw * (clipped ? 1 : 2);
  return (
    <group>
      <WinFrame p={p} color={F} bw={bw} stone={!high} />
      <Pane w={w - bw * 2} h={gh} y={sill + bw + gh / 2} glass={glass} color={F} clipped={clipped} />
    </group>
  );
}

function Sliding({ p }: { p: StyleProps }) {
  const glass = useGlass(p.o.tint, p.glow);
  const { w, sill, h, clipped } = dims(p.o, p.cutaway);
  if (h <= BAR) return null;
  const F = p.o.color ?? FRAME_DARK;
  const iw = w - BAR * 2;
  const sashW = iw / 2 + 0.03; // the sashes overlap a little
  const gh = h - BAR * (clipped ? 1 : 2);
  const cy = sill + BAR + gh / 2;
  const hs = p.sw.h;
  const z = 0.02 * p.inward;
  const fixedX = hs * (iw / 2 - sashW / 2);
  return (
    <group>
      <WinFrame p={p} color={F} />
      <group position={[0, 0, -z]}>
        <Pane w={sashW} h={gh} x={fixedX} y={cy} glass={glass} color={F} t={0.035} clipped={clipped} />
      </group>
      <Slide x={-fixedX} z={z} travel={hs * sashW * 0.9} amount={p.amount} known={p.known}>
        <Pane w={sashW} h={gh} y={cy} glass={glass} color={F} t={0.035} clipped={clipped} />
        <Handle p={[hs * (sashW / 2 - 0.045), sill + h * 0.45, 0.03 * p.inward]} />
      </Slide>
    </group>
  );
}

function TiltTurn({ p }: { p: StyleProps }) {
  const glass = useGlass(p.o.tint, p.glow);
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const r = p.inward * (p.known ? p.amount.current : 0) * 0.2; // tilts in at the top; a sensor-less window rests shut
    if (g.rotation.x !== r) g.rotation.x = r;
  });
  const { w, sill, h, clipped } = dims(p.o, p.cutaway);
  if (h <= BAR) return null;
  const F = p.o.color ?? FRAME_DARK;
  const iw = w - BAR * 2;
  const sh = h - BAR * (clipped ? 1 : 2);
  const hx = -p.sw.h * (iw / 2 - 0.04); // handle opposite the hinge
  return (
    <group>
      <WinFrame p={p} color={F} />
      <group ref={ref} position={[0, sill + BAR, 0]}>
        <Pane w={iw} h={sh} y={sh / 2} glass={glass} color={F} t={0.04} d={0.05} clipped={clipped} />
        <Handle p={[hx, sh * 0.5, 0.035 * p.inward]} s={[0.025, 0.1, 0.02]} />
        <Handle p={[hx, sh * 0.5 + 0.045, 0.02 * p.inward]} s={[0.03, 0.03, 0.02]} />
      </group>
    </group>
  );
}

/** Trapezoid outline of the bay, grown by `ro` on its free edges; y is flipped with the side the bay sticks out to. */
function trapezoid(w: number, fw: number, d: number, ro: number, inward: 1 | -1) {
  const k = Math.SQRT2;
  const s = new Shape();
  s.moveTo(-w / 2 - ro * k, 0);
  s.lineTo(-fw / 2 + ro * (1 - k), inward * (d + ro));
  s.lineTo(fw / 2 - ro * (1 - k), inward * (d + ro));
  s.lineTo(w / 2 + ro * k, 0);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
}

function Bay({ p }: { p: StyleProps }) {
  const glass = useGlass(p.o.tint, p.glow);
  const { w, sill, full, h } = dims(p.o, p.cutaway);
  const d = Math.min(0.5, w * 0.22);
  const fw = w - 2 * d;
  const geos = useMemo(() => [trapezoid(w, fw, d, 0, p.inward), trapezoid(w, fw, d, 0.05, p.inward)], [w, fw, d, p.inward]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const y0 = sill + 0.05;
  const top = p.cutaway ? Math.min(full + 0.05, WALL_CUT_H) : full + 0.05;
  const ph = top - y0;
  if (h <= BAR || ph <= 0.02) return null;
  const F = p.o.color ?? FRAME_DARK;
  const clipped = p.cutaway && top < full + 0.05;
  const zo = -p.inward * d;
  const side = (x: number, rot: number) => (
    <group position={[x, 0, zo / 2]} rotation={[0, rot, 0]}>
      <Pane w={d * Math.SQRT2} h={ph} y={y0 + ph / 2} glass={glass} color={F} clipped={clipped} />
    </group>
  );
  return (
    <group>
      <WinFrame p={p} color={F} stone={false} across={false} />
      <mesh geometry={geos[0]} material={barMat(STONE)} position={[0, sill, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow />
      {!p.cutaway && <mesh geometry={geos[1]} material={barMat(F)} position={[0, full + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow />}
      <group position={[0, 0, zo]}>
        <Pane w={fw} h={ph} y={y0 + ph / 2} glass={glass} color={F} clipped={clipped} />
      </group>
      {side(-(w + fw) / 4, p.inward * (Math.PI / 4))}
      {side((w + fw) / 4, -p.inward * (Math.PI / 4))}
    </group>
  );
}

function Arched({ p }: { p: StyleProps }) {
  const glass = useGlass(p.o.tint, p.glow);
  const { w, sill, full } = dims(p.o, p.cutaway);
  const rise = archRise(w, p.o.height);
  const spring = full - rise;
  const lowTop = p.cutaway ? Math.min(spring, WALL_CUT_H) : spring;
  const ry = Math.max(0.01, rise - 0.06);
  const gx = w / 2 - 0.06;
  const bottom = sill + BAR;
  const geo = useMemo(() => {
    const s = new Shape();
    s.moveTo(-gx, bottom - spring);
    s.lineTo(gx, bottom - spring);
    s.lineTo(gx, 0);
    s.absellipse(0, 0, gx, ry, 0, Math.PI, false);
    s.closePath();
    return new ShapeGeometry(s, 24);
  }, [gx, ry, bottom, spring]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (lowTop - sill <= BAR) return null;
  const F = p.o.color ?? FRAME_DARK;
  const FD = p.thick + 0.02;
  const lh = lowTop - sill;
  const arch = !p.cutaway;
  const gTop = arch ? spring + ry : lowTop;
  return (
    <group>
      {arch && <Spandrels kind="arch" w={w} h={p.o.height} y0={sill} thick={p.thick} tint={p.wallTint} />}
      {arch && <ArchRing rx={w / 2} ry={rise} t={0.06} depth={p.thick + 0.03} color={F} position={[0, spring, 0]} />}
      <Bar p={[-w / 2 + BAR / 2, sill + lh / 2, 0]} s={[BAR, lh, FD]} color={F} />
      <Bar p={[w / 2 - BAR / 2, sill + lh / 2, 0]} s={[BAR, lh, FD]} color={F} />
      <Bar p={[0, sill + BAR / 2, 0]} s={[w, BAR, FD]} color={F} />
      <Sills w={w} sill={sill} thick={p.thick} />
      {arch ? (
        <mesh geometry={geo} material={glass} position={[0, spring, 0]} />
      ) : (
        <mesh material={glass} position={[0, (bottom + lowTop) / 2, 0]}>
          <planeGeometry args={[gx * 2, Math.max(0.01, lowTop - bottom)]} />
        </mesh>
      )}
      <Bar p={[0, (bottom + gTop) / 2, 0]} s={[0.03, gTop - bottom, 0.04]} color={F} />
      {spring > bottom && spring <= lowTop && <Bar p={[0, spring, 0]} s={[gx * 2, 0.03, 0.04]} color={F} />}
    </group>
  );
}

function Round({ p }: { p: StyleProps }) {
  const glass = useGlass(p.o.tint, p.glow);
  const { w, sill } = dims(p.o, p.cutaway);
  const h = p.o.height;
  if (p.cutaway && sill >= WALL_CUT_H) return null;
  const F = p.o.color ?? FRAME_DARK;
  const r = Math.min(w, h) / 2 - 0.02;
  const cy = sill + h / 2;
  return (
    <group>
      <Spandrels kind="round" w={w} h={h} y0={sill} thick={p.thick} tint={p.wallTint} />
      <group position={[0, cy, 0]}>
        <mesh>
          <torusGeometry args={[r, 0.035, 8, 48]} />
          <meshStandardMaterial color={F} roughness={0.6} />
        </mesh>
        <mesh material={glass}>
          <circleGeometry args={[r, 48]} />
        </mesh>
        <Bar p={[0, 0, 0]} s={[r * 2, 0.02, 0.03]} color={F} />
        <Bar p={[0, 0, 0]} s={[0.02, r * 2, 0.03]} color={F} />
      </group>
    </group>
  );
}

function GlassBlock({ p }: { p: StyleProps }) {
  const { w, sill, top, h, clipped } = dims(p.o, p.cutaway);
  const bw = 0.03;
  const iw = w - bw * 2;
  const ih = p.o.height - bw * 2;
  let nx = Math.max(1, Math.round(w / 0.2));
  let ny = Math.max(1, Math.round(p.o.height / 0.2));
  if (nx * ny > 220) {
    const k = Math.sqrt((nx * ny) / 220);
    nx = Math.max(1, Math.floor(nx / k));
    ny = Math.max(1, Math.floor(ny / k));
  }
  const cw = iw / nx;
  const ch = ih / ny;
  const depth = Math.min(0.1, p.thick * 0.7);
  const mat = useMemo(() => new MeshPhysicalMaterial({ color: "#cfe3ec", transparent: true, opacity: 0.5, roughness: 0.4, metalness: 0, reflectivity: 0.5, depthWrite: false }), []);
  const geo = useMemo(() => new BoxGeometry(cw - 0.012, ch - 0.012, depth), [cw, ch, depth]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (h <= BAR) return null;
  const F = p.o.color ?? "#c9c5bd";
  const rows = Array.from({ length: ny }, (_, j) => j).filter((j) => sill + bw + (j + 1) * ch <= top + 1e-6);
  const mortarH = clipped ? Math.max(0.01, top - sill - bw) : ih;
  return (
    <group>
      <WinFrame p={p} color={F} bw={bw} />
      <Bar p={[0, sill + bw + mortarH / 2, 0]} s={[iw, mortarH, 0.03]} color="#c9c6c0" />
      {rows.flatMap((j) =>
        Array.from({ length: nx }, (_, i) => (
          <mesh key={`${i}-${j}`} geometry={geo} material={mat} position={[-iw / 2 + cw * (i + 0.5), sill + bw + ch * (j + 0.5), 0]} />
        )),
      )}
    </group>
  );
}

function Shopfront({ p }: { p: StyleProps }) {
  const glass = useGlass(p.o.tint, p.glow);
  const { w, sill, full, top, h, clipped } = dims(p.o, p.cutaway);
  if (h <= BAR) return null;
  const F = p.o.color ?? FRAME_DARK;
  const FD = p.thick + 0.02;
  const iw = w - BAR * 2;
  const riser = Math.min(0.45, h);
  const transomY = full - 0.35;
  const glassBot = sill + riser + 0.03;
  const lowTop = Math.min(transomY - BAR / 2, top);
  const upTop = full - BAR;
  const np = Math.max(1, Math.ceil(w / 1.2));
  const mullTop = clipped ? top : upTop;
  return (
    <group>
      <Bar p={[-w / 2 + BAR / 2, sill + h / 2, 0]} s={[BAR, h, FD]} color={F} />
      <Bar p={[w / 2 - BAR / 2, sill + h / 2, 0]} s={[BAR, h, FD]} color={F} />
      {!clipped && <Bar p={[0, full - BAR / 2, 0]} s={[w, BAR, FD]} color={F} />}
      <Bar p={[0, sill + riser / 2, 0]} s={[iw, riser, FD - 0.02]} color={p.o.color ?? FRAME_DARK} />
      {h > riser + 0.03 && <Bar p={[0, sill + riser + 0.015, 0]} s={[iw, 0.03, FD]} color={F} />}
      {lowTop - glassBot > 0.02 && (
        <mesh material={glass} position={[0, (glassBot + lowTop) / 2, 0]}>
          <planeGeometry args={[iw, lowTop - glassBot]} />
        </mesh>
      )}
      {transomY < top && (
        <>
          <Bar p={[0, transomY, 0]} s={[iw, BAR, FD]} color={F} />
          {upTop - transomY - BAR / 2 > 0.02 && !clipped && (
            <mesh material={glass} position={[0, (transomY + BAR / 2 + upTop) / 2, 0]}>
              <planeGeometry args={[iw, upTop - transomY - BAR / 2]} />
            </mesh>
          )}
        </>
      )}
      {Array.from({ length: np - 1 }, (_, i) => {
        const y0 = sill + riser;
        return <Bar key={i} p={[-iw / 2 + (iw * (i + 1)) / np, (y0 + mullTop) / 2, 0]} s={[0.04, mullTop - y0, 0.06]} color={F} />;
      })}
    </group>
  );
}

export default function WindowStyles(p: StyleProps) {
  switch (styleOf(p.o)) {
    case "picture":
      return <Picture p={p} />;
    case "highWindow":
      return <Picture p={p} high />;
    case "sliding":
      return <Sliding p={p} />;
    case "tiltTurn":
      return <TiltTurn p={p} />;
    case "bay":
      return <Bay p={p} />;
    case "arched":
      return <Arched p={p} />;
    case "round":
      return <Round p={p} />;
    case "glassBlock":
      return <GlassBlock p={p} />;
    case "shopfront":
      return <Shopfront p={p} />;
    default:
      return null; // casement / twin: the legacy Window draws them
  }
}
