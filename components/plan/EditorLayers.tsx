"use client";
import { ArrowsOutCardinalIcon } from "@phosphor-icons/react";
import type { PointerEvent as RPE } from "react";
import { WALL_T } from "@/lib/geometry";
import { roomGroup } from "@/lib/planOps";
import type { Plan, Pt, Room, Sel, SelType, Wall } from "@/lib/types";
import { LINE, floorFill, wallFill } from "./BlueprintPaper";
import { Dim } from "./PlanBits";
import { areaLabel } from "./Dimensions";
import { hitOf } from "./hit";
import { ACCENT, CYAN_LINE, HALO, INK, MONO } from "./planStyle";
import { useRoomAround } from "./MeasureLabels";

/** Is this the selected thing? */
export const isSelected = (sel: Sel, type: SelType, id: string) => sel?.type === type && sel.id === id;

const LABEL = "var(--text)";
const haloOf = (u: number) => ({ ...HALO, strokeWidth: HALO.strokeWidth * u });
const sizeText = (w: number, h: number) => `${w.toFixed(2)} x ${h.toFixed(2)}`;

type Scale = { u: number; px: number };

/** Room floors: the pick area (tinted, outlined; selected rooms in the accent colour). Drawn under the walls. */
export function RoomFloors({ rooms, sel, u, onDown }: { rooms: Room[]; sel: Sel; u: number; onDown: (e: RPE, r: Room) => void }) {
  return rooms.map((r) => {
    const on = isSelected(sel, "room", r.id);
    return (
      <g key={r.id} onPointerDown={(e) => onDown(e, r)} style={{ cursor: "move" }}>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={floorFill(r.floor)} stroke={on ? ACCENT : CYAN_LINE} strokeOpacity={on ? 1 : 0.5} strokeWidth={(on ? 0.05 : 0.025) * u} strokeDasharray={on ? undefined : `${0.16 * u} ${0.12 * u}`} />
        {on && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={ACCENT} fillOpacity={0.08} pointerEvents="none" />}
        <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" />
      </g>
    );
  });
}

/** The level below: hairline walls and room outlines at 25 percent, so walls line up floor to floor. */
export function LevelBelow({ below, name, vb, u }: { below: Plan; name: string; vb: { x: number; y: number; h: number }; u: number }) {
  return (
    <g opacity={0.25} pointerEvents="none" fill="none" stroke="var(--plan-line)" strokeWidth={0.03 * u}>
      {below.rooms.map((r) => <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} strokeDasharray={`${0.12 * u} ${0.08 * u}`} />)}
      {below.walls.map((w) => <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} strokeWidth={WALL_T * 1.4} strokeLinecap="square" />)}
      {below.rooms.filter((r) => !r.parent).map((r) => <text key={`t${r.id}`} x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" fontSize={0.22 * u} fill="var(--plan-line)" stroke="none" style={MONO}>{r.name}</text>)}
      <text x={vb.x + 0.2 * u} y={vb.y + vb.h - 0.3 * u} fontSize={0.22 * u} fill="var(--plan-line)" stroke="none" style={MONO}>{`UNDERLAY: ${name.toUpperCase()}`}</text>
    </g>
  );
}

/** Cut walls, drawn as section: light outline first, then the hatched body, so joints merge into one outline. */
export function CutWalls({ walls, hatchOf, px }: { walls: Wall[]; hatchOf: Record<string, Wall["style"]>; px: number }) {
  return (
    <g pointerEvents="none">
      {walls.map((w) => <line key={`o${w.id}`} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={LINE} strokeWidth={Math.max(w.thickness ?? WALL_T, 3 * px) + 2 * px} strokeLinecap="square" />)}
      {walls.map((w) => <line key={`f${w.id}`} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={wallFill(hatchOf[w.id] ?? w.style)} strokeWidth={Math.max(w.thickness ?? WALL_T, 3 * px)} strokeLinecap="square" />)}
    </g>
  );
}

/** Invisible pick strips over every wall (wider for a finger), plus the selected wall's highlight. */
export function WallPicks({ walls, sel, px, touch, onDown }: { walls: Wall[]; sel: Sel; px: number; touch: number; onDown: (e: RPE, w: Wall) => void }) {
  return walls.map((w) => (
    <g key={w.id} onPointerDown={(e) => onDown(e, w)} style={{ cursor: "move" }}>
      <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="transparent" strokeWidth={Math.max(0.4, (touch > 1 ? 44 : 0) * px)} />
      {isSelected(sel, "wall", w.id) && (
        <>
          <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={ACCENT} strokeWidth={Math.max(w.thickness ?? WALL_T, 3 * px) + 4 * px} strokeLinecap="square" pointerEvents="none" />
          <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="url(#bp-wall)" strokeWidth={Math.max(w.thickness ?? WALL_T, 3 * px)} strokeLinecap="square" pointerEvents="none" />
        </>
      )}
    </g>
  ));
}

type ChipProps = Scale & { plan: Plan; sel: Sel; tool: string; tiny: boolean; showDims: boolean; touch: number; onGrab: (e: RPE, r: Room) => void };

/** Each room's name and size, with a move handle at its top-left corner. Threshold floor strips stay drawn and selectable, without a chip or handle. */
export function RoomChips({ plan, sel, tool, tiny, showDims, u, px, touch, onGrab }: ChipProps) {
  const halo = haloOf(u);
  const around = useRoomAround(); // "Show room areas": the way round joins the area in each room's label
  return plan.rooms.filter((r) => !(r.parent && r.w * r.h < 0.5)).map((r) => {
    const on = isSelected(sel, "room", r.id);
    const s = 22 * px * touch; // the room's move handle: a square at its top-left corner, with the name beside it
    const hx = r.x + 6 * px;
    const hy = r.y + 6 * px;
    const hit = hitOf(s, px, touch);
    const grip = tool === "select" && (!tiny || on); // on a small screen only the selected room shows its move handle: the rest stays readable
    const lx = grip ? hx + s + 8 * px : r.x + 0.2 * u;
    const [y1, y2] = tiny ? [hy + 0.16 * u, hy + 0.4 * u] : [hy + 10 * px, hy + 22 * px]; // type size follows u on a small screen
    return (
      <g key={r.id}>
        <g pointerEvents="none">
          <text x={lx} y={y1} fontSize={(tiny ? 0.2 : 0.26) * u} fill={LABEL} style={{ ...MONO, textTransform: "uppercase", letterSpacing: tiny ? "0.06em" : "0.14em", ...halo }}>{r.name}</text>
          {(!tiny || showDims || on || around(plan, r)) && <text x={lx} y={y2} fontSize={(tiny ? 0.2 : 0.21) * u} fill={ACCENT} style={{ ...MONO, ...halo }}>{`${sizeText(r.w, r.h)}  ${areaLabel(plan, r)}`}</text>}
          {around(plan, r) && <text x={lx} y={y2 + (y2 - y1)} fontSize={(tiny ? 0.2 : 0.21) * u} fill={ACCENT} style={{ ...MONO, ...halo }}>{around(plan, r)}</text>}
        </g>
        {grip && (
          <g onPointerDown={(e) => onGrab(e, r)} style={{ cursor: "move" }}>
            <title>Move room with its walls and furniture (Alt: floor only)</title>
            <rect x={hx + s / 2 - hit / 2} y={hy + s / 2 - hit / 2} width={hit} height={hit} fill="transparent" />
            <rect x={hx} y={hy} width={s} height={s} fill={INK} fillOpacity={0.9} stroke={on ? ACCENT : CYAN_LINE} strokeWidth={px} />
            <g transform={`translate(${hx + 4 * px} ${hy + 4 * px}) scale(${(14 * px) / 256})`} pointerEvents="none">
              <ArrowsOutCardinalIcon size={256} color={ACCENT} weight="bold" />
            </g>
          </g>
        )}
      </g>
    );
  });
}

/** Wall end handles of the selected wall: dragging one moves every wall end at that corner. */
export function WallEndHandles({ wall, px, touch, onDown }: { wall: Wall; px: number; touch: number; onDown: (e: RPE, which: "a" | "b") => void }) {
  return (["a", "b"] as const).map((k) => {
    const p = wall[k];
    const s = 10 * px * touch;
    const h = hitOf(20 * px * touch, px, touch);
    return (
      <g key={k} onPointerDown={(e) => onDown(e, k)} style={{ cursor: "crosshair" }}>
        <title>Drag to move this end of the wall</title>
        <rect x={p.x - h / 2} y={p.y - h / 2} width={h} height={h} fill="transparent" />
        <rect x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} fill={INK} stroke={ACCENT} strokeWidth={1.5 * px} />
      </g>
    );
  });
}

/** The wall being drawn: a dashed line from its start to the pointer, with its length. */
export function WallDraft({ start, cur, u, px, touch }: { start: Pt; cur: Pt } & Scale & { touch: number }) {
  return (
    <>
      <line x1={start.x} y1={start.y} x2={cur.x} y2={cur.y} stroke={ACCENT} strokeWidth={WALL_T} strokeDasharray="0.2 0.1" pointerEvents="none" />
      {touch > 1 && <circle cx={start.x} cy={start.y} r={7 * px} fill={ACCENT} stroke={INK} strokeWidth={1.5 * px} pointerEvents="none" />}
      {(touch === 1 || cur.x !== start.x || cur.y !== start.y) && <Dim a={start} b={cur} u={u} text={`${Math.hypot(cur.x - start.x, cur.y - start.y).toFixed(2)} m`} />}
    </>
  );
}

/** A rectangle being dragged out (a room, or a stairs opening when `dashed`): tinted, with its size at the centre. */
export function RectDraft({ start, cur, u, dashed }: { start: Pt; cur: Pt; u: number; dashed?: boolean }) {
  const [w, h] = [Math.abs(cur.x - start.x), Math.abs(cur.y - start.y)];
  return (
    <>
      <rect x={Math.min(cur.x, start.x)} y={Math.min(cur.y, start.y)} width={w} height={h} fill={ACCENT} fillOpacity={0.1} stroke={ACCENT} strokeWidth={0.04 * u} strokeDasharray={dashed ? `${0.14 * u} ${0.1 * u}` : undefined} pointerEvents="none" />
      <text x={(cur.x + start.x) / 2} y={(cur.y + start.y) / 2} fontSize={0.26 * u} textAnchor="middle" fill={LABEL} style={{ ...MONO, ...haloOf(u) }} pointerEvents="none">
        {`${sizeText(w, h)} m`}
      </text>
    </>
  );
}

/** The room being dragged, with its alcoves, outlined. */
export function DragRoomOutline({ plan, room, px }: { plan: Plan; room: Room; px: number }) {
  return roomGroup(plan, plan.rooms.find((r) => r.id === room.parent) ?? room).map((r) => (
    <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={ACCENT} fillOpacity={0.08} stroke={ACCENT} strokeWidth={2 * px} pointerEvents="none" />
  ));
}
