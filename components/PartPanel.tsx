"use client";
import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { FINISHES, type Part } from "@/lib/catalog";
import { shapeSize } from "@/lib/customCatalog";
import { Step, toCm, toM } from "./PieceStep";
import { SHAPE_NAME, shapeOf, type PartsEditor } from "./usePartsEditor";

type Props = {
  /** The selected shape and its index. */
  part: Part;
  index: number;
  /** The piece keeps at least one shape. */
  canDelete: boolean;
  patch: PartsEditor["patch"];
  onCopy: () => void;
  onRemove: () => void;
};

/** The editor of the selected shape: colour, size, position and turn. */
export default function PartPanel({ part: P, index: sel, canDelete, patch, onCopy, onRemove }: Props) {
  const shape = shapeOf(P);
  const size = (axis: 0 | 1 | 2, cm: number) => {
    const v = Math.max(0.01, toM(cm));
    const s: [number, number, number] = [...P.s];
    s[axis] = v;
    const next = shapeSize(P.shape, s);
    const bottom = P.p[1] - P.s[1] / 2; // the shape grows upwards from where it stands, so stacking stays stacked
    patch(sel, { s: next, p: [P.p[0], bottom + next[1] / 2, P.p[2]] }, `s${axis}`);
  };
  return (
    <div className="pb-part">
      <div className="pb-part-head">
        <span className="label">{SHAPE_NAME[shape]} selected</span>
        <button type="button" className="icon-btn" onClick={onCopy} aria-label="Copy this shape"><CopyIcon size={14} /></button>
        <button type="button" className="icon-btn" onClick={onRemove} disabled={!canDelete} aria-label="Delete this shape"><TrashIcon size={14} /></button>
      </div>
      <div className="pb-swatches" role="group" aria-label="Colour">
        {FINISHES.slice(0, 10).map((f) => (
          <button key={f.name} type="button" className={`pb-sw${P.c.toLowerCase() === f.c.toLowerCase() ? " on" : ""}`} style={{ background: f.c }} title={f.name} aria-label={f.name} aria-pressed={P.c.toLowerCase() === f.c.toLowerCase()} onClick={() => patch(sel, { c: f.c })} />
        ))}
        <input type="color" className="pb-color" value={/^#[0-9a-f]{6}$/i.test(P.c) ? P.c : "#c9a26b"} onChange={(e) => patch(sel, { c: e.target.value }, "c")} aria-label="Pick any colour" />
      </div>
      <div className="pb-grid">
        {shape === "box" && (
          <>
            <Step label="Width" value={toCm(P.s[0])} min={1} onChange={(v) => size(0, v)} />
            <Step label="Height" value={toCm(P.s[1])} min={1} onChange={(v) => size(1, v)} />
            <Step label="Depth" value={toCm(P.s[2])} min={1} onChange={(v) => size(2, v)} />
          </>
        )}
        {shape === "cyl" && (
          <>
            <Step label="Width" value={toCm(P.s[0])} min={1} onChange={(v) => size(0, v)} />
            <Step label="Height" value={toCm(P.s[1])} min={1} onChange={(v) => size(1, v)} />
          </>
        )}
        {shape === "sph" && <Step label="Size" value={toCm(P.s[0])} min={1} onChange={(v) => size(0, v)} />}
        <Step label="Left / right" value={toCm(P.p[0])} onChange={(v) => patch(sel, { p: [toM(v), P.p[1], P.p[2]] }, "x")} />
        <Step label="Back / front" value={toCm(P.p[2])} onChange={(v) => patch(sel, { p: [P.p[0], P.p[1], toM(v)] }, "z")} />
        <Step label="Lift off floor" value={toCm(P.p[1] - P.s[1] / 2)} min={0} onChange={(v) => patch(sel, { p: [P.p[0], toM(v) + P.s[1] / 2, P.p[2]] }, "y")} />
        {shape === "box" && <Step label="Turn" unit="deg" value={Math.round(((P.r?.[1] ?? 0) * 180) / Math.PI)} step={15} min={-360} max={360} onChange={(v) => patch(sel, { r: [P.r?.[0] ?? 0, (v * Math.PI) / 180, P.r?.[2] ?? 0] }, "r")} />}
      </div>
    </div>
  );
}
