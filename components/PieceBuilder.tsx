"use client";
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { Def, Part } from "@/lib/catalog";
import { cleanName, fitParts, pieceFromParts, type CustomPiece } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import PartPanel from "./PartPanel";
import PieceDialog from "./PieceDialog";
import PieceScene from "./PieceScene";
import { isTypingTarget } from "./ui/isTypingTarget";
import { SHAPE_NAME, shapeOf, usePartsEditor, type PartsEditor } from "./usePartsEditor";

export type Draft = { name: string; parts: Part[]; light?: Def["light"]; wall?: true };

type ShapeCounts = Record<string, number>;

/** One chip per shape, numbered per kind ("Box 2"). */
function ShapeChips({ ed }: { ed: PartsEditor }) {
  const counts: ShapeCounts = {};
  return (
    <div className="pb-shapes" role="group" aria-label="Shapes in this piece">
      {ed.parts.map((p, i) => {
        const sh = shapeOf(p);
        counts[sh] = (counts[sh] ?? 0) + 1;
        return (
          <button key={i} type="button" className={`pb-chip${i === ed.sel ? " on" : ""}`} aria-pressed={i === ed.sel} onClick={() => ed.setSel(i)}>
            <i style={{ background: p.c }} />
            {SHAPE_NAME[sh]} {counts[sh]}
          </button>
        );
      })}
    </div>
  );
}

/** The live 3D preview with its undo / redo bar. */
function Preview({ ed }: { ed: PartsEditor }) {
  const camera = useMemo(() => cameraFor(ed.initial), [ed.initial]);
  return (
    <div className="pb-preview">
      <Canvas frameloop="demand" dpr={[1, 2]} camera={camera} onPointerMissed={() => ed.setSel(-1)} aria-label="3D preview of your piece">
        <PieceScene parts={ed.parts} sel={ed.sel} pick={ed.setSel} onBegin={() => ed.snapshot()} onMove={(i, p) => ed.set(ed.live.current.map((x, j) => (j === i ? { ...x, ...p } : x)))} />
      </Canvas>
      <div className="pb-bar">
        <button type="button" className="btn" onClick={ed.undo} disabled={!ed.canUndo()} aria-label="Undo">
          <ArrowCounterClockwiseIcon size={14} /> Undo
        </button>
        <button type="button" className="btn" onClick={ed.redo} disabled={!ed.canRedo()} aria-label="Redo">
          <ArrowClockwiseIcon size={14} /> Redo
        </button>
        <span className="pb-hint">Drag a shape to move it. Drag the blue dot to lift it. Drag the background to look around. The front faces you.</span>
      </div>
    </div>
  );
}

/** Where the preview camera starts: far enough to see the whole piece. */
function cameraFor(initial: Part[]) {
  const fit = fitParts(initial);
  const far = Math.max(fit?.w ?? 1, fit?.h ?? 1, fit?.d ?? 1) * 2.4 + 0.8;
  const position: [number, number, number] = [far * 0.7, far * 0.6, far];
  return { position, fov: 35 };
}

/**
 * "Build from shapes": add boxes, cylinders and balls, move, resize and colour them, watch a live 3D preview, name the piece, save.
 * Also the "Duplicate and tweak" editor (the draft is a copy of a catalog piece) and the editor of a piece saved earlier.
 */
export default function PieceBuilder({ draft, editing, onClose }: { draft: Draft; editing?: CustomPiece; onClose: (placeKind?: string) => void }) {
  const ed = usePartsEditor(draft.parts);
  const { parts, sel } = ed;
  const [name, setName] = useState(draft.name);
  const fit = useMemo(() => fitParts(parts), [parts]);
  const dirty = name !== draft.name || parts !== ed.initial;
  const selected: Part | undefined = parts[sel];

  const cancel = () => {
    if (!dirty || confirm("Throw away your changes?")) onClose();
  };
  const save = () => {
    if (!fit) return;
    const store = useCustom.getState();
    if (editing) {
      store.update({ ...editing, name: cleanName(name), w: fit.w, d: fit.d, h: fit.h, parts: fit.parts });
      onClose();
      return;
    }
    const piece = pieceFromParts({ name, parts, light: draft.light, wall: draft.wall });
    if (!piece) return;
    store.add([piece]);
    onClose(piece.kind);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) ed.redo();
      else ed.undo();
    } else if (!isTypingTarget(e.target) && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      ed.remove(sel);
    }
  };

  return (
    <PieceDialog title={editing ? "Edit your piece" : "Build a piece from shapes"} onClose={cancel} onKey={keys}>
      <div className="pb-body">
        <Preview ed={ed} />
        <div className="pb-side">
          <label className="field">
            <span className="label">Name</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="My piece" />
          </label>
          <ShapeChips ed={ed} />
          <div className="pb-add">
            <button type="button" className="btn" onClick={() => ed.add("box")}><PlusIcon size={12} /> Box</button>
            <button type="button" className="btn" onClick={() => ed.add("cyl")}><PlusIcon size={12} /> Cylinder</button>
            <button type="button" className="btn" onClick={() => ed.add("sph")}><PlusIcon size={12} /> Ball</button>
          </div>
          {selected ? (
            <PartPanel key={sel} part={selected} index={sel} canDelete={parts.length > 1} patch={ed.patch} onCopy={() => ed.copy(sel)} onRemove={() => ed.remove(sel)} />
          ) : (
            <p className="field-note">Pick a shape above, or click one in the preview, to change it.</p>
          )}
        </div>
      </div>
      <footer className="pb-foot">
        <span className="field-note">{fit ? `Piece size ${Math.round(fit.w * 100)} x ${Math.round(fit.d * 100)} x ${Math.round(fit.h * 100)} cm. It is centred and put on the floor for you.` : "Add at least one shape."}</span>
        <button type="button" className="btn" onClick={cancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!fit}>{editing ? "Save changes" : "Save and place it"}</button>
      </footer>
    </PieceDialog>
  );
}
