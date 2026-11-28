"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Mesh, MeshStandardMaterial } from "three";
import { fitModel, type CarModelEntry } from "@/lib/carModels";
import { guessPaint, listMaterials, prepareInstance } from "@/lib/carPaintMap";
import type { CarSpec, Finish } from "@/lib/cars";
import { acquireModel, instanceOf, releaseModel, type Template } from "@/lib/modelLoad";
import { lods, measureTemplate, prepareTemplate } from "@/lib/carTemplate";
import { modelPlates } from "@/lib/carModelPlate";
import type { PlateEnd, PlateStyle } from "@/lib/plate";
import { usePlateEdit } from "@/lib/plateEditState";
import type { PlateFits } from "@/lib/plateFit";
import CarPlate from "./CarPlate";
import { acquirePlate, releasePlate } from "./plateTexture";

// A real (imported, optimised, calibrated) model of a catalogue car. Every car of the model shares one parsed template; each placed car is a
// clone that shares geometry and textures and owns only the materials that differ (paint, lamps, plate, ghost). The car is turned, scaled and
// stood on the ground by the calibration (lib/carModels.ts). Two levels of detail are in the file ("near" and "far"); the right one shows.

export type RealState = "loading" | "ready" | "failed";

const LAMP_BOOST = 2.0; // same glow as the procedural cars (CarMesh)
const TAIL_BOOST = 1.3;
const LOD_LOW_ZOOM = 26;
const LOD_HIGH_ZOOM = 32;
const LOD_EVERY = 20; // frames between checks

/** Loads a stored real model; `tpl` is null while loading or when the file is missing or unreadable. */
export function useRealTemplate(resource: string | undefined): { tpl: Template | null; state: RealState } {
  const [loaded, setLoaded] = useState<{ resource: string; tpl: Template | null } | null>(null);
  useEffect(() => {
    if (!resource) return;
    let live = true;
    void acquireModel(resource).then((tpl) => {
      if (tpl) prepareTemplate(tpl);
      if (live) setLoaded({ resource, tpl });
    });
    return () => {
      live = false;
      releaseModel(resource);
    };
  }, [resource]);
  const mine = loaded && loaded.resource === resource ? loaded : null;
  return { tpl: mine?.tpl ?? null, state: !mine ? "loading" : mine.tpl ? "ready" : "failed" };
}

type Props = {
  spec: CarSpec;
  entry: CarModelEntry;
  color?: string;
  finish: Finish;
  level: RefObject<number>;
  ghost: boolean;
  plate: { text: string; style: PlateStyle };
  fits?: PlateFits; // the plate placement to apply (none: the automatic place; the fitting dialogue's preview)
  editing?: PlateEnd | null;
  onState?: (s: RealState) => void;
};

export default function CarModelMesh({ spec, entry, color, finish, level, ghost, plate, fits = {}, editing = null, onState }: Props) {
  const { tpl, state } = useRealTemplate(entry.resource);
  const measure = useMemo(() => (tpl ? measureTemplate(tpl) : null), [tpl]);
  const usable = tpl && measure ? "ready" : state === "loading" ? "loading" : "failed";
  useEffect(() => onState?.(usable), [usable, onState]);

  const mats = useMemo(() => (tpl ? listMaterials(tpl.root) : []), [tpl]);
  const paintKey = useMemo(() => entry.paintKey ?? guessPaint(mats), [entry.paintKey, mats]);
  // a car nobody painted has the catalogue's colour (the ASX is silver), like the built-in car; a model with a single baked material (a scan) cannot be recoloured
  const paint = color ?? spec.color;
  const keepOriginal = entry.keepOriginal === true || (tpl !== null && mats.length < 2);
  const inst = useMemo(() => {
    if (!tpl) return null;
    const root = instanceOf(tpl);
    root.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = !ghost;
    });
    return { root, handle: prepareInstance(root, { paintKey, color: paint, finish, keepOriginal, ghost }) };
  }, [tpl, paintKey, paint, finish, keepOriginal, ghost]);
  useEffect(() => () => inst?.handle.dispose(), [inst]);

  // our plate picture on the model's own plate mesh, when it has one
  const { text: plateText, style: plateStyle } = plate;
  useEffect(() => {
    if (!inst?.handle.plates.length) return;
    const tex = acquirePlate(plateText, plateStyle, "rear");
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0, transparent: ghost, opacity: ghost ? 0.22 : 1 });
    const own = inst.handle.plates.map((m) => [m, m.material] as const);
    for (const [m] of own) m.material = mat;
    return () => {
      for (const [m, old] of own) m.material = old;
      mat.dispose();
      releasePlate(plateText, plateStyle, "rear");
    };
  }, [inst, plateText, plateStyle, ghost]);

  const [low, setLow] = useState(false);
  const tick = useRef(0);
  useEffect(() => {
    if (!inst) return;
    const { near, far } = lods(inst.root);
    if (far) {
      near.visible = !low;
      far.visible = low;
    }
  }, [inst, low]);

  useFrame(({ camera }) => {
    if (++tick.current % LOD_EVERY === 0) {
      const z = camera.zoom;
      if (z < LOD_LOW_ZOOM && !low) setLow(true);
      else if (z > LOD_HIGH_ZOOM && low) setLow(false);
    }
    const l = level.current;
    for (const m of inst?.handle.lamps ?? []) m.emissiveIntensity = l * LAMP_BOOST;
    for (const m of inst?.handle.tails ?? []) m.emissiveIntensity = l * TAIL_BOOST;
  });

  const fit = useMemo(() => (measure ? fitModel(measure, entry.calib, { w: spec.width, d: spec.length, h: spec.height }) : null), [measure, entry.calib, spec]);
  // a model without a plate mesh of its own (most downloads: the plate is baked into the body picture, or left off) gets our plate on its bumpers
  const hasPlateMesh = !!inst?.handle.plates.length;
  // the inspector cannot move a plate that is part of the model
  useEffect(() => {
    if (!hasPlateMesh) return;
    usePlateEdit.getState().setOwn(entry.resource, true);
    return () => usePlateEdit.getState().setOwn(entry.resource, false);
  }, [hasPlateMesh, entry.resource]);
  const mounts = useMemo(() => {
    if (!tpl || !fit || hasPlateMesh) return [];
    const { near, far } = lods(tpl.root);
    return modelPlates(far ?? near, fit, { d: spec.length, h: spec.height });
  }, [tpl, fit, hasPlateMesh, spec]);
  if (!inst || !fit) return null;
  return (
    <>
      <group position={[0, fit.yOffset, 0]} scale={fit.scale}>
        <group rotation={[0, fit.yaw, 0]}>
          <group position={[-fit.centre[0], -fit.centre[1], -fit.centre[2]]}>
            <primitive object={inst.root} />
          </group>
        </group>
      </group>
      {mounts.map((m) => (
        <CarPlate key={m.end} mount={m} fit={fits[m.end]} outline={editing === m.end} text={plate.text} style={plate.style} ghost={ghost} />
      ))}
    </>
  );
}

