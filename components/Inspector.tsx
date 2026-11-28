"use client";
import { useStore } from "@/lib/store";
import FurnitureInspector from "./inspector/FurnitureInspector";
import GroundPanel, { GardenPanel } from "./inspector/GroundPanel";
import LinesPanel from "./inspector/LinesPanel";
import LinkInspector from "./inspector/LinkInspector";
import PaintPanel from "./inspector/PaintPanel";
import PillarPanel from "./inspector/PillarPanel";
import PlanInspector from "./inspector/PlanInspector";
import { useVp } from "@/lib/useVp";
import { useEditUi } from "./scene/edit/editStore";

/** Routes the selection to the inspector of the current editing mode. The store only lets a view select what belongs to it. */
export default function Inspector() {
  const sel = useStore((s) => s.sel);
  const view = useStore((s) => s.view);
  const painting = useStore((s) => s.tool === "paint" && (s.view === "plan" || s.view === "furniture"));
  const gardening = useStore((s) => s.tool === "garden" && s.view === "plan");
  const drawingLines = useStore((s) => s.tool === "lines" && s.view === "plan");
  const compact = useVp().vp !== "regular";
  const opened = useEditUi((s) => s.inspectorOpen);
  if (compact && view !== "ha" && !painting && !gardening && !drawingLines && !opened) return null; // compact screens: a tap on a piece must not cover the canvas, "Edit" in the edit strip opens this
  if (painting) return <PaintPanel />;
  if (gardening) return <GardenPanel />;
  if (drawingLines) return <LinesPanel />;
  if (!sel) return null;
  // key: edit state (typed drafts, clamp notices) never leaks from one selection to the next
  const key = `${view}:${sel.type}:${sel.id}`;
  if (view === "plan") {
    if (sel.type === "ground" || sel.type === "path") return <GroundPanel key={key} type={sel.type} id={sel.id} />;
    return sel.type === "item" ? <PillarPanel key={key} id={sel.id} /> : <PlanInspector key={key} type={sel.type} id={sel.id} />;
  }
  if (view === "furniture" && sel.type === "item") return <FurnitureInspector key={key} id={sel.id} />;
  if (view === "ha" && sel.type !== "wall" && sel.type !== "void" && sel.type !== "ground" && sel.type !== "path") return <LinkInspector key={key} type={sel.type} id={sel.id} />;
  return null;
}
