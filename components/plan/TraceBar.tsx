"use client";
import { XIcon } from "@phosphor-icons/react";
import { useVp } from "@/lib/useVp";
import "../ui/sitePanel.css";
import "../ui/compactPanels.css";
import { calibHint, useTraceUi } from "./traceUi";

/**
 * Compact screens only: while the two points of "set the scale" are being clicked the panel steps aside (it would cover the picture) and this one-row bar
 * says what to click and how to cancel. Same bar as "Line it up on the plan" (compactPanels.css .sp-touchbar). Once both points are placed the panel comes back.
 */
export default function TraceBar() {
  const compact = useVp().vp !== "regular";
  const calib = useTraceUi((s) => s.calib);
  if (!compact || !calib || (calib.a && calib.b)) return null;
  return (
    <div className="sp-alignbar sp-touchbar hud" role="group" aria-label="Set the scale">
      <p className="sp-ab-hint" role="status">{calibHint(calib)}</p>
      <div className="sp-ab-row">
        <button type="button" className="btn sp-ab-btn sp-ab-text" onClick={() => useTraceUi.getState().stopCalib()}><XIcon size={20} aria-hidden /> Cancel</button>
      </div>
    </div>
  );
}
