"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BufferGeometry, Color, Euler, InstancedBufferAttribute, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { buildVegetation, levelOfFoliage, speciesDef, type Placement } from "@/lib/vegetation";
import { useKnobs } from "@/lib/quality";
import { gardenMaterials } from "./foliageMaterial";

/** Only plants at least this tall cast a shadow: tufts, flowers and litter would only cost shadow-pass triangles. */
const SHADOW_MIN_H = 0.6;
type Group = { key: string; geo: BufferGeometry; items: Placement[] };

/** A geometry that shares every buffer of `geo` but can carry its own per-instance attributes. */
function shell(geo: BufferGeometry) {
  const g = new BufferGeometry();
  for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
  g.setIndex(geo.index);
  g.boundingBox = geo.boundingBox;
  g.boundingSphere = geo.boundingSphere;
  return g;
}

function GroupMesh({ geo, items, shadow }: Omit<Group, "key"> & { shadow: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const mats = gardenMaterials();
  const g = useMemo(() => shell(geo), [geo]);
  const rand = useMemo(() => new InstancedBufferAttribute(new Float32Array(items.length * 4), 4), [items.length]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(), c = new Color();
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.yaw, 0)), s.set(it.sx, it.sy, it.sz)));
      mesh.setColorAt(i, c.setScalar(it.tone ?? 1));
      rand.set(it.rand, i * 4);
    });
    rand.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, rand]);
  return (
    <instancedMesh key={items.length} ref={ref} args={[g, mats.main, items.length]} customDepthMaterial={mats.depth} castShadow={shadow} receiveShadow raycast={() => null} dispose={null}>
      <primitive object={rand} attach="geometry-attributes-iRand" />
    </instancedMesh>
  );
}

/**
 * Draws placed plants as instanced organic meshes: one draw call (and one shadow draw call) per species variant, whatever the count.
 * Season, snow and wind come from the shared foliage uniforms (FoliageDriver), so nothing here re-runs when they change.
 * `shadows` false: no plant casts a shadow (trees far beyond the sun's shadow frustum would only cost shadow-pass draws).
 */
export default function FoliageInstances({ plants, shadows = true }: { plants: Placement[]; shadows?: boolean }) {
  const k = useKnobs();
  const level = levelOfFoliage(k.foliage);
  const groups = useMemo(() => {
    const by = new Map<string, Group>();
    for (const p of plants) {
      const lod = k.cheapPlants ? 1 : (p.lod ?? 0);
      const key = `${p.species}:${p.variant}:${lod}`;
      let grp = by.get(key);
      if (!grp) by.set(key, (grp = { key, geo: buildVegetation(p.species, p.variant, lod, level), items: [] }));
      grp.items.push(p);
    }
    return [...by.values()];
  }, [plants, level, k.cheapPlants]);
  return (
    <group>
      {groups.map((g) => (
        <GroupMesh key={g.key} geo={g.geo} items={g.items} shadow={shadows && g.items[0] ? speciesDef(g.items[0].species).size[1] >= SHADOW_MIN_H : false} />
      ))}
    </group>
  );
}
