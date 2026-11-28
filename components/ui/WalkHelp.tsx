"use client";
import { useEffect, useRef } from "react";

const ROWS: readonly (readonly [string, string])[] = [
  ["Walk", "W A S D or the arrow keys; on a touch screen the stick at the bottom left"],
  ["Look around", "Just move the mouse, no click needed (a key press or click also captures it, so the cursor never hits the edge; Esc lets go); drag on a touch screen; the left and right arrow keys turn"],
  ["Run", "Hold Shift; on a touch screen push the stick past its ring"],
  ["Use a device", "Point at it and click or press E; on a touch screen tap it. Walls hide what is behind them"],
  ["Change floor", "Walk up a staircase, or PageUp and PageDown, or the floor buttons at the top"],
  ["Mini-map", "M"],
  ["Leave", "Esc, or the Exit button"],
];

/** "How to walk": a dismissible card, shown the first time and from the "?" button; "Got it" remembers. Esc closes it first, so it never also ends the walk. */
export default function WalkHelp({ onClose }: { onClose: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const key = (e: KeyboardEvent) => e.code === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="walk-help hud brackets" role="dialog" aria-label="How to walk">
      <h2 className="walk-help-title">How to walk</h2>
      <table>
        <tbody>
          {ROWS.map(([what, how]) => (
            <tr key={what}>
              <th scope="row">{what}</th>
              <td>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button ref={ok} type="button" className="btn walk-help-ok" onClick={onClose}>Got it</button>
    </div>
  );
}
