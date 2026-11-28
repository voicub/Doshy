"use client";
import { useRef, type PointerEvent } from "react";
import { walkInput } from "../scene/walk/walkInput";
import { WAKE_EVENT } from "@/lib/framePacer";
import { joystickIntent } from "@/lib/walkMove";

/** The thumb may travel this far past the ring (as a share of its radius): out there it is a run. */
const OVERSHOOT = 1.5;

/** The on-screen joystick for touch screens (WalkHud.css shows it only there): push the knob to walk, past the ring to run. The right half of the picture is for looking, so the
 *  two thumbs never meet. It captures its own finger, so the look-around drag on the canvas is a second finger. */
export default function WalkJoystick() {
  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null);

  const move = (e: PointerEvent) => {
    const el = pad.current;
    if (!el || finger.current !== e.pointerId) return;
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + radius);
    const reach = Math.hypot(dx, dy);
    if (reach > radius * OVERSHOOT) [dx, dy] = [(dx / reach) * radius * OVERSHOOT, (dy / reach) * radius * OVERSHOOT];
    walkInput.stick = joystickIntent(dx, dy, radius);
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    window.dispatchEvent(new Event(WAKE_EVENT)); // touches on the HUD do not wake the scene by themselves
  };
  const release = (e: PointerEvent) => {
    if (finger.current !== e.pointerId) return;
    finger.current = null;
    walkInput.stick = { forward: 0, strafe: 0, sprint: false };
    if (knob.current) knob.current.style.transform = "";
  };

  return (
    <div
      ref={pad}
      className="walk-stick"
      role="group"
      aria-label="Movement stick: drag to walk, drag past the ring to run"
      onPointerDown={(e) => {
        if (finger.current !== null) return;
        finger.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={knob} className="walk-knob" />
    </div>
  );
}
