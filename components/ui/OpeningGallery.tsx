"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { FRAME_COLORS, GLASS_TINTS, OPENING_STYLES, SIZE_CHIPS, STYLES_OF, chipOf, frameColor, restyle, styleDef, styleOf, styleSize } from "@/lib/openings";
import type { OpeningSize } from "@/lib/store";
import type { GlassTint, OpeningType } from "@/lib/types";
import MonoLabel from "./MonoLabel";
import OpeningThumb from "./OpeningThumb";
import { useColourDrag } from "./useColourDrag";
import "./OpeningGallery.css";

const TINTS = Object.keys(GLASS_TINTS) as (GlassTint | "clear")[];

type Props = { type: OpeningType; value: OpeningSize; onChange: (p: Partial<OpeningSize>) => void; /** The colour edits a placed opening: dragging in the picker is one undo step. Off for the defaults of the next one. */ undoable?: boolean };

/** What the chosen look is, derived once for every part of the picker. */
function partsOf({ type, value }: Pick<Props, "type" | "value">) {
  const cur = { type, ...value };
  const style = styleOf(cur);
  return { cur, style, chip: chipOf(style, value), glazed: type === "window" || !!styleDef(cur).glazed };
}

/** A row that scrolls sideways keeps the chosen style in the middle. */
function useCenterChosen(row: RefObject<HTMLElement | null>, style: string) {
  useEffect(() => {
    const g = row.current;
    const b = g?.querySelector<HTMLElement>('.opening-style[aria-pressed="true"]');
    if (g && b) g.scrollLeft = b.offsetLeft - g.clientWidth / 2 + b.offsetWidth / 2;
  }, [row, style]);
}

function StyleChips({ type, value, onChange }: Props) {
  const { cur, style } = partsOf({ type, value });
  return (
    <div className="opening-gallery" role="group" aria-label={`${type === "door" ? "Door" : "Window"} style`}>
      {STYLES_OF[type].map((s) => (
        <button key={s} type="button" className="opening-style" aria-pressed={s === style} title={OPENING_STYLES[s].hint} onClick={() => onChange(restyle(cur, s))}>
          <OpeningThumb style={s} size={44} />
          <span>{OPENING_STYLES[s].label}</span>
        </button>
      ))}
    </div>
  );
}

function SizeChips({ type, value, onChange }: Props) {
  const { style, chip } = partsOf({ type, value });
  return (
    <div className="presets" role="group" aria-label="Size">
      {SIZE_CHIPS.map((c) => {
        const z = styleSize(style, c);
        return (
          <button key={c} type="button" className="preset" aria-pressed={chip === c} title={`${z.width} x ${z.height} m`} onClick={() => onChange(z)}>
            {c}
          </button>
        );
      })}
    </div>
  );
}

/** Frame colour: the named swatches, and any colour from the system picker (a colour outside the swatches shows the picker as chosen). */
function ColourRow({ type, value, onChange, undoable }: Pick<Props, "type" | "value" | "onChange" | "undoable">) {
  const { drag, close } = useColourDrag((color) => onChange({ color }), undoable);
  const custom = !!value.color && !FRAME_COLORS.some((c) => c.color === value.color);
  return (
    <div className="opening-row">
      <MonoLabel>Colour</MonoLabel>
      <div className="swatches" role="group" aria-label="Frame colour">
        <button type="button" className="swatch swatch-none" aria-pressed={!value.color} aria-label="Default colour" title="Default colour" onClick={() => onChange({ color: undefined })} />
        {FRAME_COLORS.map((c) => (
          <button key={c.color} type="button" className="swatch" style={{ background: c.color }} aria-pressed={value.color === c.color} aria-label={c.label} title={c.label} onClick={() => onChange({ color: c.color })} />
        ))}
        <input type="color" className={custom ? "swatch-custom is-set" : "swatch-custom"} value={frameColor({ type, style: value.style, color: value.color })} onChange={(e) => drag(e.target.value)} onBlur={close} aria-label="Pick any frame colour" title="Any colour" />
      </div>
    </div>
  );
}

function GlassRow({ value, onChange }: Pick<Props, "value" | "onChange">) {
  return (
    <div className="opening-row">
      <MonoLabel>Glass</MonoLabel>
      <div className="presets" role="group" aria-label="Glass tint">
        {TINTS.map((t) => (
          <button key={t} type="button" className="preset" aria-pressed={(value.tint ?? "clear") === t} onClick={() => onChange({ tint: t === "clear" ? undefined : t })}>
            {GLASS_TINTS[t].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Everything the user can choose about how a door or window looks: a gallery of style thumbnails, three size chips, frame colour and glass tint.
 * Used by the toolbar (the next opening placed) and the inspector (the selected one). `children` go under an "Advanced" fold (the exact numbers).
 */
export default function OpeningGallery({ type, value, onChange, undoable, children }: Props & { children?: ReactNode }) {
  const { style } = partsOf({ type, value });
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // a long gallery scrolls sideways: keep the chosen style in the middle
    const g = wrap.current?.querySelector<HTMLElement>(".opening-gallery");
    const b = g?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (g && b) g.scrollLeft = b.offsetLeft - g.clientWidth / 2 + b.offsetWidth / 2;
  }, [style]);
  const { glazed } = partsOf({ type, value });
  return (
    <div ref={wrap} className="opening-gallery-wrap">
      <MonoLabel>Style</MonoLabel>
      <StyleChips type={type} value={value} onChange={onChange} />
      <small className="field-note">{OPENING_STYLES[style].hint}.</small>

      <div className="opening-row">
        <MonoLabel>Size</MonoLabel>
        <SizeChips type={type} value={value} onChange={onChange} />
      </div>

      <ColourRow type={type} value={value} onChange={onChange} undoable={undoable} />
      {glazed && <GlassRow value={value} onChange={onChange} />}

      {children && (
        <details className="opening-adv">
          <summary>Advanced</summary>
          {children}
        </details>
      )}
    </div>
  );
}

/** Compact screens: the styles as one row that scrolls sideways (the placement bar above the edit strip); `more` is the chip pinned at its end, so it is always in reach. */
export function OpeningStyleBar({ type, value, onChange, more }: Props & { more: ReactNode }) {
  const { style } = partsOf({ type, value });
  const row = useRef<HTMLDivElement>(null);
  useCenterChosen(row, style);
  return (
    <>
      <div ref={row} className="plan-bar-row">
        <StyleChips type={type} value={value} onChange={onChange} />
      </div>
      {more}
    </>
  );
}

/** Compact screens: what the "Size and colour" chip opens: size chips, frame colour, glass tint (windows and glazed doors) and the exact numbers (`children`). */
export function OpeningLook({ type, value, onChange, undoable, children }: Props & { children?: ReactNode }) {
  const { glazed } = partsOf({ type, value });
  return (
    <>
      <div className="opening-row">
        <MonoLabel>Size</MonoLabel>
        <SizeChips type={type} value={value} onChange={onChange} />
      </div>
      <ColourRow type={type} value={value} onChange={onChange} undoable={undoable} />
      {glazed && <GlassRow value={value} onChange={onChange} />}
      {children}
    </>
  );
}
