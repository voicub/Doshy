"use client";
import { ArrowsClockwiseIcon, BrowserIcon, CubeIcon, SquaresFourIcon, type Icon } from "@phosphor-icons/react";
import { CATALOG } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import { useEditUi, type Preset } from "./editStore";
import FlowPanel from "./FlowPanel";
import PickOverlay from "./PickOverlay";
import QuickToolbar from "./QuickToolbar";
import { useFlowUi } from "./flowUi";
import "./edit.css";

const PRESETS: { id: Preset; label: string; Glyph: Icon; title: string }[] = [
  { id: "iso", label: "ISO", Glyph: CubeIcon, title: "Isometric view" },
  { id: "top", label: "TOP", Glyph: SquaresFourIcon, title: "Straight down, plan up at the top" },
  { id: "front", label: "FRONT", Glyph: BrowserIcon, title: "Low front view" },
  { id: "reset", label: "RESET", Glyph: ArrowsClockwiseIcon, title: "Frame the whole plan" },
];

/** One line telling what the pointer and keys do right now. */
function useHint(view: "furniture" | "ha"): string {
  const tool = useStore((s) => s.tool);
  const sel = useStore((s) => s.sel);
  const gesture = useEditUi((s) => s.gesture);
  const connect = useFlowUi((s) => s.on);
  const pass = useEditUi((s) => s.passThrough);
  if (view === "ha" && connect) return "Connect energy: click the item the power comes from, then where it goes  /  click a label to edit a line  /  Esc closes";
  if (view === "ha") return sel ? "Link it in the panel on the right  /  click elsewhere to deselect" : "Click an item, a room floor or a door / window to link it to Home Assistant  /  drag to orbit";
  if (tool === "paint") return "Click furniture, a wall or a floor to paint it  /  Shift = both sides of a wall  /  Alt-click picks up a colour  /  Esc stops";
  if (tool.startsWith("add:")) return `Placing ${CATALOG[tool.slice(4)]?.label ?? "item"}  /  click to place  /  Shift keeps placing  /  R rotates  /  Esc cancels`;
  if (gesture?.mode === "move") return "Release to drop  /  Alt = no snapping  /  Shift = 1 cm steps  /  Esc cancels";
  if (gesture?.mode === "rotate") return "Release to set  /  snaps to 15 deg  /  Shift = 1 deg  /  Esc cancels";
  if (gesture?.mode === "elev") return "Release to set  /  sticks to 0.45 / 0.75 / 0.90 / 1.50 / 1.85 m  /  Alt = free";
  if (pass) return "Pick through is on: a click selects what lies behind the piece under the pointer  /  turn it off in the dock";
  if (sel) return "Drag to move  /  ring turns  /  arrow lifts  /  Tab next piece  /  Alt-click lists what is here  /  R rotates  /  Del removes";
  return "Click a piece to select  /  drag it across the floor  /  click again for the one behind  /  drag from the catalog to place";
}

/** Camera preset chips and the mode hint, over the canvas of the furniture and Home Assistant views. */
export default function EditOverlay({ view }: { view: "furniture" | "ha" }) {
  const setPreset = useEditUi((s) => s.setPreset);
  const hint = useHint(view);
  const tiny = useVp().vp !== "regular"; // compact screens: the edit strip carries the hint and the quick buttons
  return (
    <div className="edit-overlay">
      <div className="cam-chips hud brackets" role="toolbar" aria-label="Camera presets">
        {PRESETS.map(({ id, label, Glyph, title }) => (
          <button key={id} className="cam-chip" title={title} aria-label={title} onClick={() => setPreset(id)}>
            <Glyph size={13} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {!tiny && (
        <p className="edit-hint hud" role="status">
          {hint}
        </p>
      )}
      {view === "ha" && <FlowPanel />}
      {view === "furniture" && !tiny && <QuickToolbar />}
      <PickOverlay />
    </div>
  );
}
