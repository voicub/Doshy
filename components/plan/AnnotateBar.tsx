"use client";
import { ArrowUpRightIcon, NotePencilIcon, PushPinIcon, RectangleIcon, RulerIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { MAX_TEXT, patchAnnotation } from "@/lib/annotations";
import { ANNOTATION_COLORS, ZONE_PRESETS, annotationLabel } from "@/lib/annotationTools";
import type { Annotation, AnnotationKind } from "@/lib/designTypes";
import { useStore } from "@/lib/store";
import { removeSelected } from "./AnnotateLayer";
import { useAnnotateUi } from "./annotateUi";
import "./measure.css";

const KINDS: { id: AnnotationKind; label: string; title: string; icon: ReactNode }[] = [
  { id: "note", label: "Note", title: "A text note at a point", icon: <NotePencilIcon size={14} /> },
  { id: "arrow", label: "Arrow", title: "An arrow from one point to another", icon: <ArrowUpRightIcon size={14} /> },
  { id: "dimension", label: "Dimension", title: "A measured line that shows its length", icon: <RulerIcon size={14} /> },
  { id: "zone", label: "Zone", title: "A rectangle to remember, such as a radiator or a pipe in the wall", icon: <RectangleIcon size={14} /> },
];
const COLOR_NAMES = ["Cyan", "Amber", "Red", "Green", "Violet", "White"] as const;

const edit = (id: string, patch: Partial<Annotation>) => useStore.getState().editPlan((p) => patchAnnotation(p, id, patch));

/** The six colours: one tap picks, the picked one is marked. */
function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="mz-swatches" role="group" aria-label="Colour">
      {ANNOTATION_COLORS.map((c, i) => (
        <button key={c} type="button" className="mz-swatch" style={{ background: c }} aria-label={COLOR_NAMES[i]} aria-pressed={value === c} title={COLOR_NAMES[i]} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

/** The words of the annotation being edited: typing is local, Enter or leaving the field saves them as one undo step (an empty note or zone goes back to what it said). */
function Words({ a }: { a: Annotation }) {
  const saved = a.kind === "dimension" ? "" : (a.text ?? "");
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [a.id, saved]);
  const commit = () => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t === saved) return setText(saved);
    if (!t && a.kind !== "arrow") return setText(saved); // a note or zone needs words
    edit(a.id, { text: t });
  };
  return (
    <label className="mz-field mz-words">
      <span>{a.kind === "zone" ? "What is here" : "Words"}</span>
      <input type="text" value={text} maxLength={MAX_TEXT} placeholder={a.kind === "arrow" ? "Optional" : ""} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
    </label>
  );
}

const pinnable = (k: AnnotationKind) => k === "note" || k === "zone";

/** The bar over the dock while the Notes tool is on: pick what to place (note, arrow, dimension, zone), its colour and whether it shows as a 3D pin; with one picked on the plan it becomes its editor. */
export default function AnnotateBar() {
  const ui = useAnnotateUi();
  const a = useStore((s) => (ui.sel ? s.plan.annotations?.find((x) => x.id === ui.sel) : undefined));
  if (a) {
    return (
      <aside className="mz-bar az-bar hud brackets" aria-label="Edit this annotation">
        <div className="plan-bar-row mz-row">
          <span className="mz-readout"><b>{`Editing ${a.kind === "arrow" ? "an" : "a"} ${a.kind}`}</b>{a.kind === "dimension" && <span>{annotationLabel(a)}</span>}</span>
          {a.kind !== "dimension" && <Words a={a} />}
          <Swatches value={a.color ?? ""} onPick={(color) => edit(a.id, { color })} />
          {pinnable(a.kind) && (
            <button type="button" className="mz-chip" aria-pressed={!!a.pin} onClick={() => edit(a.id, { pin: a.pin ? undefined : true })} title="Also show it as a small pin in the 3D view">
              <PushPinIcon size={14} />
              Show as a 3D pin
            </button>
          )}
          <span className="field-note mz-note">Drag it on the plan to move it.</span>
          <button type="button" className="mz-chip mz-danger" onClick={removeSelected}>
            <TrashIcon size={14} />
            Delete
          </button>
          <button type="button" className="mz-chip" onClick={() => ui.set({ sel: null })}>Done</button>
        </div>
      </aside>
    );
  }
  return (
    <aside className="mz-bar az-bar hud brackets" aria-label="What to add">
      <div className="plan-bar-row mz-row">
        <div className="mz-modes" role="group" aria-label="What to add">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="mz-chip" aria-pressed={ui.kind === k.id} title={k.title} onClick={() => ui.set({ kind: k.id })}>
              {k.icon}
              {k.label}
            </button>
          ))}
        </div>
        {ui.kind === "zone" && ZONE_PRESETS.map((z) => <button key={z} type="button" className="mz-chip" aria-pressed={ui.zoneText === z} onClick={() => ui.set({ zoneText: z })}>{z}</button>)}
        <Swatches value={ui.color} onPick={(color) => ui.set({ color })} />
        {pinnable(ui.kind) && (
          <button type="button" className="mz-chip" aria-pressed={ui.pin} onClick={() => ui.set({ pin: !ui.pin })} title="Also show it as a small pin in the 3D view">
            <PushPinIcon size={14} />
            Show as a 3D pin
          </button>
        )}
        <span className="field-note mz-note">
          {ui.kind === "zone" ? "Drag a rectangle on the plan." : ui.kind === "note" ? "Click where the note goes." : "Click the start, then the end."} Click one to edit it.
        </span>
      </div>
    </aside>
  );
}
