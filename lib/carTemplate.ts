import { BackSide, Matrix4, Vector3, type Mesh, type Object3D } from "three";
import { measureModel, type Measure, type PointCloud } from "./carModels";
import type { Template } from "./modelLoad";

/** The two detail levels of a stored real-car template ("near" and "far" groups; a model without them is all "near"). */
export const lods = (root: Object3D): { near: Object3D; far: Object3D | null } => ({ near: root.getObjectByName("near") ?? root, far: root.getObjectByName("far") ?? null });

const WHEEL = /tyre|tire|wheel|rubber|rim/i;
const measures = new WeakMap<Template, Measure | null>();

/** Size, ground and facing of a template's near level (see lib/carModels.ts measureModel), measured once per parsed template. */
export function measureTemplate(t: Template): Measure | null {
  if (measures.has(t)) return measures.get(t) ?? null;
  t.root.updateMatrixWorld(true);
  const clouds: PointCloud[] = [];
  const v = new Vector3();
  const m4 = new Matrix4();
  lods(t.root).near.traverse((o) => {
    const mesh = o as Mesh;
    const p = mesh.isMesh ? mesh.geometry.getAttribute("position") : null;
    if (!p) return;
    m4.copy(mesh.matrixWorld);
    const pos = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m4).toArray(pos, i * 3);
    }
    const names = [mesh.name, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((x) => x.name)];
    clouds.push({ pos, wheel: names.some((n) => WHEEL.test(n)) });
  });
  const m = measureModel(clouds);
  measures.set(t, m);
  return m;
}

const prepared = new WeakSet<Template>();

/**
 * One-time touch-up of a freshly loaded template: many downloaded models use two-sided materials, which makes three draw both faces into the
 * shadow map and the car shadows itself (dark acne). Shadows are drawn from the back faces instead, like for one-sided materials.
 */
export function prepareTemplate(t: Template) {
  if (prepared.has(t)) return;
  prepared.add(t);
  t.root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.shadowSide = BackSide;
  });
}
