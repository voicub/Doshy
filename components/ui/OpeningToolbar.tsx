"use client";
import { useState } from "react";
import { MIN_OPENING, WALL_H } from "@/lib/geometry";
import { clamp } from "@/lib/mathUtil";
import { OPENING_STYLES, styleOf } from "@/lib/openings";
import { useStore, type OpeningSize } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import MonoLabel from "./MonoLabel";
import NumField from "./NumField";
import OpeningGallery, { OpeningLook, OpeningStyleBar } from "./OpeningGallery";
import "./OpeningToolbar.css";

/** Same physical limits the store enforces on a placed opening: under the ceiling, no smaller than the minimum. */
function fit(d: OpeningSize): OpeningSize {
  const sill = clamp(d.sill, 0, WALL_H - MIN_OPENING);
  return { width: clamp(d.width, MIN_OPENING, 10), sill, height: clamp(d.height, MIN_OPENING, WALL_H - sill) };
}

/** Look and size of the next door or window the user places: shown above the dock while the Door or Window tool is active. On compact screens it is one row that scrolls sideways, with colour, glass and exact sizes behind one chip. */
export default function OpeningToolbar() {
  const tool = useStore((s) => s.tool);
  const defaults = useStore((s) => s.openingDefaults);
  const setDefaults = useStore((s) => s.setOpeningDefaults);
  const { vp } = useVp();
  const [more, setMore] = useState(false);
  if (tool !== "door" && tool !== "window") return null;
  const d = defaults[tool];
  const set = (p: Partial<OpeningSize>) => setDefaults(tool, { ...p, ...fit({ ...d, ...p }) });
  const label = tool === "door" ? "Door" : "Window";
  const fields = (
    <div className="opening-fields">
      <NumField label="Width" unit="m" value={d.width} onChange={(width) => set({ width })} min={MIN_OPENING} />
      <NumField label="Height" unit="m" value={d.height} onChange={(height) => set({ height })} min={MIN_OPENING} max={WALL_H - d.sill} />
      <NumField label="Sill from floor" unit="m" value={d.sill} onChange={(sill) => set({ sill })} min={0} max={WALL_H - MIN_OPENING} />
    </div>
  );

  if (vp !== "regular")
    return (
      <>
        <aside className="opening-toolbar plan-bar hud brackets" aria-label={`${label} style and size`}>
          <OpeningStyleBar
            type={tool}
            value={d}
            onChange={set}
            more={
              <button type="button" className="preset plan-more" aria-expanded={more} onClick={() => setMore((v) => !v)}>
                Size and colour
              </button>
            }
          />
        </aside>
        {more && (
          <div className="plan-bar-pop hud brackets" role="group" aria-label={`${label} size and colour`}>
            <div className="plan-pop-head">
              <MonoLabel>{label}: size and colour</MonoLabel>
              <button type="button" className="btn plan-pop-done" onClick={() => setMore(false)}>
                Done
              </button>
            </div>
            <OpeningLook type={tool} value={d} onChange={set}>
              {fields}
            </OpeningLook>
          </div>
        )}
      </>
    );

  return (
    <aside className="opening-toolbar opening-picker hud brackets" aria-label={`${label} style and size`}>
      <div className="opening-head">
        <MonoLabel>{label}: {OPENING_STYLES[styleOf({ type: tool, style: d.style })].label}</MonoLabel>
        <small>Pick a look, then click a wall to place it.</small>
      </div>
      <OpeningGallery type={tool} value={d} onChange={set}>
        {fields}
      </OpeningGallery>
    </aside>
  );
}
