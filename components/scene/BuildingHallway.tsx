"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, SRGBColorSpace, type Group, type MeshStandardMaterial } from "three";
import { WALL_CUT_H, WALL_H } from "@/lib/geometry";
import { HALL_WALL, hallwayOf, type HallFeature, type Hallway } from "@/lib/hallway";
import { SLAB_T } from "@/lib/levels";
import { WALLS, faceTint, wallFaces, wallStyleOf } from "@/lib/materials";
import { useStore } from "@/lib/store";
import { tiledTexture } from "@/lib/textures";
import { useKnobs } from "@/lib/quality";
import { FLOOR_SURFACE, WALL_SURFACE, type Surface } from "@/lib/shellLook";
import BoxInstances, { type BoxSpec } from "./BoxInstances";
import { WALL_EDGE, shellBox } from "./shellGeometry";
import { surfaceMaterial } from "./shellMaterials";
import { useIsoSink, useIsoZone } from "./isoState";
import { useCutaway } from "./levelState";
import { live } from "./skyLive";

const FLOOR_T = 0.06; // the flat's floor thickness: the corridor floor lines up with it
const PAINT = "#ece7dc"; // common-area walls
const DADO = "#a9b3a4"; // sage lower band
const RAIL = "#d9d2c4";
const SKIRT = "#8b8479";
const CAP = "#23262e"; // dark wall top, like the flat's walls
const CONCRETE = "#8d8a84";
const FLOOR_TINT = "#c9c4ba";
const DOORS = ["#5b4332", "#34414d", "#6b6a62"];
const BRASS = "#c9a95a";
const DADO_H = 1.05;
const NONE = () => null;

/** A small texture with centred text, drawn once. */
function label(text: string, fg: string, bg: string, aspect: number) {
  const c = document.createElement("canvas");
  c.height = 64;
  c.width = Math.round(64 * aspect);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `700 ${Math.round(c.height * 0.62)}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A flat plate with text on it, facing local +z. `glow` > 0 makes the text itself emissive (an exit sign). */
function Plate({ text, w, h, fg, bg, glow = 0 }: { text: string; w: number; h: number; fg: string; bg: string; glow?: number }) {
  const tex = useMemo(() => label(text, fg, bg, w / h), [text, fg, bg, w, h]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh raycast={NONE}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.6} {...(glow ? { emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: glow, toneMapped: false } : {})} />
    </mesh>
  );
}

/** Number plate and peephole on the outside of the flat's own door; lives in the door leaf's frame so it swings with it. `side` = which way (local z) the corridor lies. */
export function EntranceDoorOrnament({ x, y0, side }: { x: number; y0: number; side: 1 | -1 }) {
  return (
    <group position={[x, y0, side * 0.0215]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
      <group position={[0, 1.72, 0]}>
        <Plate text="5" w={0.14} h={0.09} fg="#23262e" bg={BRASS} />
      </group>
      <mesh position={[0, 1.5, -0.0015]} rotation={[Math.PI / 2, 0, 0]} raycast={NONE}>
        <cylinderGeometry args={[0.013, 0.013, 0.012, 14]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0, 1.5, 0.0045]} raycast={NONE}>
        <circleGeometry args={[0.006, 10]} />
        <meshStandardMaterial color="#111318" roughness={0.2} />
      </mesh>
    </group>
  );
}

/** An emissive box that brightens at dusk: corridor lights and the lift indicator. Emissive only, so it adds no light to the scene. */
function Glow({ p, s, color, base = 0.9, boost = 1.6 }: { p: [number, number, number]; s: [number, number, number]; color: string; base?: number; boost?: number }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.emissiveIntensity = base + (1 - live.daylight) * boost;
  });
  return (
    <mesh position={p} raycast={NONE}>
      <boxGeometry args={s} />
      <meshStandardMaterial ref={mat} color="#f5f1e8" emissive={color} emissiveIntensity={base} toneMapped={false} />
    </mesh>
  );
}

const Box = ({ p, s, color, rough = 0.8, metal = 0 }: { p: [number, number, number]; s: [number, number, number]; color: string; rough?: number; metal?: number }) => (
  <mesh position={p} castShadow receiveShadow raycast={NONE}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={color} roughness={rough} metalness={metal} />
  </mesh>
);

/** A door set on a wall face: casing, leaf, handle, number plate and a peephole. Local +z points out of the wall into the corridor; origin on the wall face at the floor. */
function WallDoor({ color, number, mat }: { color: string; number: number; mat?: boolean }) {
  return (
    <group>
      <Box p={[0, 1.07, 0.02]} s={[1.02, 2.14, 0.04]} color={RAIL} />
      <Box p={[0, 1.03, 0.045]} s={[0.9, 2.06, 0.03]} color={color} rough={0.7} />
      <Box p={[0.32, 1.0, 0.07]} s={[0.1, 0.025, 0.04]} color={BRASS} rough={0.35} metal={0.6} />
      <group position={[0, 1.68, 0.062]}>
        <Plate text={String(number)} w={0.14} h={0.09} fg="#e8e4dc" bg="#2a2d33" />
      </group>
      <mesh position={[0, 1.5, 0.062]} rotation={[Math.PI / 2, 0, 0]} raycast={NONE}>
        <cylinderGeometry args={[0.012, 0.012, 0.01, 12]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.7} />
      </mesh>
      {mat && <Box p={[0, 0.0075, 0.4]} s={[0.8, 0.015, 0.5]} color="#3a3a3a" rough={1} />}
    </group>
  );
}

function Lift() {
  return (
    <group>
      <Box p={[0, 1.12, 0.025]} s={[1.4, 2.24, 0.05]} color="#3a3d44" rough={0.5} metal={0.4} />
      {[-1, 1].map((k) => (
        <Box key={k} p={[k * 0.265, 1.03, 0.06]} s={[0.51, 2.06, 0.03]} color="#b7bcc2" rough={0.32} metal={0.75} />
      ))}
      <Glow p={[0, 2.3, 0.045]} s={[0.22, 0.08, 0.02]} color="#ffb347" base={1.2} boost={0.8} />
      <Box p={[0.88, 1.1, 0.01]} s={[0.1, 0.24, 0.02]} color="#2a2d33" rough={0.5} metal={0.4} />
      <Glow p={[0.88, 1.15, 0.025]} s={[0.03, 0.03, 0.01]} color="#7be0ff" base={1.2} boost={0.8} />
      <Glow p={[0.88, 1.06, 0.025]} s={[0.03, 0.03, 0.01]} color="#7be0ff" base={1.2} boost={0.8} />
    </group>
  );
}

function Extinguisher() {
  return (
    <group>
      <Box p={[0, 1.2, 0.07]} s={[0.3, 0.66, 0.14]} color="#b3262c" rough={0.5} />
      <Box p={[0, 1.2, 0.145]} s={[0.2, 0.52, 0.01]} color="#dfe8ee" rough={0.2} />
      <Box p={[0, 1.22, 0.152]} s={[0.07, 0.4, 0.01]} color="#c93a3a" rough={0.4} />
    </group>
  );
}

function Mailboxes() {
  return (
    <group>
      <Box p={[0, 1.1, 0.045]} s={[1.14, 0.34, 0.09]} color="#7b8794" rough={0.45} metal={0.5} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={i} position={[-0.47 + i * 0.188, 1.1, 0.092]}>
          <Box p={[0, 0.05, 0]} s={[0.15, 0.012, 0.01]} color="#15171b" />
          <Box p={[0, -0.07, 0]} s={[0.1, 0.03, 0.006]} color="#e8e4dc" />
        </group>
      ))}
    </group>
  );
}

/** Stairwell fire door with its running EXIT sign. Local +z points into the corridor. */
function StairwellDoor() {
  return (
    <group>
      <Box p={[0, 1.07, 0.02]} s={[1.07, 2.14, 0.04]} color="#4a4f57" rough={0.5} metal={0.3} />
      <Box p={[0, 1.03, 0.045]} s={[0.95, 2.06, 0.03]} color="#79828c" rough={0.5} metal={0.35} />
      <Box p={[0, 1.55, 0.065]} s={[0.4, 0.6, 0.01]} color="#6f8794" rough={0.15} />
      <Box p={[0.3, 1.0, 0.07]} s={[0.04, 0.5, 0.03]} color="#c9ccd1" rough={0.35} metal={0.6} />
      <group position={[0, 2.34, 0.05]}>
        <Plate text="EXIT" w={0.46} h={0.17} fg="#5dff9c" bg="#06240f" glow={1.4} />
      </group>
    </group>
  );
}

/** A fixed window in the far end wall, so the corridor has daylight. */
function EndWindow() {
  return (
    <group>
      <Box p={[0, 1.5, 0.02]} s={[1.1, 1.3, 0.04]} color="#e8e4dc" />
      <mesh position={[0, 1.5, 0.045]} raycast={NONE}>
        <planeGeometry args={[0.94, 1.14]} />
        <meshStandardMaterial color="#a7c6d6" roughness={0.08} metalness={0.2} transparent opacity={0.55} />
      </mesh>
      <Box p={[0, 1.5, 0.05]} s={[0.04, 1.14, 0.02]} color="#e8e4dc" />
    </group>
  );
}

function Feature({ f, h }: { f: HallFeature; h: Hallway }) {
  const zf = h.face + h.depth;
  const zc = h.face + h.depth / 2;
  const y = FLOOR_T;
  if (f.wall === "far") {
    return (
      <group position={[f.x, y, zf]} rotation={[0, Math.PI, 0]}>
        {f.kind === "lift" ? <Lift /> : <WallDoor color={DOORS[((f.number ?? 4) / 2) % DOORS.length | 0]} number={f.number ?? 4} mat={f.mat} />}
      </group>
    );
  }
  if (f.wall === "near") {
    return <group position={[f.x, y, h.face]}>{f.kind === "extinguisher" ? <Extinguisher /> : <Mailboxes />}</group>;
  }
  const xe = f.x === 1 ? h.x1 : h.x0;
  return (
    <group position={[xe, y, zc]} rotation={[0, -f.x * (Math.PI / 2), 0]}>
      {f.kind === "stairwell" ? <StairwellDoor /> : <EndWindow />}
    </group>
  );
}

/** Slim emissive light strips along the top of the far wall. */
function Lights({ h }: { h: Hallway }) {
  const zf = h.face + h.depth;
  const L = h.x1 - h.x0;
  const strips = L >= 5 ? 2 : 1;
  return (
    <>
      {Array.from({ length: strips }, (_, i) => (
        <Glow key={i} p={[h.x0 + (L * (i + 0.5)) / strips, 2.5, zf - 0.04]} s={[Math.min(1.4, L / strips - 0.6), 0.04, 0.08]} color="#fff0d0" />
      ))}
    </>
  );
}

/** The corridor's own walls, floor and slab. */
function Shell({ h, cut }: { h: Hallway; cut: boolean }) {
  const plan = useStore((s) => s.plan);
  const H = cut ? WALL_CUT_H : WALL_H;
  const zf = h.face + h.depth;
  const zEnd = zf + HALL_WALL;
  const L = h.x1 - h.x0;
  const cx = (h.x0 + h.x1) / 2;
  const style = useMemo(() => {
    const w = plan.walls.find((x) => x.id === h.wallId);
    const f = w ? wallFaces(w)[h.facade] : { style: "plaster" as const };
    const s = wallStyleOf(f.style);
    return { tint: faceTint(f), kind: WALLS[s].plain || s === "glass" ? null : s };
  }, [plan.walls, h.wallId, h.facade]);
  const k = useKnobs();
  const surf = k.textures > 0 && style.kind ? WALL_SURFACE[style.kind] : undefined; // brick/plaster/... as real surfaces with metric uvs
  const floorSurf = k.textures > 0 ? FLOOR_SURFACE.terrazzo : undefined;
  const farTex = useMemo(() => (style.kind && !surf ? tiledTexture(style.kind, L + 2 * HALL_WALL, H) : null), [style.kind, surf, L, H]);
  const capTex = useMemo(() => (style.kind && !surf ? tiledTexture(style.kind, h.depth, H) : null), [style.kind, surf, h.depth, H]);
  const floorTex = useMemo(() => (floorSurf ? null : tiledTexture("terrazzo", L + 2 * HALL_WALL, zEnd - h.face, h.x0, 0)), [floorSurf, L, zEnd, h.face, h.x0]);
  useEffect(() => () => farTex?.dispose(), [farTex]);
  useEffect(() => () => capTex?.dispose(), [capTex]);
  useEffect(() => () => floorTex?.dispose(), [floorTex]);

  const cd = zEnd - h.face;
  const cz = (h.face + zEnd) / 2;
  const tile = (s?: Surface) => () => ({ tile: s?.tile ?? 1, swap: s?.swap });
  const far = useMemo(() => (surf ? shellBox(L + 2 * HALL_WALL, H, HALL_WALL, k.bevelSegments, WALL_EDGE, [cx, H / 2, zf + HALL_WALL / 2], tile(surf)) : null), [surf, L, H, cx, zf, k.bevelSegments]);
  const ends = useMemo(() => (surf ? ([1, -1] as const).map((s) => shellBox(HALL_WALL, H, h.depth, k.bevelSegments, WALL_EDGE, [s === 1 ? h.x1 + HALL_WALL / 2 : h.x0 - HALL_WALL / 2, H / 2, (h.face + zf) / 2], tile(surf))) : []), [surf, H, h.depth, h.x0, h.x1, h.face, zf, k.bevelSegments]);
  const floor = useMemo(() => (floorSurf ? shellBox(L + 2 * HALL_WALL, FLOOR_T, cd, k.bevelSegments, 0.008, [cx, FLOOR_T / 2, cz], tile(floorSurf)) : null), [floorSurf, L, cd, cx, cz, k.bevelSegments]);
  useEffect(() => () => { far?.dispose(); ends.forEach((g) => g.dispose()); floor?.dispose(); }, [far, ends, floor]);
  const facadeMat = useMemo(() => (surf ? surfaceMaterial(surf, style.tint, 0.9, k) : null), [surf, style.tint, k]);
  const floorMat = useMemo(() => (floorSurf ? surfaceMaterial(floorSurf, FLOOR_TINT, 0.4, k) : null), [floorSurf, k]);

  const facade = (i: number, map: typeof farTex) => (facadeMat ? <primitive key={i} object={facadeMat} attach={`material-${i}`} /> : <meshStandardMaterial key={i} attach={`material-${i}`} map={map} color={style.tint} roughness={0.9} />);
  const paint = (i: number) => <meshStandardMaterial key={i} attach={`material-${i}`} color={PAINT} roughness={0.92} />;
  const cap = <meshStandardMaterial attach="material-2" color={CAP} roughness={0.7} />;
  const deco = useMemo(() => {
    const t = 0.012;
    const skirt: BoxSpec[] = [];
    const dado: BoxSpec[] = [];
    const rail: BoxSpec[] = [];
    const upper: BoxSpec[] = [];
    const band = (b: BoxSpec, sx: number, sz: number) => {
      skirt.push({ ...b, y: 0.05, sy: 0.1, sx: sx + 0.01, sz: sz + 0.01 });
      dado.push({ ...b, y: (0.1 + DADO_H) / 2, sy: DADO_H - 0.1 });
      rail.push({ ...b, y: DADO_H + 0.015, sy: 0.03, sx: sx + 0.016, sz: sz + 0.016 });
    };
    const at = (x: number, z: number, sx: number, sz: number): BoxSpec => ({ x, y: 0, z, sx, sy: 0, sz });
    band(at(cx, zf - t / 2, L, t), L, t); // far wall
    for (const [x, s] of [[h.x1, -1], [h.x0, 1]] as const) band(at(x + (s * t) / 2, h.face + h.depth / 2, t, h.depth), t, h.depth); // end walls
    for (const [a, b] of h.spans) {
      band(at((a + b) / 2, h.face + t / 2, b - a, t), b - a, t); // the flat's wall, between its openings
      upper.push({ x: (a + b) / 2, y: DADO_H + 0.03 + (H - DADO_H - 0.03) / 2, z: h.face + t / 2, sx: b - a, sy: Math.max(0.001, H - DADO_H - 0.03), sz: t });
    }
    return { skirt, dado, rail, upper };
  }, [h, cx, zf, L, H]);

  return (
    <>
      {/* floor, and the slab it rests on when the flat is raised */}
      <mesh position={[cx, FLOOR_T / 2, cz]} receiveShadow raycast={NONE}>
        {floor ? <primitive object={floor} attach="geometry" /> : <boxGeometry args={[L + 2 * HALL_WALL, FLOOR_T, cd]} />}
        {[0, 1, 3, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color={CONCRETE} roughness={0.9} />)}
        {floorMat ? <primitive object={floorMat} attach="material-2" /> : <meshStandardMaterial attach="material-2" map={floorTex} color={FLOOR_TINT} roughness={0.4} />}
      </mesh>
      {h.elevation > 0.01 && (
        <mesh position={[cx, -SLAB_T / 2, (h.face + zEnd) / 2]} castShadow receiveShadow raycast={NONE}>
          <boxGeometry args={[L + 2 * HALL_WALL, SLAB_T, cd]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.9} />
        </mesh>
      )}
      {/* far wall: facade outside (+z), common-area paint inside */}
      <mesh position={[cx, H / 2, zf + HALL_WALL / 2]} castShadow receiveShadow raycast={NONE}>
        {far ? <primitive object={far} attach="geometry" /> : <boxGeometry args={[L + 2 * HALL_WALL, H, HALL_WALL]} />}
        {[0, 1, 3].map((i) => facade(i, farTex))}
        {facade(4, farTex)}
        {cap}
        {paint(5)}
      </mesh>
      {/* end walls: inside face looks into the corridor */}
      {([1, -1] as const).map((s) => (
        <mesh key={s} position={[s === 1 ? h.x1 + HALL_WALL / 2 : h.x0 - HALL_WALL / 2, H / 2, (h.face + zf) / 2]} castShadow receiveShadow raycast={NONE}>
          {ends[s === 1 ? 0 : 1] ? <primitive object={ends[s === 1 ? 0 : 1]} attach="geometry" /> : <boxGeometry args={[HALL_WALL, H, h.depth]} />}
          {facade(s === 1 ? 0 : 1, capTex)}
          {paint(s === 1 ? 1 : 0)}
          {cap}
          {[3, 4, 5].map((i) => facade(i, capTex))}
        </mesh>
      ))}
      <BoxInstances boxes={deco.upper} color={PAINT} roughness={0.92} shadow={false} />
      <BoxInstances boxes={deco.dado} color={DADO} roughness={0.92} shadow={false} />
      <BoxInstances boxes={deco.rail} color={RAIL} shadow={false} />
      <BoxInstances boxes={deco.skirt} color={SKIRT} shadow={false} />
    </>
  );
}

/**
 * The shared building corridor outside a flat's front door (Building.entry "hallway"): part of the building shell, not an item, so it never takes
 * furniture, rooms or area. Mounted inside the lowest level so it lowers with the walls in cut-away.
 */
export default function BuildingHallway() {
  const plan = useStore((s) => s.plan);
  const cut = useCutaway();
  const ref = useRef<Group>(null);
  useIsoSink(ref, !!useIsoZone(), !cut); // Room mode: the corridor sinks away (its lamps, only there when the walls are up, stay in the graph)
  const h = hallwayOf(plan);
  if (!h) return null;
  return (
    <group ref={ref} position={[h.x, 0, h.y]} rotation={[0, Math.atan2(h.nx, h.ny), 0]}>
      <Shell h={h} cut={cut} />
      {!cut && (
        <>
          {h.features.map((f, i) => <Feature key={i} f={f} h={h} />)}
          <Lights h={h} />
        </>
      )}
    </group>
  );
}
