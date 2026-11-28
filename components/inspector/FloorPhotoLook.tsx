"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { paintFloor } from "@/lib/materials";
import { patchCmOf, scaleFromPatchCm, setFloorPhoto, SCALE_RANGE_M } from "@/lib/floorPhoto";
import { turnOf } from "@/lib/trace";
import { useStore } from "@/lib/store";
import type { Room } from "@/lib/types";
import FloorPhotoMaker from "@/components/ui/FloorPhotoMaker";

/** "Use a photo of my floor...": the picker dialog, and for a room that already wears a photo its size in real life, a quarter turn and Remove photo (each one undo step). */
export default function FloorPhotoLook({ room }: { room: Room }) {
  const editPlan = useStore((s) => s.editPlan);
  const [open, setOpen] = useState(false);
  const photo = room.floorPhoto;
  const size = { w: room.w, h: room.h };
  const [cm, setCm] = useState<string | null>(null);
  const shownCm = cm ?? (photo ? String(patchCmOf(photo.scaleM)) : "");
  const commitCm = () => {
    const n = Number((cm ?? "").replace(",", "."));
    setCm(null);
    if (photo && Number.isFinite(n) && n > 0) editPlan((p) => setFloorPhoto(p, room.id, { ...photo, scaleM: scaleFromPatchCm(n) }));
  };

  return (
    <div className="fpl-row">
      <button type="button" className="btn" onClick={() => setOpen(true)}>Use a photo of my floor...</button>
      {photo && (
        <>
          <span><i className="fpl-chip" style={{ background: photo.avg }} aria-hidden /> Wearing your floor photo</span>
          <label className="fpl-scale">
            <span>One picture is about</span>
            <input type="text" inputMode="decimal" value={shownCm} aria-label="Width of one picture in centimetres" onChange={(e) => setCm(e.target.value)} onBlur={commitCm} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
            <span>cm wide ({SCALE_RANGE_M.min * 100} cm to {SCALE_RANGE_M.max} m)</span>
          </label>
          <div className="fpm-actions">
            <button type="button" className="btn" onClick={() => editPlan((p) => setFloorPhoto(p, room.id, { ...photo, rotation: turnOf(photo.rotation + 90) }))}>Turn a quarter</button>
            <button type="button" className="btn" onClick={() => editPlan((p) => setFloorPhoto(p, room.id, null))}>Remove photo</button>
          </div>
        </>
      )}
      {open &&
        createPortal(
          <FloorPhotoMaker
            room={size}
            onClose={() => setOpen(false)}
            onPhoto={(f) => editPlan((p) => setFloorPhoto(p, room.id, f))}
            onColour={(color) => editPlan((p) => paintFloor(p, room.id, { material: null, color }))}
          />,
          document.body,
        )}
    </div>
  );
}
