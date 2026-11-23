"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Def } from "@/lib/catalog";
import { kindLabel } from "@/lib/customCatalog";
import "@/lib/customStore"; // registers the user's pieces in CATALOG before any item draws
import { acquireModel, instanceOf, releaseModel, type Template } from "@/lib/modelLoad";

/**
 * What an item shows for a custom piece that is not plain shapes: the imported 3D model once it has loaded (every placed copy shares
 * one parsed model; geometries and textures are freed when the last copy goes), or nothing while it loads, so the stand-in box shows.
 * `missing` is a short notice when the piece or its model file is not on this device.
 */
export function useModelNode(def: Def, kind: string): { node: ReactNode; missing: string | null } {
  const id = def.model?.id;
  const [loaded, setLoaded] = useState<{ id: string; tpl: Template | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    void acquireModel(id).then((tpl) => live && setLoaded({ id, tpl }));
    return () => {
      live = false;
      releaseModel(id);
    };
  }, [id]);

  const tpl = loaded && loaded.id === id ? loaded.tpl : null;
  const copy = useMemo(() => (tpl ? instanceOf(tpl) : null), [tpl]);
  const scale: [number, number, number] | null = tpl ? [def.w / Math.max(tpl.size.x, 1e-3), def.h / Math.max(tpl.size.y, 1e-3), def.d / Math.max(tpl.size.z, 1e-3)] : null;
  const node = copy && scale ? (
    <group scale={scale}>
      <primitive object={copy} />
    </group>
  ) : null;

  const name = kindLabel(kind);
  const missing = def.model?.missing ? `Missing: ${name}\nImport it in My pieces` : loaded && loaded.id === id && !loaded.tpl ? `Model file for ${def.label}\nnot found on this device` : null;
  return { node, missing };
}
