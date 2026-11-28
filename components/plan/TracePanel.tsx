"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import HudPanel from "../ui/HudPanel";
import "../ui/sitePanel.css";
import "../ui/compactPanels.css";
import { PictureBlock, PickBlock, useTraceImport } from "./TracePick";
import TracePlace from "./TracePlace";
import TraceScale from "./TraceScale";
import TraceShow from "./TraceShow";
import TraceWalls from "./TraceWalls";
import { useTraceUi } from "./traceUi";
import "./trace.css";

/**
 * "Floor plan image": put a photo or scan of a floor plan under the plan, set its real size, and trace the walls over it. The picture is the plan's
 * `trace` (shown in Plan view only); every control here is one undo step. While the panel is open an unlocked picture shows its handles on the plan
 * (components/plan/TraceLayer.tsx). A PDF cannot be opened here (no PDF reader is bundled): the panel says so and asks for a PNG or JPG.
 */
export default function TracePanel({ onClose }: { onClose: () => void }) {
  const trace = useStore((s) => s.plan.trace);
  const importer = useTraceImport();
  // compact screens: the sheet would cover the picture while the two points are clicked; TraceBar (on the canvas) takes over until both are placed
  const compact = useVp().vp !== "regular";
  const placing = useTraceUi((s) => !!s.calib && !(s.calib.a && s.calib.b));
  const hidden = compact && placing;
  useEffect(() => {
    useTraceUi.getState().setPanel(true);
    return () => {
      const ui = useTraceUi.getState();
      ui.setPanel(false);
      ui.stopCalib(); // "set the scale" belongs to the open panel; the wall suggestions stay until cleared
    };
  }, []);
  if (hidden) return null;
  return (
    <HudPanel title="Floor plan image" onClose={onClose} className="drawer sp tr">
      <div className="sp-body tr-body" {...importer.drop}>
        {importer.input}
        {trace ? (
          <>
            <PictureBlock t={trace} i={importer} />
            <TraceScale t={trace} />
            <TraceWalls t={trace} onClose={onClose} />
            <TraceShow t={trace} />
            <TracePlace t={trace} />
          </>
        ) : (
          <PickBlock i={importer} />
        )}
      </div>
    </HudPanel>
  );
}
