"use client";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CanvasTexture } from "three";
import { buildCar } from "@/lib/carGeometry";
import { LAYERS, type Layer, type PlateMount } from "@/lib/carSurf";
import type { CarSpec, Finish } from "@/lib/cars";
import { plateSize, type PlateStyle } from "@/lib/plate";
import { AWAY_OPACITY, geometryOf, makeMaterials } from "./carMaterials";
import { acquirePlate, releasePlate } from "./plateTexture";
import CarModelMesh, { type RealState } from "./CarModelMesh";
import { useCarModels } from "@/lib/carModelStore";
import "@/lib/carAutoWatch"; // starts the "fetch a real model when I place a car" watcher

// One car: a handful of merged meshes (paint, glass, chrome, black, lamps, tail lamps) built once per model and shared, with the
// materials made per car so the paint can be recoloured and the lamps can glow. Lighting comes from the scene (environment + sun); no extra lights.

const LAMP_BOOST = 2.0; // >1 so the bloom pass picks lit lamps up
const TAIL_BOOST = 1.3;
const PLATE_T = 0.006;
const CASTS: Layer[] = ["paint", "black"];
const LOD_LOW_ZOOM = 26; // camera zoom is pixels per metre: below this a car is under ~110 px long
const LOD_HIGH_ZOOM = 32;
const LOD_EVERY = 20; // frames between checks

function Plate({ mount, text, style, ghost }: { mount: PlateMount; text: string; style: PlateStyle; ghost: boolean }) {
  const [tex, setTex] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    setTex(acquirePlate(text, style, mount.end));
    return () => releasePlate(text, style, mount.end);
  }, [text, style, mount.end]);
  const [w, h] = plateSize(style, mount.end);
  return (
    <mesh position={mount.p} rotation={mount.rot} receiveShadow>
      <boxGeometry args={[w, h, PLATE_T]} />
      <meshStandardMaterial map={tex} color={tex ? "#ffffff" : "#e6e6e2"} roughness={0.45} metalness={0} transparent={ghost} opacity={ghost ? AWAY_OPACITY : 1} depthWrite={!ghost} />
    </mesh>
  );
}

type CarProps = { spec: CarSpec; color?: string; finish: Finish; level: RefObject<number>; ghost: boolean; plate: { text: string; style: PlateStyle } };

function ProceduralCar({ spec, color, finish, level, ghost, plate }: CarProps) {
  // far away (zoomed out: a car is only a hundred pixels long) the decimated mesh is plenty; checked a few times a second, with hysteresis
  const [low, setLow] = useState(false);
  const tick = useRef(0);
  const geo = useMemo(() => buildCar(spec, low ? 1 : 0), [spec, low]);
  const geos = useMemo(() => LAYERS.map((l) => geometryOf(geo.layers[l])), [geo]); // parallel to LAYERS
  const paint = color ?? spec.color;
  const mats = useMemo(() => makeMaterials(paint, finish, ghost), [paint, finish, ghost]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // lamps follow the car's light level (headlights and tail lights glow while it is linked and home); nothing runs while it is steady
  useFrame(({ camera }) => {
    if (++tick.current % LOD_EVERY === 0) {
      const z = camera.zoom;
      if (z < LOD_LOW_ZOOM && !low) setLow(true);
      else if (z > LOD_HIGH_ZOOM && low) setLow(false);
    }
    const l = level.current;
    if (mats.lamp.emissiveIntensity === l * LAMP_BOOST) return;
    mats.lamp.emissiveIntensity = l * LAMP_BOOST;
    mats.tail.emissiveIntensity = l * TAIL_BOOST;
  });

  return (
    <group>
      {LAYERS.map((l, i) => (
        <mesh key={l} geometry={geos[i]} material={mats[l]} castShadow={!ghost && CASTS.includes(l)} receiveShadow dispose={null} />
      ))}
      {geo.plates.map((m) => (
        <Plate key={m.end} mount={m} text={plate.text} style={plate.style} ghost={ghost} />
      ))}
    </group>
  );
}

/**
 * A catalogue car: the real model the user fitted to it (lib/carModelStore.ts) once that has loaded, the procedural bodywork otherwise
 * (no model chosen, still loading, or the file is not on this device or cannot be read: the plan never depends on it).
 */
export default function CarMesh(props: CarProps) {
  const entry = useCarModels((s) => s.models[props.spec.id]);
  const [real, setReal] = useState<{ resource: string; state: RealState } | null>(null);
  const onState = useCallback((state: RealState) => entry && setReal({ resource: entry.resource, state }), [entry]);
  const ready = !!entry && real?.resource === entry.resource && real.state === "ready";
  return (
    <>
      {!ready && <ProceduralCar {...props} />}
      {entry && <CarModelMesh key={entry.resource} {...props} entry={entry} onState={onState} />}
    </>
  );
}
