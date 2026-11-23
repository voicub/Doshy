import { Box3, BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, Source, Vector3, type InstancedMesh, type Material, type Object3D, type Texture } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
// @ts-expect-error @types/three has no declaration for this module
import { MeshoptSimplifier as MeshoptModule } from "three/examples/jsm/libs/meshopt_simplifier.module.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isRecord } from "./guards.ts";

/** The parts of three's bundled meshoptimizer simplifier used here. */
const MeshoptSimplifier: {
  ready: Promise<void>;
  generatePositionRemap(positions: Float32Array, stride: number): Uint32Array;
  simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number, flags?: string[]): [Uint32Array, number];
} = MeshoptModule;

export const DEFAULT_BUDGET = { near: 60000, far: 8000, maxTexture: 2048 };
export type Progress = (fraction: number, step: string) => void;
type OptimiseReport = { trianglesBefore: number; near: number; far: number; materials: number; droppedParts: number; texturesResized: number };

type Part = { geo: BufferGeometry; mat: Material; hint: string; box: Box3; tris: number };

const HIDDEN = /engine|motor|seat|interior|dashboard|steering|chassis|underbody|undercarriage|suspension|exhaust|brake[ _-]?(disc|disk|rotor|caliper)/;
const KEEP = /(?<!steering[ _-]?)wheel|tyre|tire|rim|lamp|light|mirror|handle|glass|window|plate|licen|body|paint|logo|badge|grill/;
const JUNK = /ground|floor|shadow|backdrop|studio|turntable|platform|\bstand\b|plane/;
const FACET = /glass|window|windshield|windscreen|lamp|light|lens/;
const TEXTURE_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"];
const isTexture = (v: unknown): v is Texture => isRecord(v) && v.isTexture === true;
const triangles = (g: BufferGeometry) => (g.getIndex()?.count ?? 0) / 3; // every geometry here is indexed (bake / mergeVertices)
const MIN_TRIS = 12;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const diagonal = (b: Box3) => b.min.distanceTo(b.max);
const unionBox = (parts: Part[]) => parts.reduce((b, p) => b.union(p.box), new Box3());

export const countTriangles = (o: Object3D): number => {
  let n = 0;
  o.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += ((g.index ? g.index.count : g.getAttribute("position").count) / 3) * ((c as InstancedMesh).isInstancedMesh ? (c as InstancedMesh).count : 1);
  });
  return Math.floor(n);
};

/** Triangles [start, start+count) of `src` as a compact, indexed copy with world matrix `m` baked in; only position, normal, uv. */
function bake(src: BufferGeometry, m: Matrix4, start: number, count: number): BufferGeometry | null {
  const pos = src.getAttribute("position");
  const nor = src.getAttribute("normal");
  const uv = src.getAttribute("uv");
  const idx = src.getIndex();
  const n = Math.floor((Math.min(idx ? idx.count : pos.count, start + count) - start) / 3) * 3;
  if (n <= 0) return null;
  const remap = new Int32Array(pos.count).fill(-1);
  const order: number[] = [];
  const index = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const v = idx ? idx.getX(start + i) : start + i;
    if (remap[v] < 0) remap[v] = order.push(v) - 1;
    index[i] = remap[v];
  }
  if (m.determinant() < 0) {
    for (let i = 0; i < n; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  const normalMatrix = new Matrix3().getNormalMatrix(m);
  const [p, nn, u] = [new Float32Array(order.length * 3), new Float32Array(order.length * 3), new Float32Array(order.length * 2)];
  const v3 = new Vector3();
  order.forEach((from, to) => {
    v3.fromBufferAttribute(pos, from).applyMatrix4(m).toArray(p, to * 3);
    if (nor) v3.fromBufferAttribute(nor, from).applyMatrix3(normalMatrix).normalize().toArray(nn, to * 3);
    if (uv) {
      u[to * 2] = uv.getX(from);
      u[to * 2 + 1] = uv.getY(from);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(p, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(nn, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(u, 2)); // zeros when missing, so every part has the same attribute set
  geo.setIndex(new BufferAttribute(index, 1));
  if (!nor) geo.computeVertexNormals();
  return geo;
}

/** Visible triangle meshes with their world transforms baked in. The input scene is only read. */
function collect(scene: Object3D): Part[] {
  const parts: Part[] = [];
  const walk = (o: Object3D, parent: Matrix4) => {
    if (!o.visible) return;
    const world = parent.clone().multiply(o.matrixAutoUpdate ? new Matrix4().compose(o.position, o.quaternion, o.scale) : o.matrix);
    const mesh = o as Mesh;
    if (mesh.isMesh && mesh.geometry.getAttribute("position")) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const ranges = Array.isArray(mesh.material) ? mesh.geometry.groups.map((g) => ({ start: g.start, count: g.count, mat: mats[g.materialIndex ?? 0] })) : [{ start: 0, count: Infinity, mat: mats[0] }];
      const inst = o as InstancedMesh;
      const matrices = inst.isInstancedMesh
        ? Array.from({ length: inst.count }, (_, i) => {
            const t = new Matrix4();
            inst.getMatrixAt(i, t);
            return world.clone().multiply(t);
          })
        : [world];
      for (const m of matrices) {
        for (const r of ranges) {
          const geo = r.mat ? bake(mesh.geometry, m, r.start, r.count) : null;
          if (!geo || !r.mat) continue;
          geo.computeBoundingBox();
          parts.push({ geo, mat: r.mat, hint: `${mesh.name} ${r.mat.name}`.toLowerCase(), box: geo.boundingBox as Box3, tris: triangles(geo) });
        }
      }
    }
    for (const c of o.children) walk(c, world);
  };
  walk(scene, new Matrix4());
  return parts;
}

/** Parts that do not belong on the street: ground/shadow planes, hidden mechanics, screws, the inside of a heavy model. */
function dropHidden(parts: Part[], trianglesBefore: number): Part[] {
  const rest = parts.filter((p) => !JUNK.test(p.hint));
  if (!rest.length) return parts;
  const restBox = unionBox(rest);
  const restSize = restBox.getSize(new Vector3());
  const size = new Vector3();
  const isScenery = (p: Part) => {
    if (!JUNK.test(p.hint)) return false;
    p.box.getSize(size);
    return Math.min(size.x, size.y, size.z) < 0.02 * diagonal(restBox) || size.x > 1.5 * restSize.x || size.y > 1.5 * restSize.y || size.z > 1.5 * restSize.z;
  };
  const kept = parts.filter((p) => !isScenery(p));
  const whole = unionBox(kept);
  const central = new Box3().setFromCenterAndSize(whole.getCenter(new Vector3()), whole.getSize(new Vector3()).multiplyScalar(0.7));
  return kept.filter((p) => {
    if (KEEP.test(p.hint)) return true;
    if (HIDDEN.test(p.hint) || diagonal(p.box) < 0.015 * diagonal(whole)) return false;
    const m = p.mat as Material & { transmission?: number };
    const glassy = (m.transmission ?? 0) > 0.1 || m.opacity < 0.9;
    return !(trianglesBefore > 150000 && !glassy && central.containsBox(p.box));
  });
}

/** Per-mesh triangle goals: every mesh keeps the same share of its own size (never below its floor) so the total lands on `budget`. */
function allocate(tris: number[], floors: number[], budget: number): number[] {
  const total = (s: number) => tris.reduce((a, t, i) => a + Math.min(t, Math.max(floors[i], s * t)), 0);
  if (total(1) <= budget) return tris.slice();
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > budget) hi = mid;
    else lo = mid;
  }
  return tris.map((t, i) => Math.min(t, Math.max(floors[i], Math.round(lo * t))));
}

/**
 * A new geometry with about `targetTriangles` triangles, or the (welded) input itself when it is already that small.
 * Scanned cars come with split vertices (hard edges, uv seams, pieces cut at 65 535 vertices) and meshoptimizer then stalls at
 * 60-70 % of the triangles, so the simplifier works on a position-welded index. Every surviving corner then gets back the
 * normal/uv of the original vertex at that spot that best matches its triangle, so hard edges and uv seams survive.
 */
export async function simplifyGeometry(g: BufferGeometry, targetTriangles: number): Promise<BufferGeometry> {
  const welded = g.getIndex() ? g : mergeVertices(g);
  const index = welded.getIndex();
  if (!index) return welded; // mergeVertices always indexes; this only narrows the type
  const target = Math.max(1, Math.round(targetTriangles));
  if (target >= index.count / 3) return welded;
  await MeshoptSimplifier.ready;
  const pos = welded.getAttribute("position");
  const nor = welded.getAttribute("normal");
  const uv = welded.getAttribute("uv");
  const n = pos.count;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
  const same = MeshoptSimplifier.generatePositionRemap(positions, 3); // same[i] = first vertex at the position of vertex i
  const input = Uint32Array.from(index.array as ArrayLike<number>, (v) => same[v]);
  const [kept] = MeshoptSimplifier.simplify(input, positions, 3, target * 3, 1, ["Sparse"]);

  const start = new Uint32Array(n + 1); // vertices sharing a position, as a list per first vertex
  for (let i = 0; i < n; i++) start[same[i] + 1]++;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  const members = new Uint32Array(n);
  for (let i = 0; i < n; i++) members[fill[same[i]]++] = i;

  const slot = new Int32Array(n).fill(-1);
  const chosen: number[] = [];
  const outIndex = new Uint32Array(kept.length);
  const [a, b, c, fn, e1, e2] = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  for (let t = 0; t < kept.length; t += 3) {
    a.fromArray(positions, kept[t] * 3);
    b.fromArray(positions, kept[t + 1] * 3);
    c.fromArray(positions, kept[t + 2] * 3);
    fn.copy(e1.subVectors(b, a)).cross(e2.subVectors(c, a)).normalize();
    let first = -1;
    for (let k = 0; k < 3; k++) {
      const w = kept[t + k];
      let best = members[start[w]];
      let bestScore = -Infinity;
      for (let m = start[w]; m < start[w + 1]; m++) {
        const v = members[m];
        let score = nor ? nor.getX(v) * fn.x + nor.getY(v) * fn.y + nor.getZ(v) * fn.z : 0;
        if (uv && first >= 0) score -= 2 * Math.hypot(uv.getX(v) - uv.getX(first), uv.getY(v) - uv.getY(first));
        if (score > bestScore) [best, bestScore] = [v, score];
      }
      if (k === 0) first = best;
      if (slot[best] < 0) slot[best] = chosen.push(best) - 1;
      outIndex[t + k] = slot[best];
    }
  }
  const out = new BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const src = welded.getAttribute(name);
    if (!src) continue;
    const data = new Float32Array(chosen.length * src.itemSize);
    chosen.forEach((v, i) => {
      for (let k = 0; k < src.itemSize; k++) data[i * src.itemSize + k] = src.getComponent(v, k);
    });
    out.setAttribute(name, new Float32BufferAttribute(data, src.itemSize));
  }
  out.setIndex(new BufferAttribute(outIndex, 1));
  return out;
}

const lowerPow2 = (v: number, max: number) => Math.min(max, 2 ** Math.round(Math.log2(Math.max(1, v))));

/** Browser only: a copy of the texture drawn smaller; the original texture (and its image) stays untouched. */
function shrink(tex: Texture, max: number, cache: Map<Texture, Texture>, count: { n: number }): Texture {
  const hit = cache.get(tex);
  if (hit) return hit;
  const img = isRecord(tex.image) ? tex.image : null;
  const dim = (v: unknown) => (typeof v === "number" ? v : 0);
  const [w, h] = [dim(img?.naturalWidth) || dim(img?.width), dim(img?.naturalHeight) || dim(img?.height)];
  let out = tex;
  if (img && Math.max(w, h) > max) {
    const k = max / Math.max(w, h);
    const cv = document.createElement("canvas");
    cv.width = lowerPow2(w * k, max);
    cv.height = lowerPow2(h * k, max);
    try {
      const g = cv.getContext("2d");
      if (!g) throw new Error("no canvas");
      g.imageSmoothingQuality = "high";
      g.drawImage(tex.image as CanvasImageSource, 0, 0, cv.width, cv.height); // a non-drawable image (compressed texture) throws and is caught below
      out = tex.clone();
      out.source = new Source(cv);
      out.needsUpdate = true;
      count.n++;
    } catch {
      out = tex; // compressed or data textures cannot be drawn: keep the original
    }
  }
  cache.set(tex, out);
  return out;
}

/**
 * `scene`: a parsed glTF scene. Returns a Group with two child Groups, "near" and "far", one Mesh per material each,
 * in the source orientation and units. The input scene is not changed; unresized textures are shared with it.
 */
export async function optimiseCar(scene: Object3D, opts: Partial<typeof DEFAULT_BUDGET> = {}, onProgress?: Progress): Promise<{ root: Group; report: OptimiseReport }> {
  const budget = { ...DEFAULT_BUDGET, ...opts };
  const say = async (f: number, step: string) => {
    onProgress?.(f, step);
    await tick();
  };

  await say(0, "Reading the model");
  const all = collect(scene);
  const trianglesBefore = all.reduce((a, p) => a + p.tris, 0);

  await say(0.15, "Removing hidden parts");
  const parts = dropHidden(all, trianglesBefore);
  if (!parts.length) throw new Error("This model has no visible parts to show.");
  const modelDiag = diagonal(unionBox(parts));

  await say(0.25, "Merging");
  const byMat = new Map<Material, Part[]>();
  for (const p of parts) byMat.set(p.mat, [...(byMat.get(p.mat) ?? []), p]);
  const tolerance = Math.min(1e-3, Math.max(1e-6, 1e-4 * modelDiag));
  const items = [...byMat].map(([mat, ps]) => {
    const merged = ps.length === 1 ? ps[0].geo : mergeGeometries(ps.map((p) => p.geo));
    if (!merged) throw new Error("This model's parts could not be combined.");
    return { mat, facet: ps.some((p) => FACET.test(p.hint)), geo: mergeVertices(merged, tolerance) };
  });

  await say(0.4, "Simplifying");
  const trisOf = (gs: BufferGeometry[]) => gs.map(triangles);
  const simplifyAll = async (gs: BufferGeometry[], goals: number[], from: number, to: number) => {
    const out: BufferGeometry[] = [];
    for (let i = 0; i < gs.length; i++) {
      out.push(await simplifyGeometry(gs[i], goals[i]));
      await say(from + ((to - from) * (i + 1)) / gs.length, "Simplifying");
    }
    return out;
  };
  const nearTris = trisOf(items.map((i) => i.geo));
  const nearGoals = allocate(nearTris, items.map((it, i) => (it.facet ? Math.ceil(nearTris[i] / 2) : Math.min(MIN_TRIS, nearTris[i]))), budget.near);
  const nearGeo = await simplifyAll(items.map((i) => i.geo), nearGoals, 0.4, 0.65);
  const farTris = trisOf(nearGeo);
  const farGoals = allocate(farTris, farTris.map((t) => Math.min(MIN_TRIS, t)), budget.far);
  const farGeo = await simplifyAll(nearGeo, farGoals, 0.65, 0.8);

  await say(0.8, "Resizing pictures");
  const cache = new Map<Texture, Texture>();
  const count = { n: 0 };
  const materials = items.map(({ mat }) => {
    const m = mat.clone();
    if (isRecord(m)) {
      if ("vertexColors" in m) m.vertexColors = false; // colour attributes are not kept
      for (const slot of TEXTURE_SLOTS) {
        const t = m[slot];
        if (isTexture(t) && typeof document !== "undefined") m[slot] = shrink(t, budget.maxTexture, cache, count);
      }
    }
    return m;
  });

  await say(0.95, "Packing");
  const root = new Group();
  const [near, far] = [new Group(), new Group()];
  near.name = "near";
  far.name = "far";
  root.add(near, far);
  items.forEach(({ mat }, i) => {
    const name = mat.name || `part_${i}`;
    const nearMesh = new Mesh(nearGeo[i], materials[i]);
    nearMesh.name = name;
    near.add(nearMesh);
    farGeo[i].computeBoundingBox();
    const tiny = triangles(farGeo[i]) < 30 && diagonal(farGeo[i].boundingBox as Box3) < 0.04 * modelDiag;
    if (tiny) return;
    const farMesh = new Mesh(farGeo[i], materials[i]);
    farMesh.name = name;
    far.add(farMesh);
  });
  // simplification can stall on odd topology: the far LOD is the performance net, so sacrifice its smallest meshes before it grows heavy
  let farTotal = countTriangles(far);
  while (farTotal > budget.far * 1.15 && far.children.length > 1) {
    const size = (m: Object3D) => diagonal((m as Mesh).geometry.boundingBox as Box3);
    const smallest = far.children.reduce((a, b) => (size(b) < size(a) ? b : a));
    far.remove(smallest);
    farTotal = countTriangles(far);
  }
  await say(1, "Packing");
  return {
    root,
    report: { trianglesBefore, near: countTriangles(near), far: countTriangles(far), materials: items.length, droppedParts: all.length - parts.length, texturesResized: count.n },
  };
}

/** Binary GLB of `root` (needs FileReader and canvas, so it only works in a browser, not in plain Node). */
export async function exportGlb(root: Object3D): Promise<ArrayBuffer> {
  const out = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, includeCustomExtensions: false });
  if (!(out instanceof ArrayBuffer)) throw new Error("The car could not be packed into a file.");
  return out;
}
