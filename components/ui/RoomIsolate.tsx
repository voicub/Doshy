"use client";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { hasOpenPlan, isolationOf, stepRoom } from "@/lib/roomIsolate";
import { useStore } from "@/lib/store";
import "./roomIsolate.css";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Room mode ("enter a room"): a bar naming the room with previous / next, the open-plan switch and Exit. Left / Right step through the rooms, Esc leaves (the docked device list handles Esc). */
export default function RoomIsolate() {
  const zone = useStore(isolationOf);
  const roomId = useStore((s) => s.isolatedRoom);
  const open = useStore((s) => s.isolateOpen);
  const plan = useStore((s) => s.plan);
  const setRoom = useStore((s) => s.setIsolatedRoom);
  const setOpen = useStore((s) => s.setIsolateOpen);
  const active = !!zone && !!roomId;

  const step = (dir: 1 | -1) => {
    const next = roomId ? stepRoom(plan, roomId, dir, open) : undefined;
    if (next) setRoom(next);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const next = roomId ? stepRoom(useStore.getState().plan, roomId, dir, useStore.getState().isolateOpen) : undefined;
        if (next) useStore.getState().setIsolatedRoom(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, roomId]);

  if (!zone || !roomId) return null;
  const names = zone.hosts.map((id) => plan.rooms.find((r) => r.id === id)?.name ?? id).join(" + ");
  const several = !!stepRoom(plan, roomId, 1, open) && stepRoom(plan, roomId, 1, open) !== roomId;
  return (
    <div className="hud room-bar" role="toolbar" aria-label="Room view">
      <span className="room-bar-tag">Room</span>
      {several && (
        <button type="button" className="room-bar-btn" onClick={() => step(-1)} aria-label="Previous room" title="Previous room (Left arrow)">
          <CaretLeftIcon size={14} />
        </button>
      )}
      <strong className="room-bar-name" aria-live="polite">{names}</strong>
      {several && (
        <button type="button" className="room-bar-btn" onClick={() => step(1)} aria-label="Next room" title="Next room (Right arrow)">
          <CaretRightIcon size={14} />
        </button>
      )}
      {hasOpenPlan(plan, roomId) && (
        <button type="button" className="room-bar-chip" aria-pressed={open} onClick={() => setOpen(!open)} title="Show the whole open space this room belongs to">
          Whole open space
        </button>
      )}
      <button type="button" className="room-bar-exit" onClick={() => setRoom(null)} aria-label="Back to the whole home" title="Back to the whole home (Esc)">
        <XIcon size={14} /> <span>Whole home</span>
      </button>
    </div>
  );
}
