"use client";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ZOOM_RANGE, cropBox } from "@/lib/floorPhoto";
import type { Picture } from "./floorPhotoImage";

export type CropState = { cx: number; cy: number; zoom: number };

const KEY_STEP = 0.04; // arrow keys move the square by this fraction of the picture's short side
const ZOOM_STEP = 1.15;

/**
 * The photo with a square on it: drag the square (or tap where it should go), pinch or use the zoom slider to make it bigger or smaller. The square is the patch of floor
 * that becomes the texture. Pointer events only, so a mouse, a finger and a pen all work; `touch-action: none` keeps the page from scrolling under a drag. Arrow keys move
 * the square and + / - zoom it, for keyboard users.
 */
export default function FloorPhotoCrop({ picture, crop, onChange }: { picture: Picture; crop: CropState; onChange: (c: CropState) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const live = useRef(crop); // the latest state, for the pointer handlers that run between renders
  useEffect(() => {
    live.current = crop;
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ grab: { dx: number; dy: number } } | { pinch: { dist: number; zoom: number } } | null>(null);
  const { w, h } = picture;
  const box = cropBox(w, h, crop.cx, crop.cy, crop.zoom);

  // the photo drawn once at about the size it is shown; the square and the dimming are plain elements on top, so dragging never redraws it
  useEffect(() => {
    const canvas = view.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const k = Math.min(1, 900 / Math.max(w, h));
    [canvas.width, canvas.height] = [Math.round(w * k), Math.round(h * k)];
    ctx.drawImage(picture.canvas, 0, 0, canvas.width, canvas.height);
  }, [picture, w, h]);

  const at = (e: PointerEvent) => {
    const r = stage.current?.getBoundingClientRect();
    return r && r.width > 0 ? { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h } : { x: w / 2, y: h / 2 };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      gesture.current = { pinch: { dist: spread() || 1, zoom: live.current.zoom } };
      return;
    }
    const p = at(e);
    const b = cropBox(w, h, live.current.cx, live.current.cy, live.current.zoom);
    const inside = p.x >= b.x && p.x <= b.x + b.side && p.y >= b.y && p.y <= b.y + b.side;
    const [cx, cy] = inside ? [live.current.cx, live.current.cy] : [p.x, p.y]; // a tap outside puts the square there; a grab inside keeps it where it is
    gesture.current = { grab: { dx: cx - p.x, dy: cy - p.y } };
    if (!inside) onChange({ ...live.current, cx, cy });
  };
  const move = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g && "pinch" in g && pointers.current.size === 2) {
      const zoom = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, g.pinch.zoom * (spread() / g.pinch.dist))); // fingers apart: zoom in on the photo, the square shrinks
      onChange({ ...live.current, zoom });
    } else if (g && "grab" in g) {
      const p = at(e);
      onChange({ ...live.current, cx: p.x + g.grab.dx, cy: p.y + g.grab.dy });
    }
  };
  const up = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const rest = [...pointers.current.entries()][0];
    gesture.current = null;
    if (rest) {
      // one finger stays down after a pinch: it carries on dragging from where the square is
      const r = stage.current?.getBoundingClientRect();
      if (r && r.width > 0) gesture.current = { grab: { dx: live.current.cx - ((rest[1].x - r.left) / r.width) * w, dy: live.current.cy - ((rest[1].y - r.top) / r.height) * h } };
    }
  };

  const key = (e: KeyboardEvent) => {
    const step = Math.min(w, h) * KEY_STEP;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) onChange({ ...crop, cx: crop.cx + move[e.key][0], cy: crop.cy + move[e.key][1] });
    else if (e.key === "+" || e.key === "=") onChange({ ...crop, zoom: Math.min(ZOOM_RANGE.max, crop.zoom * ZOOM_STEP) });
    else if (e.key === "-") onChange({ ...crop, zoom: Math.max(ZOOM_RANGE.min, crop.zoom / ZOOM_STEP) });
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={stage}
      className="fpc-stage"
      style={{ aspectRatio: `${w} / ${h}`, "--ar": w / h } as CSSProperties}
      tabIndex={0}
      role="group"
      aria-label="Pick the patch of floor: drag the square, or use the arrow keys to move it and plus and minus to resize it"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <canvas ref={view} className="fpc-photo" aria-hidden />
      <div className="fpc-box" aria-hidden style={{ left: `${(box.x / w) * 100}%`, top: `${(box.y / h) * 100}%`, width: `${(box.side / w) * 100}%`, height: `${(box.side / h) * 100}%` }} />
    </div>
  );
}
