"use client";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState, type ComponentType } from "react";
import { useCarModels } from "@/lib/carModelStore";
import type { CarSpec } from "@/lib/cars";
import type { PlateEnd } from "@/lib/plate";
import { usePlateEdit } from "@/lib/plateEditState";
import { FIT_RANGE, PLATE_FIT_KEY, defaultFit, encodePlateFit, fitsOfModel, itemPlateFits, plateModelKey, resolvePlateFits, type PlateFit } from "@/lib/plateFit";
import { usePlateFits } from "@/lib/plateFitStore";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import MonoLabel from "../ui/MonoLabel";
import Segmented from "../ui/Segmented";
import { withParams } from "./itemParams";
import "./plateFit.css";

type NumKey = "dx" | "dy" | "dz" | "tilt" | "yaw" | "scale";
type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
type Row = {
  key: NumKey;
  label: string;
  less: string;
  more: string;
  icons: [Icon, Icon];
  /** Shown value = stored value x `view`, in `unit`. The slider moves by `slide` shown units, a nudge button by `nudge`. */
  view: number;
  unit: string;
  slide: number;
  nudge: number;
  say: (v: number) => string;
};

const signed = (v: number, unit: string) => `${v > 0 ? "+" : ""}${v} ${unit}`;

// Directions are what you see looking at the plate from outside the car, the same at the front and at the back.
const ROWS: Row[] = [
  { key: "dy", label: "Up / down", less: "Down", more: "Up", icons: [ArrowDownIcon, ArrowUpIcon], view: 100, unit: "cm", slide: 0.5, nudge: 1, say: (v) => signed(v, "cm") },
  { key: "dx", label: "Left / right", less: "Left", more: "Right", icons: [ArrowLeftIcon, ArrowRightIcon], view: 100, unit: "cm", slide: 0.5, nudge: 1, say: (v) => signed(v, "cm") },
  { key: "dz", label: "In / out", less: "In", more: "Out", icons: [MinusIcon, PlusIcon], view: 100, unit: "cm", slide: 0.5, nudge: 1, say: (v) => (v === 0 ? "0 cm" : `${Math.abs(v)} cm ${v > 0 ? "out" : "in"}`) },
  { key: "tilt", label: "Tilt", less: "Face up", more: "Face down", icons: [MinusIcon, PlusIcon], view: 1, unit: "deg", slide: 1, nudge: 3, say: (v) => (v === 0 ? "0 deg" : `${Math.abs(v)} deg face ${v > 0 ? "down" : "up"}`) },
  { key: "yaw", label: "Turn", less: "Turn left", more: "Turn right", icons: [ArrowLeftIcon, ArrowRightIcon], view: 1, unit: "deg", slide: 1, nudge: 3, say: (v) => (v === 0 ? "0 deg" : `${Math.abs(v)} deg to the ${v > 0 ? "right" : "left"}`) },
  { key: "scale", label: "Size", less: "Smaller", more: "Bigger", icons: [MinusIcon, PlusIcon], view: 100, unit: "%", slide: 1, nudge: 5, say: (v) => `${v} %` },
];

/** One slider drag is one undo step (the same as the animal options). */
const gesture = { onPointerDown: () => useStore.getState().beginEdit(), onPointerUp: () => useStore.getState().endEdit(), onBlur: () => useStore.getState().gesture && useStore.getState().endEdit() };

function FitRow({ row, value, onChange }: { row: Row; value: number; onChange: (v: number) => void }) {
  const { min, max } = FIT_RANGE[row.key];
  const shown = Math.round(value * row.view * 100) / 100;
  const [LessIcon, MoreIcon] = row.icons;
  const put = (v: number) => onChange(v / row.view);
  return (
    <div className="pf-row">
      <div className="pf-head">
        <MonoLabel>{row.label}</MonoLabel>
        <output className="pf-val">{row.say(shown)}</output>
      </div>
      <div className="pf-ctl">
        <button type="button" className="btn pf-step" aria-label={row.less} title={row.less} onClick={() => put(shown - row.nudge)}>
          <LessIcon size={16} aria-hidden />
        </button>
        <input type="range" className="rng pf-rng" aria-label={row.label} aria-valuetext={row.say(shown)} min={min * row.view} max={max * row.view} step={row.slide} value={shown} onChange={(e) => put(Number(e.target.value))} {...gesture} />
        <button type="button" className="btn pf-step" aria-label={row.more} title={row.more} onClick={() => put(shown + row.nudge)}>
          <MoreIcon size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * "Number plate position" of a car: the plate stays where the model put it unless nudged here. A nudge belongs to this car (`params.plateFront` / `plateRear`);
 * "Remember for this model" keeps it for every car of the model (lib/plateFitStore.ts). While the section is open the plate is outlined in the 3D view.
 */
export default function PlateFitPanel({ item, spec, set }: { item: Item; spec: CarSpec; set: (p: Partial<Item>) => void }) {
  const [end, setEnd] = useState<PlateEnd>("rear");
  const [open, setOpen] = useState(false);
  const entry = useCarModels((s) => s.models[spec.id]);
  const modelKey = plateModelKey(spec.id, entry?.resource);
  const remembered = usePlateFits((s) => fitsOfModel(s.fits, modelKey));
  const fixed = usePlateEdit((s) => !!entry && s.own.includes(entry.resource)); // the model's own plate mesh: nothing here can move it
  const own = itemPlateFits(item.params);
  const shown: PlateFit = own[end] ?? remembered?.[end] ?? defaultFit;

  useEffect(() => {
    usePlateEdit.getState().setEditing(open && !fixed ? { id: item.id, end } : null);
    return () => usePlateEdit.getState().setEditing(null);
  }, [open, fixed, item.id, end]);

  const store = (fit: PlateFit | undefined) => set({ params: withParams(item.params, { [PLATE_FIT_KEY[end]]: encodePlateFit(fit) }) });
  const remember = () => {
    usePlateFits.getState().remember(modelKey, resolvePlateFits(own, remembered));
    set({ params: withParams(item.params, { plateFront: undefined, plateRear: undefined }) }); // the model's place now carries it for this car too
  };
  const anyOwn = !!(own.front || own.rear);
  const status = own[end] ? `This car only. “Remember for this model” uses it for every ${spec.label}.` : remembered?.[end] ? `Applies to all ${spec.label} cars.` : "Automatic position.";

  return (
    <details className="plate-fit" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Number plate position</summary>
      <div className="pf-body">
        {fixed ? (
          <p className="field-note" role="status">This model has its own number plate, built into the model. It stays where the model puts it.</p>
        ) : (
          <>
            <p className="field-note">Move the plate over the one in the picture if the model has its own.</p>
            <Segmented<PlateEnd> label="Which plate" value={end} options={["front", "rear"]} format={(e) => (e === "front" ? "Front" : "Back")} onChange={setEnd} />
            {ROWS.map((r) => (
              <FitRow key={r.key} row={r} value={shown[r.key]} onChange={(v) => store({ ...shown, [r.key]: v })} />
            ))}
            <label className="pf-hide">
              <input type="checkbox" checked={shown.hidden} onChange={(e) => store({ ...shown, hidden: e.target.checked })} />
              Hide this plate
            </label>
            <div className="pf-actions">
              <button type="button" className="btn" disabled={!own[end]} onClick={() => store(undefined)}>
                {remembered?.[end] ? "Back to the saved position" : "Reset to automatic"}
              </button>
              <button type="button" className="btn" disabled={!anyOwn} onClick={remember}>
                Remember for this model
              </button>
              {remembered && (
                <button type="button" className="btn" onClick={() => usePlateFits.getState().forget(modelKey)}>
                  Forget the saved position
                </button>
              )}
            </div>
            <small className="field-note" role="status">{status}</small>
          </>
        )}
      </div>
    </details>
  );
}
