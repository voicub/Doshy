"use client";
import { useEffect, useRef, useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { CAR_COLORS, FINISHES, finishOf } from "@/lib/cars";
import { PLATE_MAX, PLATE_STYLES, plateOf, sanitizePlate, type PlateStyle } from "@/lib/plate";
import { drawPlate, plateCanvasSize } from "@/lib/plateDraw";
import type { Item } from "@/lib/types";
import CarRealModel from "./CarRealModel";
import { ColorPicker, Group } from "./shared";
import "./carPaint.css";
import "./carPlate.css";

type Params = NonNullable<Item["params"]>;
type Setter = (p: Partial<Item>) => void;

/** `params` with one key set, or removed when the value is undefined. */
const withParam = (params: Item["params"], key: string, value: string | undefined): Params => {
  const { [key]: _old, ...rest } = params ?? {};
  return value === undefined ? rest : { ...rest, [key]: value };
};

/** A plate picture on a small canvas: the live preview and the style chips. */
function PlateCanvas({ text, style, width, label }: { text: string; style: PlateStyle; width: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) drawPlate(ctx, cv.width, cv.height, text, style, "front");
  }, [text, style]);
  const [w, h] = plateCanvasSize(style, "front", width);
  return <canvas ref={ref} className="plate-canvas" width={w} height={h} role="img" aria-label={label ?? "Number plate preview"} />;
}

/** Number plate of a car: what it says and which country look it has. Typing is kept local; one undo step when you press Enter or leave the field. */
function PlateField({ item, set }: { item: Item; set: Setter }) {
  const { text, style } = plateOf(item.params);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text, item.id]);
  const commit = () => {
    const next = sanitizePlate(draft);
    setDraft(next);
    if (next !== text) set({ params: withParam(item.params, "plate", next || undefined) });
  };
  return (
    <Group label="Number plate">
      <div className="car-plate">
        <PlateCanvas text={draft ? sanitizePlate(draft) : ""} style={style} width={520} />
        <input
          className="plate-input"
          value={draft}
          maxLength={PLATE_MAX}
          placeholder="Type your plate"
          aria-label="Number plate text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setDraft(sanitizePlate(e.target.value, true))}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <small className="field-note">Letters, numbers, space and hyphen. Up to {PLATE_MAX} characters.</small>
        <div className="presets plate-styles" role="group" aria-label="Plate style">
          {PLATE_STYLES.map((s) => (
            <button key={s.id} type="button" className="preset plate-style" aria-pressed={style === s.id} onClick={() => set({ params: withParam(item.params, "plateStyle", s.id === "eu" ? undefined : s.id) })}>
              <PlateCanvas text={s.id === "blank" ? "" : "AB 123"} style={s.id} width={112} label={`${s.label} plate`} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        {(text || item.params?.plateStyle) && (
          <button type="button" className="preset" onClick={() => set({ params: withParam(withParam(item.params, "plate", undefined), "plateStyle", undefined) })}>
            Clear
          </button>
        )}
      </div>
    </Group>
  );
}

/** Paint colour of a car: the factory-style swatch row plus a free colour picker. No choice = the model's default paint. Then its finish and number plate. */
export default function CarPaint({ item, set }: { item: Item; set: Setter }) {
  const factory = CATALOG[item.kind]?.parts.find((p) => p.m)?.c ?? CAR_COLORS[0].c;
  const value = item.color ?? factory;
  const name = CAR_COLORS.find((c) => c.c === value.toLowerCase())?.name ?? "Custom colour";
  const finish = finishOf(item.params, value);
  return (
    <>
      {CATALOG[item.kind]?.car && <CarRealModel spec={CATALOG[item.kind].car!} />}
      <Group label="Paint">
        <div className="car-paint">
          <ColorPicker value={value} swatches={CAR_COLORS} onChange={(c) => set({ color: c })} />
          <small className="field-note">{name}</small>
          {item.color && item.color !== factory && (
            <button type="button" className="preset" onClick={() => set({ color: undefined })}>
              Back to model colour
            </button>
          )}
          <div className="presets" role="group" aria-label="Paint finish">
            {FINISHES.map((f) => (
              <button key={f.id} type="button" className="preset" aria-pressed={finish === f.id} onClick={() => set({ params: withParam(item.params, "finish", f.id) })}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Group>
      <PlateField item={item} set={set} />
    </>
  );
}
