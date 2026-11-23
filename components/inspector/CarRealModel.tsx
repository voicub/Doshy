"use client";
import { useMemo, useState } from "react";
import { AutoButton, AutoStatus, CarTools } from "../CarAuto";
import { useCarModels } from "@/lib/carModelStore";
import { LICENSE_SHORT } from "@/lib/carModels";
import { guessPaint, listMaterials } from "@/lib/carPaintMap";
import type { CarSpec } from "@/lib/cars";
import CarCredits from "../CarCredits";
import CarModelFinder from "../CarModelFinder";
import { useRealTemplate } from "../scene/CarModelMesh";
import { Group } from "./shared";
import "./carModel.css";

/** Which material takes the paint colour: the guess, or the one the user clicked when the guess was wrong. */
function PaintParts({ carId, resource, paintKey }: { carId: string; resource: string; paintKey?: string }) {
  const { tpl } = useRealTemplate(resource);
  const infos = useMemo(() => (tpl ? listMaterials(tpl.root).filter((m) => m.area > 0).slice(0, 12) : []), [tpl]);
  const active = paintKey ?? (tpl ? guessPaint(listMaterials(tpl.root)) : undefined);
  if (infos.length < 2) return null;
  return (
    <div className="cmr-parts" role="group" aria-label="Which part is the paint">
      <span className="label">Which part is the paint?</span>
      <div className="cmr-list">
        {infos.map((m) => (
          <button key={m.key} type="button" className="preset cmr-part" aria-pressed={m.key === active} onClick={() => useCarModels.getState().patch(carId, { paintKey: m.key })}>
            <i style={{ background: m.color }} />
            {m.name.replace(/_/g, " ").slice(0, 24) || "Part"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Car inspector, top section: "Make this car look exact" (real 3D model from Sketchfab) or, once one is in use, its credit, fitting, paint
 * choices and the way back to the built-in car. The choice applies to every car of this catalogue model.
 */
export default function CarRealModel({ spec }: { spec: CarSpec }) {
  const entry = useCarModels((s) => s.models[spec.id]);
  const [dialog, setDialog] = useState<"find" | "fit" | "credits" | null>(null);
  const a = entry?.attribution;
  return (
    <>
      <Group label="Real 3D model">
        <div className="cmr">
          {!entry && (
            <>
              <p className="field-note">The built-in {spec.label} is a generic shape. Use a real 3D model of it instead (free, from Sketchfab).</p>
              <AutoButton carId={spec.id} hasModel={false} />
              <button type="button" className="btn" onClick={() => setDialog("find")}>Choose one myself</button>
            </>
          )}
          {entry && a && (
            <>
              <p className="cmr-name">{a.name}</p>
              <p className="field-note">
                by <a href={a.authorUrl || a.sourceUrl} target="_blank" rel="noopener noreferrer">{a.author}</a>
                {" · "}
                <a href={a.licenseUrl || a.sourceUrl} target="_blank" rel="noopener noreferrer">{LICENSE_SHORT[a.license]}</a>
                {" · "}
                <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Sketchfab</a>
              </p>
              <div className="cmr-row">
                <AutoButton carId={spec.id} hasModel />
                <button type="button" className="btn" onClick={() => setDialog("fit")}>Adjust fit</button>
                <button type="button" className="btn" onClick={() => setDialog("find")}>Change model</button>
                <button type="button" className="btn" onClick={() => setDialog("credits")}>Credits</button>
                <button type="button" className="btn" onClick={() => useCarModels.getState().clear(spec.id)}>Back to the built-in model</button>
              </div>
              <label className="cmr-check">
                <input type="checkbox" checked={entry.keepOriginal === true} onChange={(e) => useCarModels.getState().patch(spec.id, { keepOriginal: e.target.checked })} />
                Keep the model&rsquo;s original colour
              </label>
              <PaintParts carId={spec.id} resource={entry.resource} paintKey={entry.paintKey} />
            </>
          )}
          <AutoStatus carId={spec.id} />
          <CarTools />
        </div>
      </Group>
      {dialog === "find" && <CarModelFinder spec={spec} onClose={() => setDialog(null)} />}
      {dialog === "fit" && entry && <CarModelFinder spec={spec} initial={entry} onClose={() => setDialog(null)} />}
      {dialog === "credits" && <CarCredits onClose={() => setDialog(null)} />}
    </>
  );
}
