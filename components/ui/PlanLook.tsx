"use client";
import { CheckIcon } from "@phosphor-icons/react";
import { PLAN_COLORS, PLAN_ICONS, PlanGlyph } from "./planUi";

/** Icon and colour pickers for a plan: big, tappable swatches, with the current choice marked. Nothing chosen = the default house in plain colours. */
export default function PlanLook({ icon, color, onIcon, onColor }: { icon: string; color: string; onIcon: (key: string) => void; onColor: (value: string) => void }) {
  return (
    <>
      <div className="pf-field" role="radiogroup" aria-label="Icon">
        <span className="label">Icon</span>
        <div className="pl-grid">
          {PLAN_ICONS.map(({ key, label }) => (
            <button key={key} type="button" role="radio" aria-checked={icon === key} aria-label={label} title={label} className="pl-icon" onClick={() => onIcon(key)}>
              <PlanGlyph icon={key} color={color} size={22} />
            </button>
          ))}
        </div>
      </div>
      <div className="pf-field" role="radiogroup" aria-label="Colour">
        <span className="label">Colour</span>
        <div className="pl-grid">
          <button type="button" role="radio" aria-checked={color === ""} aria-label="No colour" title="No colour" className="pl-swatch none" onClick={() => onColor("")}>{color === "" && <CheckIcon size={14} aria-hidden />}</button>
          {PLAN_COLORS.map(({ value, label }) => (
            <button key={value} type="button" role="radio" aria-checked={color === value} aria-label={label} title={label} className="pl-swatch" style={{ background: value }} onClick={() => onColor(value)}>
              {color === value && <CheckIcon size={14} weight="bold" aria-hidden />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
