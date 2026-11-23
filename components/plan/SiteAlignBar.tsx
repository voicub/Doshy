"use client";
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, CheckIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { NUDGE_M, normBearing, nudgeSite } from "@/lib/siteUi";
import { siteOf } from "@/lib/siteTypes";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import { ARROWS, TURN_DEG } from "../ui/SiteAlignControls";
import { useSiteAlign } from "../ui/siteAlign";
import "../ui/sitePanel.css";
import "../ui/compactPanels.css";

/** Compact screens: one finger-sized row above the edit strip. Arrows nudge the map 1 m, the turn buttons rotate the plan, Settings brings the panel back, Done closes it. Dragging the canvas still works. */
function TouchBar() {
  const setAlign = useSiteAlign((s) => s.setAlign);
  const leave = useSiteAlign((s) => s.leave);
  const rawSite = useStore((s) => s.plan.site);
  const site = useMemo(() => siteOf(rawSite), [rawSite]);
  const bearing = useStore((s) => s.plan.bearing ?? 0);
  const setSite = useStore((s) => s.setSite);
  const setBearing = useStore((s) => s.setBearing);
  return (
    <div className="sp-alignbar sp-touchbar hud" role="group" aria-label="Line the map up">
      <p className="sp-ab-hint" role="status">Drag the map, or use the arrows, until the real building is under your flat.</p>
      <div className="sp-ab-row">
        {ARROWS.map((a) => (
          <button key={a.way} type="button" className="btn sp-ab-btn" aria-label={`Move the map ${a.way} ${NUDGE_M} metre`} onClick={() => setSite(nudgeSite(site, bearing, a.way, NUDGE_M))}>
            <a.Icon size={22} aria-hidden />
          </button>
        ))}
        <i className="sp-ab-sep" aria-hidden />
        <button type="button" className="btn sp-ab-btn" aria-label={`Turn the plan ${TURN_DEG} degrees counter-clockwise`} onClick={() => setBearing(normBearing(bearing - TURN_DEG))}><ArrowCounterClockwiseIcon size={22} aria-hidden /></button>
        <button type="button" className="btn sp-ab-btn" aria-label={`Turn the plan ${TURN_DEG} degrees clockwise`} onClick={() => setBearing(normBearing(bearing + TURN_DEG))}><ArrowClockwiseIcon size={22} aria-hidden /></button>
        <i className="sp-ab-sep" aria-hidden />
        <button type="button" className="btn sp-ab-btn sp-ab-text" onClick={() => setAlign(false)}><SlidersHorizontalIcon size={20} aria-hidden /> Settings</button>
        <button type="button" className="btn primary sp-ab-btn sp-ab-text" onClick={() => (leave ? leave() : setAlign(false))}><CheckIcon size={20} aria-hidden /> Done</button>
      </div>
    </div>
  );
}

/** Shown while "Drag the map" is on: says what a drag does now, and how to leave. Escape leaves too. */
export default function SiteAlignBar() {
  const setAlign = useSiteAlign((s) => s.setAlign);
  const compact = useVp().vp !== "regular";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAlign(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAlign]);
  if (compact) return <TouchBar />;
  return (
    <div className="sp-alignbar" role="status">
      <span>Drag anywhere to move the map under your plan until the real building matches your flat. Your walls stay put.</span>
      <button type="button" className="btn" onClick={() => setAlign(false)}>Done (Esc)</button>
    </div>
  );
}
