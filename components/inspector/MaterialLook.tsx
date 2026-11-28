"use client";
import { useEffect, useState } from "react";
import { MaterialBrowse } from "@/components/lazyPanels";
import type { MaterialUse } from "@/components/ui/MaterialBrowse";
import { patchCmOf } from "@/lib/floorPhoto";
import { materialNameOf } from "@/lib/materialApply";
import { MATERIAL_SCALE_M, type MaterialRef } from "@/lib/materialRef";
import { materialScaleFromCm, turnedMaterial } from "@/lib/planMaterials";
import { PH_SITE } from "@/lib/polyhaven";
import { useStore } from "@/lib/store";
import type { Plan } from "@/lib/types";
import "./MaterialLook.css";

/**
 * "Material from Poly Haven...": opens the texture browser, and for a surface that already wears one shows its name, its size in real life (editable), a quarter turn and Remove
 * material. `apply(plan, ref)` lays the reference on this surface (null takes it off): every button is ONE `editPlan`, so each is one undo step and Remove is undoable.
 */
export default function MaterialLook({ use, current, apply }: { use: MaterialUse; current: MaterialRef | undefined; apply: (plan: Plan, ref: MaterialRef | null) => Plan }) {
  const editPlan = useStore((s) => s.editPlan);
  const [open, setOpen] = useState(false);
  const [cm, setCm] = useState<string | null>(null);
  const [name, setName] = useState<{ id: string; text: string | null } | null>(null);
  const id = current?.resourceId;
  useEffect(() => {
    if (!id) return;
    let live = true;
    void materialNameOf(id).then((text) => live && setName({ id, text }));
    return () => {
      live = false;
    };
  }, [id]);
  const shownName = name && name.id === id ? name.text : null;
  const shownCm = cm ?? (current ? String(patchCmOf(current.scaleM)) : "");
  const commitCm = () => {
    const n = Number((cm ?? "").replace(",", "."));
    setCm(null);
    if (current && Number.isFinite(n) && n > 0) editPlan((p) => apply(p, { ...current, scaleM: materialScaleFromCm(n, current.scaleM) }));
  };

  return (
    <div className="mtl-row">
      <button type="button" className="btn" onClick={() => setOpen(true)}>Material from Poly Haven...</button>
      {current && (
        <>
          <span className="mtl-name">
            <i className="mtl-chip" style={{ background: current.avg }} aria-hidden /> {shownName ?? "Poly Haven texture"}
          </span>
          <label className="mtl-scale">
            <span>One picture is about</span>
            <input type="text" inputMode="decimal" value={shownCm} aria-label="Width of one picture in centimetres" onChange={(e) => setCm(e.target.value)} onBlur={commitCm} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
            <span>cm wide ({MATERIAL_SCALE_M.min * 100} cm to {MATERIAL_SCALE_M.max} m)</span>
          </label>
          <div className="mtl-actions">
            <button type="button" className="btn" onClick={() => editPlan((p) => apply(p, turnedMaterial(current)))}>Turn a quarter</button>
            <button type="button" className="btn" onClick={() => editPlan((p) => apply(p, null))}>Remove material</button>
          </div>
          <small className="field-note">
            <a href={PH_SITE} target="_blank" rel="noreferrer">Poly Haven</a>, CC0
          </small>
        </>
      )}
      {open && <MaterialBrowse use={use} onClose={() => setOpen(false)} onUse={(ref) => editPlan((p) => apply(p, ref))} />}
    </div>
  );
}
