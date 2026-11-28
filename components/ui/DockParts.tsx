"use client";
import { ArmchairIcon, BlueprintIcon, BrowserIcon, ColumnsIcon, CubeIcon, CursorIcon, DoorIcon, DotsThreeIcon, FlowerIcon, LineSegmentIcon, MagnifyingGlassIcon, NotePencilIcon, PaintBucketIcon, PlugsConnectedIcon, RoadHorizonIcon, RulerIcon, SquareIcon, StairsIcon } from "@phosphor-icons/react";
import { useContext, type ReactNode } from "react";
import { useStore, VIEWS, type Tool, type View } from "@/lib/store";
import { useChromeUi } from "./chromeUi";
import { RowsCtx } from "./rowsCtx";

export const TOOLS: { tool: Tool; label: string; icon: ReactNode; hint: string }[] = [
  { tool: "select", label: "Select", icon: <CursorIcon size={18} />, hint: "Drag to move. R rotates, Delete removes." },
  { tool: "wall", label: "Wall", icon: <LineSegmentIcon size={18} />, hint: "Click to start a wall, click again to continue. Esc to finish. Pick Fence in the strip to draw a fence." },
  { tool: "room", label: "Room", icon: <SquareIcon size={18} />, hint: "Drag a rectangle to paint a floor area." },
  { tool: "door", label: "Door", icon: <DoorIcon size={18} />, hint: "Click on a wall to place a door." },
  { tool: "window", label: "Window", icon: <BrowserIcon size={18} />, hint: "Click on a wall to place a window." },
  { tool: "pillar", label: "Pillar", icon: <ColumnsIcon size={18} />, hint: "Pick a shape in the panel, then click where the pillar stands. It snaps to wall ends and wall lines (Alt: free)." },
  { tool: "paint", label: "Paint", icon: <PaintBucketIcon size={18} />, hint: "Pick a material and colour in the panel, then click walls and rooms. Alt-click picks up a colour." },
  { tool: "stairwell", label: "Stairs opening", icon: <StairsIcon size={18} />, hint: "Drag a rectangle where the stairs go up through the floor. The stairs themselves come from the Furniture catalog." },
  { tool: "garden", label: "Garden", icon: <FlowerIcon size={18} />, hint: "Pick a surface, then drag a patio, lawn or pond. Presets drop a ready-made size with one click." },
  { tool: "lines", label: "Garden lines", icon: <RoadHorizonIcon size={18} />, hint: "Roads, paths, fences and lights: pick a kind, click points on the plan, double-click to finish." },
  { tool: "ruler", label: "Measure", icon: <RulerIcon size={18} />, hint: "Click two points to measure. Use the panel for wall lengths, room areas and 'Does it fit here?'." },
  { tool: "annotate", label: "Notes", icon: <NotePencilIcon size={18} />, hint: "Pick a note, arrow, dimension or zone, then click the plan. Click one to edit or delete it." },
  { tool: "pipes", label: "Pipes", icon: <LineSegmentIcon size={18} />, hint: "Draw water, gas and drain lines. Add valves, then link them in Home Assistant view." },
];

export const MODES: Record<View, { label: string; icon: ReactNode; hint: string }> = {
  live: { label: "Live", icon: <CubeIcon size={15} />, hint: "" },
  plan: { label: "Plan", icon: <BlueprintIcon size={15} />, hint: "Plan: walls, rooms, doors, windows and pillars. Furniture lives in Furniture mode." },
  furniture: { label: "Furniture", icon: <ArmchairIcon size={15} />, hint: "Furniture: pick from the catalog, click the floor to place, drag to move." },
  ha: { label: "Home Assistant", icon: <PlugsConnectedIcon size={15} />, hint: "Home Assistant: select furniture, a room or a door and link an entity, or place a marker for a sensor." },
};
const SHORT: Record<View, string> = { live: "Live", plan: "Plan", furniture: "Furniture", ha: "HA" };

export function DockButton({ label, text, shortcut, active, disabled, stay, dev, onClick, children }: { label: string; /** row label in the compact menu (default: label) */ text?: string; shortcut?: string; active?: boolean; disabled?: boolean; /** compact menu: keep the menu open after the tap */ stay?: boolean; /** developer-ish: hidden in kiosk mode */ dev?: boolean; onClick: () => void; children: ReactNode }) {
  const rows = useContext(RowsCtx);
  if (rows) {
    return (
      <button type="button" className={`more-row ${active ? "active" : ""}`} data-dev={dev ? "" : undefined} aria-pressed={active} aria-label={label} disabled={disabled} onClick={() => { onClick(); if (!stay) rows.done(); }}>
        {children}
        <span className="more-text">{text ?? label}</span>
      </button>
    );
  }
  return (
    <button className={`dock-btn tip ${active ? "active" : ""}`} data-tip={shortcut ? `${label}  ${shortcut}` : label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
export function Sep() {
  return useContext(RowsCtx) ? <hr className="more-sep" /> : <i className="dock-sep" />;
}

/** LIVE | PLAN | FURNITURE | HA: which job the user is doing. Labels collapse to icons on narrow screens. */
export function ModeSwitch() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <div className="seg modes" role="group" aria-label="Mode">
      {VIEWS.map((v, i) => (
        <button key={v} type="button" className="tip" data-tip={`${MODES[v].label}  ALT ${i + 1}`} aria-pressed={v === view} aria-label={MODES[v].label} onClick={() => setView(v)}>
          {MODES[v].icon}
          <span className="mode-lbl">{SHORT[v]}</span>
        </button>
      ))}
    </div>
  );
}

/** Bottom bar of the compact layout: the four modes in one tap, and More (the menu sheet with every other action). */
export function CompactBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const menu = useChromeUi((s) => s.menu);
  return (
    <nav className="cdock hud" aria-label="Modes">
      {VIEWS.map((v) => (
        <button key={v} type="button" className="cd-btn" aria-pressed={v === view} aria-label={MODES[v].label} onClick={() => setView(v)}>
          {MODES[v].icon}
          <span>{SHORT[v]}</span>
        </button>
      ))}
      <button type="button" className="cd-btn" aria-expanded={menu} aria-label="More" onClick={() => useChromeUi.getState().setMenu(!menu)}>
        <DotsThreeIcon size={24} weight="bold" />
        <span>More</span>
      </button>
    </nav>
  );
}

/** Command palette: a keyboard-hint button on the dock, a labelled row in the compact menu. */
export function PaletteButton({ mod, onClick }: { mod: string; onClick: () => void }) {
  return useContext(RowsCtx) ? (
    <DockButton label="Search and commands" dev onClick={onClick}><MagnifyingGlassIcon size={18} /></DockButton>
  ) : (
    <button className="kbd" onClick={onClick} aria-label="Open command palette">{`${mod} K`}</button>
  );
}
