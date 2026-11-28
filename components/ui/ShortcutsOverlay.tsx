"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import HudPanel from "./HudPanel";
import useRestoreFocus from "./useRestoreFocus";
import "./palette.css";

const GROUPS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: "Global",
    rows: [
      ["Command palette", ["CMD", "K"]],
      ["Command palette", ["/"]],
      ["Shortcuts", ["?"]],
      ["Entity browser", ["E"]],
      ["Climate and thermostat", ["H"]],
      ["Statistics", ["S"]],
      ["Energy flows (solar, battery, grid, car)", ["N"]],
      ["History replay: scrub the last 24 hours or 7 days", ["Y"]],
      ["Notifications and updates from Home Assistant", ["I"]],
      ["Calendar (Home Assistant and the dashboard's own)", ["D"]],
      ["Plex and bedroom TV", ["P"]],
      ["Media: what is playing, play, pause, volume", ["M"]],
      ["Room view: next or previous room (Esc leaves)", ["LEFT", "RIGHT"]],
      ["Cycle live layer (heat, humidity, presence, power)", ["L"]],
      ["Device card from the palette", ["SHIFT", "ENTER"]],
      ["Cycle mode: Live, Plan, Furniture, Home Assistant", ["V"]],
      ["Jump to a mode", ["ALT", "1-4"]],
      ["Next or previous level", ["PGUP", "PGDN"]],
      ["Cycle time of day", ["T"]],
      ["Time of day follows the real sun", ["A"]],
      ["Cycle weather, then back to real weather", ["W"]],
      ["Toggle environment", ["G"]],
      ["Toggle cut-away", ["X"]],
      ["Cinema mode", ["C"]],
      ["Release room focus or close", ["ESC"]],
    ],
  },
  {
    title: "Plan (walls, doors, windows)",
    rows: [
      ["Select, Wall, Room, Door, Window, Pillar, Paint, Stairs opening, Garden", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]],
      ["Paint bucket (Plan and Furniture)", ["B"]],
      ["Paint: pick up a colour", ["ALT", "CLICK"]],
      ["Paint: both sides of a wall", ["SHIFT", "CLICK"]],
      ["Walls, rooms, openings grid 5 cm, Shift 25 cm, Alt free", ["DRAW"]],
      ["Garden lines (roads, paths, fences, lights): finish the line", ["DOUBLE-CLICK"]],
      ["Drag a room with its walls and furniture", ["HANDLE"]],
      ["Drag room: floor only", ["ALT", "DRAG"]],
      ["Door: hinge on the other end while placing", ["SHIFT"]],
      ["Undo", ["CMD", "Z"]],
      ["Redo", ["CMD", "SHIFT", "Z"]],
      ["Fit plan to view", ["0"]],
      ["Zoom about the cursor", ["WHEEL"]],
      ["Pan", ["SPACE", "DRAG"]],
      ["Pan", ["MIDDLE", "DRAG"]],
      ["Delete selected wall, room, opening or pillar", ["DEL"]],
      ["Cancel tool or finish wall", ["ESC"]],
    ],
  },
  {
    title: "Furniture (pick, move, turn, lift)",
    rows: [
      ["Select a piece; the same spot again picks the one behind", ["CLICK"]],
      ["List everything under the pointer (touch: hold your finger down)", ["ALT", "CLICK"]],
      ["Next piece under the pointer or in the room (Shift: previous)", ["TAB"]],
      ["Move (Alt no snapping, Shift 1 cm)", ["DRAG"]],
      ["Turn: drag the ring (15 deg, Shift 1 deg)", ["RING"]],
      ["Lift: drag the arrow (Alt free)", ["ARROW"]],
      ["Turn 90 deg, turn 15 deg", ["R", "[ ]"]],
      ["Nudge 5 cm (Shift 1 cm, Ctrl 25 cm)", ["ARROWS"]],
      ["Raise or lower 5 cm (Shift 1 cm)", ["PGUP", "PGDN"]],
      ["Move into the quick toolbar next to the piece", ["ENTER"]],
      ["Duplicate, copy, paste", ["CMD", "D", "C", "V"]],
      ["Lock a piece so clicks and drags skip it (Lock in the dock or toolbar)", ["LOCK"]],
      ["Pick through: a click selects what is behind (dock)", ["STACK"]],
      ["Deselect, or click bare floor", ["ESC"]],
    ],
  },
];

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useRestoreFocus();
  useEffect(() => box.current?.focus(), []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "?") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault();
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onKeyDown={onKey} className="shortcuts-wrap">
        <HudPanel title="Shortcuts" meta="Press ESC to close" onClose={onClose} className="shortcuts">
          <div className="sc-grid">
            {GROUPS.map((g) => (
              <div key={g.title} className="sc-col">
                <span className="label">{g.title}</span>
                {g.rows.map(([name, keys]) => (
                  <div key={name + keys.join()} className="sc-row">
                    <span>{name}</span>
                    <span className="sc-keys">{keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </HudPanel>
      </div>
    </div>
  );
}
