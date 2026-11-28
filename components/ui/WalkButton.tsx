"use client";
import { PersonSimpleWalkIcon } from "@phosphor-icons/react";
import { walkHere } from "@/lib/walkStore";

/** "Walk": starts a first-person walk just inside the front door (or in `roomId`). Used by the guest page and anywhere a plain button fits. */
export default function WalkButton({ roomId, label = "Walk", className = "btn walk-start" }: { roomId?: string; label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => walkHere(roomId)} title="Walk through the home in first person">
      <PersonSimpleWalkIcon size={16} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
