import { DoubleSide, Group, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Vector2, type Material, type Object3D } from "three";
import { DEFAULT_BUDGET } from "./carOptimise.ts";

/**
 * Some of the best Sketchfab cars are game rips: every variant stacked on top of each other (race wheels, damage, tinted copies, three front
 * bumpers), the four wheels missing (one rim lying at the origin) and flat grey materials. For those the search alone cannot give a car that
 * looks like the real one, so a person has checked the model once and wrote down what to keep here. Keyed by Sketchfab uid.
 */
export type Tyre = { radius: number; width: number; bead: number };
type CuratedModel = {
  /** Nodes (by exact name, any depth) removed with everything below them: other variants, engine bay, suspension, interior panels. */
  drop: RegExp;
  /** The lone wheel node is moved to each centre (x, y, z in the model's own metres, y up, +z the front) and a tyre is built round it. */
  wheels?: { node: string; centres: [number, number, number][]; tyre: Tyre; rimMaterial: string };
  /** Material name -> look, for materials the rip left flat grey. `rename` gives the body paint the name the paint picker recognises. */
  materials?: Record<string, { color?: string; metalness?: number; roughness?: number; opacity?: number; emissive?: string; rename?: string }>;
  budget?: Partial<typeof DEFAULT_BUDGET>;
};

/** Mitsubishi ASX MK1 by Merc_TV (CC BY): the 2013-2016 face (`_rest` bumper and fog lights), one of each part. */
const ASX_MK1: CuratedModel = {
  drop: new RegExp(
    "^(" +
      [
        // mechanics, engine bay, interior parts that cannot be seen through the glass from above
        "asx_(strut|spring|shock|wishbone|upperarm|lowerarm|trailingarm|toelink|subframe|swaybar|tierod|tubs|radiator|radfan|radsupport|turbo|transmission|transfercase|podfilter|skidplate|underbody|torsionbeam|hub|rollcage|coilover|halfshaft|driveshaft|diff|fueltank|raerbeam|airbags|intercarpet|pedal|carpet|shelf|roof_int|doorpanel|gauges|needle|stalk|parkingbrake|shifter|sunviser|intermirror|podfarniki|exhaust|tailgate_carp|steering_wheel|seat|engbay|airbox|intercooler|intake|engine)[a-z0-9_]*",
        // other variants of parts that are kept once
        "sticker_[a-z0-9_]*",
        "asx_znak",
        "asx_frame_[a-z0-9]+",
        "asx_roof_black",
        "asx_bumper_f",
        "asx_bumper_f_plastic",
        "asx_bumper_f_rest_plastic",
        "asx_bumper_r_plastic",
        "asx_foglights",
        "asx_foglightfiller",
        "asx_foglightsfiller_rest",
        "asx_sideskirts",
        "asx_wheel2",
        "asx_windshield_dmg",
        "asx_[a-z0-9_]*_(race|wide|old|dmg|tint|nosig)[a-z0-9_]*",
        "asx_mirror_[lr]_nosig",
      ].join("|") +
      ")$",
    "i",
  ),
  // 17" alloys on 215/60: tyre radius 0.334 m. Front axle +1.35, rear -1.32 (wheelbase 2.67 m), track 1.54 m.
  wheels: {
    node: "ASX_wheel",
    centres: [[0.77, 0.32, 1.35], [-0.77, 0.32, 1.35], [0.77, 0.32, -1.32], [-0.77, 0.32, -1.32]],
    tyre: { radius: 0.334, width: 0.215, bead: 0.228 },
    rimMaterial: "ASX_light",
  },
  materials: {
    material: { rename: "paint" },
    ASX_chrome: { color: "#d4d8dc", metalness: 1, roughness: 0.16 },
    mirror: { color: "#b9c2c8", metalness: 1, roughness: 0.05 },
    ASX_glas: { color: "#dfe9ee", roughness: 0.05, opacity: 0.35 },
    vivace_glass: { color: "#1b252b", roughness: 0.04, opacity: 0.62 },
    ASX_taillightglass: { color: "#8c1119", roughness: 0.1, opacity: 0.85 },
    rear: { color: "#b3141c", roughness: 0.3 },
    brake: { color: "#c8141c", roughness: 0.3 },
    reverse: { color: "#f1f1ec", roughness: 0.3 },
    left: { color: "#e3921c", roughness: 0.3 },
    right: { color: "#e3921c", roughness: 0.3 },
    material_11: { color: "#fff6dc", roughness: 0.2 },
    ASX_plastic: { roughness: 0.75 },
  },
  budget: { near: 160000 },
};

export const CURATED_MODELS: Record<string, CuratedModel> = {
  b654aeee32064a3ca3b4693fa65bb09a: ASX_MK1,
};

/** A tyre standing on the x axis: a lathe round the axle with rounded shoulders, so it reads as rubber from every angle. */
function tyreMesh(t: Tyre, material: Material): Mesh {
  const h = t.width / 2;
  const r = t.radius;
  const shoulder = r - 0.035;
  const profile = [
    [t.bead, -h * 0.92], [t.bead + 0.045, -h], [shoulder - 0.03, -h * 0.98], [shoulder, -h * 0.86], [r - 0.006, -h * 0.5], [r, 0],
    [r - 0.006, h * 0.5], [shoulder, h * 0.86], [shoulder - 0.03, h * 0.98], [t.bead + 0.045, h], [t.bead, h * 0.92],
  ].map(([x, y]) => new Vector2(x, y));
  const geo = new LatheGeometry(profile, 40);
  geo.rotateZ(Math.PI / 2); // the lathe axis is y: lay it along x, the axle
  const m = new Mesh(geo, material);
  m.name = "tyre";
  return m;
}

/** Applies a curated entry to a freshly parsed model, in place. The model is a throwaway copy, so nothing here is undone. */
export function applyCurated(root: Object3D, c: CuratedModel): void {
  root.updateMatrixWorld(true);
  const doomed: Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && c.drop.test(o.name)) doomed.push(o);
  });
  const { wheels } = c;
  const wheel = wheels ? root.getObjectByName(wheels.node) : undefined;
  const alloy = new MeshStandardMaterial({ name: "alloy rim", color: "#b9bec4", roughness: 0.28, metalness: 0.9 });
  const world = wheel ? new Matrix4().copy(root.matrixWorld).invert().multiply(wheel.matrixWorld) : undefined; // relative to the root, where the copies are added
  for (const o of doomed) o.removeFromParent();

  if (wheels && wheel && world) {
    wheel.removeFromParent();
    const rubber = new MeshStandardMaterial({ name: "tyre", color: "#161616", roughness: 0.92, metalness: 0 });
    wheels.centres.forEach(([x, y, z]) => {
      const holder = new Group();
      holder.name = "wheel";
      holder.position.set(x, y, z);
      if (x < 0) holder.scale.x = -1; // the rim faces outward on both sides
      const rim = wheel.clone();
      rim.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && !Array.isArray(m.material) && m.material.name === wheels.rimMaterial) m.material = alloy; // the rip paints the rim with its headlight texture sheet
      });
      rim.matrixAutoUpdate = false;
      rim.matrix.copy(world);
      holder.add(rim, tyreMesh(wheels.tyre, rubber));
      root.add(holder);
    });
  }

  const seen = new Set<Material>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const look = c.materials?.[mat.name];
      if (!look) continue;
      const m = mat as MeshStandardMaterial;
      if (look.color && m.color) m.color.set(look.color);
      if (look.metalness !== undefined) m.metalness = look.metalness;
      if (look.roughness !== undefined) m.roughness = look.roughness;
      if (look.opacity !== undefined) {
        m.opacity = look.opacity;
        m.transparent = true;
        m.depthWrite = false;
        m.side = DoubleSide;
      }
      if (look.rename) m.name = look.rename;
    }
  });
}
