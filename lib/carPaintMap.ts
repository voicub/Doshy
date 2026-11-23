import { Box3, Color, MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type Material, type Mesh, type Object3D, type Texture } from "three";

type MatRole = "paint" | "glass" | "chrome" | "rubber" | "lamp" | "tail" | "plate" | "other";
type MatInfo = { key: string; name: string; color: string; role: MatRole; area: number; extent: number; metalness: number; roughness: number };
export type Finish = "gloss" | "metallic" | "matte";
type InstanceOptions = { paintKey?: string; color?: string; finish: Finish; keepOriginal: boolean; ghost: boolean };
type InstanceHandle = { lamps: MeshStandardMaterial[]; tails: MeshStandardMaterial[]; plates: Mesh[]; dispose(): void };

/** Same numbers as PAINT in components/scene/carMaterials.ts (lib must not import components). */
const PAINT: Record<Finish, { metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number }> = {
  gloss: { metalness: 0.55, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 },
  metallic: { metalness: 0.85, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 },
  matte: { metalness: 0.2, roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0.4 },
};
const PAINT_ENV = 1.2;
const GHOST_OPACITY = 0.22;

type Loose = Material & { color?: Color; map?: Texture | null; metalness?: number; roughness?: number; transmission?: number };
const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true;
const materialsOf = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material]);

/** Stable identity of every distinct material under root: its name, or `#<n>` (n = order of first sight) when unnamed or a repeated name. */
function materialKeys(root: Object3D): Map<Material, string> {
  const keys = new Map<Material, string>();
  const used = new Set<string>();
  root.traverse((o) => {
    if (!isMesh(o)) return;
    for (const m of materialsOf(o)) {
      if (keys.has(m)) continue;
      const key = m.name && !used.has(m.name) ? m.name : `#${keys.size}`;
      used.add(key);
      keys.set(m, key);
    }
  });
  return keys;
}

const NAME_ROLES: [MatRole, RegExp][] = [
  ["plate", /plate|licen[cs]e|number/],
  ["tail", /tail|brake ?light|rear ?(light|lamp)/],
  ["lamp", /head ?(light|lamp)|lamp|\blights?\b(?! ?(gr[ae]y|blue|green|brown|silver))|lens|\bled\b/],
  ["glass", /glass|window|windshield|windscreen/],
  ["paint", /paint|body|exterior|\black|\blak|karoserie/],
  ["chrome", /chrome|metal(?!lic)|mirror|trim|\brim|alloy/],
  ["rubber", /tyre|tire|rubber|black/],
];

function roleOf(material: Material): MatRole {
  const m = material as Loose;
  const name = m.name.toLowerCase();
  for (const [role, re] of NAME_ROLES) if (re.test(name)) return role;
  if ((m.transmission ?? 0) > 0.1 || m.opacity < 0.9) return "glass";
  const metal = m.metalness ?? 0;
  const rough = m.roughness ?? 1;
  if (metal > 0.85 && rough < 0.35) return "chrome";
  const c = m.color;
  if (c && 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.03 && rough > 0.5) return "rubber";
  return "other";
}

/** World surface area and bounding box per material (a multi-material mesh is split by its geometry groups). */
function surfaces(root: Object3D): Map<Material, { area: number; box: Box3 }> {
  const out = new Map<Material, { area: number; box: Box3 }>();
  root.updateWorldMatrix(true, true);
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  root.traverse((o) => {
    if (!isMesh(o)) return;
    const pos = o.geometry.getAttribute("position");
    if (!pos) return;
    const index = o.geometry.getIndex();
    const mats = materialsOf(o);
    const ranges = Array.isArray(o.material) ? o.geometry.groups.map((g) => ({ start: g.start, count: g.count, mat: mats[g.materialIndex ?? 0] })) : [{ start: 0, count: Infinity, mat: mats[0] }];
    for (const r of ranges) {
      if (!r.mat) continue;
      const entry = out.get(r.mat) ?? { area: 0, box: new Box3() };
      const end = Math.min(index ? index.count : pos.count, r.start + r.count);
      for (let i = r.start; i + 2 < end; i += 3) {
        const at = (k: number) => (index ? index.getX(i + k) : i + k);
        a.fromBufferAttribute(pos, at(0)).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, at(1)).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, at(2)).applyMatrix4(o.matrixWorld);
        entry.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
        entry.area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      out.set(r.mat, entry);
    }
  });
  return out;
}

/** Every distinct material under `root`, role guessed from its name first, then from its numbers; biggest surface first. */
export function listMaterials(root: Object3D): MatInfo[] {
  const keys = materialKeys(root);
  const found = surfaces(root);
  const whole = new Box3();
  for (const s of found.values()) whole.union(s.box);
  const total = whole.getSize(new Vector3());
  const size = new Vector3();
  return [...keys]
    .map(([m, key]): MatInfo => {
      const l = m as Loose;
      const s = found.get(m);
      s?.box.getSize(size);
      // how much of the car's length, width and height this material's meshes span (geometric mean, 0..1)
      const extent = s ? Math.cbrt((size.x / (total.x || 1)) * (size.y / (total.y || 1)) * (size.z / (total.z || 1))) : 0;
      return { key, name: m.name, color: l.color ? `#${l.color.getHexString()}` : "#ffffff", role: roleOf(m), area: s?.area ?? 0, extent, metalness: l.metalness ?? 0, roughness: l.roughness ?? 1 };
    })
    .sort((x, y) => y.area - x.area);
}

const NOT_PAINT: MatRole[] = ["glass", "chrome", "rubber", "lamp", "tail", "plate"];

/** Exterior panels cover a lot of surface AND span the whole car; a clear colour is a bonus (silver, white and black cars still work). */
function paintScore(i: MatInfo): number {
  const c = new Color(i.color);
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  return i.area * i.extent ** 2 * (1 + Math.min(1, 3 * chroma));
}

/** Key of the material to recolour: the best-scoring paint-named material, else the best-scoring one that is not glass/chrome/rubber/lamp/plate. */
export function guessPaint(infos: MatInfo[]): string | undefined {
  const named = infos.filter((i) => i.role === "paint");
  const pool = named.length ? named : infos.filter((i) => !NOT_PAINT.includes(i.role));
  return pool.reduce<MatInfo | undefined>((best, i) => (!best || paintScore(i) > paintScore(best) ? i : best), undefined)?.key;
}

function physicalFrom(orig: Material): MeshPhysicalMaterial {
  if (orig instanceof MeshPhysicalMaterial) return orig.clone();
  const m = new MeshPhysicalMaterial();
  if (orig instanceof MeshStandardMaterial) {
    MeshStandardMaterial.prototype.copy.call(m, orig);
    m.defines = { STANDARD: "", PHYSICAL: "" }; // the standard copy drops PHYSICAL: clearcoat and the physical shading would silently not compile in
    return m;
  }
  const l = orig as Loose;
  m.name = orig.name;
  m.side = orig.side;
  if (l.color) m.color.copy(l.color);
  m.map = l.map ?? null;
  return m;
}

const colourful = new WeakMap<Texture, boolean>();
/** Browser only: does the texture carry real colour (so tinting it would not give the colour asked for)? Unknown = no. */
function isColourful(t: Texture): boolean {
  if (typeof document === "undefined") return false;
  const known = colourful.get(t);
  if (known !== undefined) return known;
  let result = false;
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 8;
    const g = cv.getContext("2d");
    if (g) {
      g.drawImage(t.image as CanvasImageSource, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data;
      let sat = 0;
      for (let i = 0; i < d.length; i += 4) {
        const hi = Math.max(d[i], d[i + 1], d[i + 2]);
        sat += hi ? (hi - Math.min(d[i], d[i + 1], d[i + 2])) / hi : 0;
      }
      result = sat / 64 > 0.25;
    }
  } catch {
    result = false; // compressed/data textures cannot be drawn: keep the map
  }
  colourful.set(t, result);
  return result;
}

function paintCopy(orig: Material, o: InstanceOptions): MeshPhysicalMaterial {
  const m = physicalFrom(orig);
  if (o.keepOriginal) return m;
  Object.assign(m, PAINT[o.finish]);
  m.metalnessMap = null;
  m.roughnessMap = null;
  m.envMapIntensity = PAINT_ENV;
  if (o.color) {
    m.color.set(o.color);
    if (m.map && isColourful(m.map)) m.map = null;
  }
  return m;
}

function emissiveCopy(orig: Material, role: "lamp" | "tail"): MeshStandardMaterial {
  const l = orig as Loose;
  const m = orig instanceof MeshStandardMaterial ? (orig.clone() as MeshStandardMaterial) : new MeshStandardMaterial({ name: orig.name, color: l.color ?? new Color("#ffffff"), map: l.map ?? null, side: orig.side, transparent: orig.transparent, opacity: orig.opacity });
  const own = m.color;
  const hsl = { h: 0, s: 0, l: 0 };
  own.getHSL(hsl);
  if (role === "tail") m.emissive.set(hsl.s > 0.4 && hsl.l > 0.15 ? own : "#ff2a2a");
  else m.emissive.set(hsl.l > 0.6 ? own : "#fff1d6");
  m.emissiveIntensity = 0;
  m.toneMapped = false;
  return m;
}

/**
 * `root` is a clone of a template that shares geometry and materials. Only the materials that must differ get a copy
 * (paint, lamps, tails, and everything when ghosted); the rest stay shared. dispose() frees the copies only.
 */
export function prepareInstance(root: Object3D, opts: InstanceOptions): InstanceHandle {
  const keys = materialKeys(root);
  const used = new Map<Material, Material>();
  const copies = new Set<Material>();
  const lamps: MeshStandardMaterial[] = [];
  const tails: MeshStandardMaterial[] = [];
  const plates: Mesh[] = [];

  const resolve = (orig: Material): Material => {
    const hit = used.get(orig);
    if (hit) return hit;
    const role = roleOf(orig);
    let m = orig;
    if (opts.paintKey !== undefined && keys.get(orig) === opts.paintKey) m = paintCopy(orig, opts);
    else if (role === "lamp" || role === "tail") {
      const e = emissiveCopy(orig, role);
      (role === "lamp" ? lamps : tails).push(e);
      m = e;
    }
    if (opts.ghost && m === orig) m = orig.clone();
    if (m !== orig) copies.add(m);
    if (opts.ghost) {
      m.transparent = true;
      m.opacity = GHOST_OPACITY;
      m.depthWrite = false;
    }
    used.set(orig, m);
    return m;
  };

  root.traverse((o) => {
    if (!isMesh(o)) return;
    if (materialsOf(o).some((m) => roleOf(m) === "plate")) plates.push(o);
    o.material = Array.isArray(o.material) ? o.material.map(resolve) : resolve(o.material);
  });

  return { lamps, tails, plates, dispose: () => copies.forEach((m) => m.dispose()) };
}
