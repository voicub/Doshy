import { Box3, DirectionalLight, Group, HemisphereLight, LoadingManager, Mesh, PerspectiveCamera, Scene, Texture, Vector3, WebGLRenderer, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { errorMessage } from "./guards";
import { getModel } from "./modelStore";

/**
 * Reads imported .glb / .gltf files in the browser. Safety: the file is parsed here and nowhere else; anything it points at
 * outside itself (web addresses, other files) is refused, and lights and cameras it carries are dropped.
 */
export type Template = { root: Group; size: Vector3 };

const NO_EXTERNAL = "This .gltf points to other files (textures or a .bin). Export it as a single .glb and import that.";
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const FREE_AFTER_MS = 1500; // a model nobody shows is freed this long after its last piece leaves the scene

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Parse a file into a template: upright, standing on y = 0, centred on x/z, in the file's own units (metres). */
export async function parseModel(buf: ArrayBuffer, ext: "glb" | "gltf"): Promise<Template> {
  let data: ArrayBuffer | string = buf;
  if (ext === "gltf" || new Uint8Array(buf, 0, 4).join() !== "103,108,84,70") {
    data = new TextDecoder().decode(buf);
    let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
    try {
      json = JSON.parse(data);
    } catch {
      throw new Error("That does not look like a 3D model file.");
    }
    if ([...(json.buffers ?? []), ...(json.images ?? [])].some((x) => x.uri && !x.uri.startsWith("data:"))) throw new Error(NO_EXTERNAL);
  }
  await tick(); // let the "reading" message paint before the parser takes the main thread
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (url.startsWith("data:") || url.startsWith("blob:") ? url : PIXEL));
  let gltf;
  try {
    gltf = await new GLTFLoader(manager).parseAsync(data, "");
  } catch (e) {
    const msg = errorMessage(e);
    throw new Error(/draco|meshopt|ktx|basis/i.test(msg) ? "This model uses compression this app cannot read yet. Re-export it without compression." : "Could not read this 3D model. Is it a valid .glb or .gltf?");
  }
  const scene = gltf.scene;
  const drop: Object3D[] = [];
  scene.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = o.receiveShadow = true;
    else if ("isLight" in o || "isCamera" in o) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  if (box.isEmpty()) throw new Error("This file has no 3D shapes in it.");
  const size = box.getSize(new Vector3());
  const mid = box.getCenter(new Vector3());
  scene.position.set(-mid.x, -box.min.y, -mid.z);
  const root = new Group();
  root.add(scene);
  return { root, size };
}

/** Free the GPU memory a template holds (geometries, materials and their textures). */
export function disposeTemplate(t: Template) {
  t.root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      const fields: unknown[] = Object.values(mat);
      for (const v of fields) if (v instanceof Texture) v.dispose();
      mat.dispose();
    }
  });
}

// One parsed template per stored model, shared by every placed copy: copies are clones that reuse its geometry and materials.
const cache = new Map<string, { loading: Promise<Template | null>; refs: number; timer?: ReturnType<typeof setTimeout> }>();

/** Get the template for a stored model (null when the file is not on this device or cannot be read). Pair every call with `releaseModel`. */
export function acquireModel(id: string): Promise<Template | null> {
  let e = cache.get(id);
  if (!e) {
    const loading = getModel(id)
      .then((m) => (m ? parseModel(m.buf, m.ext) : null))
      .catch((err) => {
        console.warn(`housey: model ${id} could not be loaded`, err);
        return null;
      });
    e = { loading, refs: 0 };
    cache.set(id, e);
  }
  clearTimeout(e.timer);
  e.refs++;
  return e.loading;
}

const scheduleFree = (id: string, e: { loading: Promise<Template | null>; timer?: ReturnType<typeof setTimeout> }) => {
  e.timer = setTimeout(() => {
    cache.delete(id);
    void e.loading.then((t) => t && disposeTemplate(t));
  }, FREE_AFTER_MS);
};

export function releaseModel(id: string) {
  const e = cache.get(id);
  if (e && --e.refs <= 0) scheduleFree(id, e);
}

/** Hand over a template that was just parsed for an import, so placing the new piece does not parse the file a second time. */
export function primeModel(id: string, t: Template) {
  const e = { loading: Promise.resolve<Template | null>(t), refs: 0 };
  cache.set(id, e);
  scheduleFree(id, e);
}

/** A copy of a template for one placed piece (cheap: shares geometry and materials with the template). */
export const instanceOf = (t: Template): Object3D => cloneWithSkeleton(t.root);

/** A small picture of the model at the size the user chose, for the catalog. Uses a throwaway canvas and frees it. */
export function renderThumb(t: Template, dims: { w: number; d: number; h: number }, px = { w: 192, h: 144 }): string {
  const canvas = document.createElement("canvas");
  const gl = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  try {
    gl.setPixelRatio(1);
    gl.setSize(px.w, px.h, false);
    gl.setClearColor("#05070a", 1);
    const scene = new Scene();
    const holder = new Group();
    holder.scale.set(dims.w / Math.max(t.size.x, 1e-3), dims.h / Math.max(t.size.y, 1e-3), dims.d / Math.max(t.size.z, 1e-3));
    holder.add(instanceOf(t));
    scene.add(holder, new HemisphereLight("#ffffff", "#556070", 1.6));
    const sun = new DirectionalLight("#ffffff", 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const radius = Math.hypot(dims.w, dims.h, dims.d) / 2;
    const cam = new PerspectiveCamera(32, px.w / px.h, 0.01, 100);
    const dist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.05;
    cam.position.set(dist * 0.62, dims.h / 2 + dist * 0.45, dist * 0.7);
    cam.lookAt(0, dims.h / 2, 0);
    gl.render(scene, cam);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    gl.dispose();
    gl.forceContextLoss();
  }
}
