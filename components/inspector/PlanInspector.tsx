"use client";
import { PersonSimpleWalkIcon, TrashIcon, WallIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { WALL_H, WALL_T, wallLen } from "@/lib/geometry";
import { isFence } from "@/lib/fences";
import { GATE_KINDS, gateFor, type GateKind } from "@/lib/gates";
import { doorSwingBlockers, hingeForHand, hingeHand, openingEnd, openingStart, outwardFacing, tFromEnd, tFromStart, wallSides } from "@/lib/planOps";
import { HANDED, styleOf, styleSize, swings } from "@/lib/openings";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import type { Item, Opening, OpeningType, Room, Wall } from "@/lib/types";
import { walkHere } from "@/lib/walkStore";
import HudPanel from "../ui/HudPanel";
import MonoLabel from "../ui/MonoLabel";
import VoidPanel from "./VoidPanel";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import OpeningGallery from "../ui/OpeningGallery";
import { levelIdOf, planOfLevel } from "@/lib/levels";
import { Group, LevelTag } from "./shared";
import { closeInspector } from "./closeInspector";
import { RoomLook, WallLook } from "./SurfaceLook";

const OPENING_TYPES: readonly OpeningType[] = ["door", "window"];
const HANDS: readonly ("left" | "right")[] = ["left", "right"];
/** An opening counts as clamped when a value ended up this far (metres) from what was typed. */
const CLAMP_EPS = 0.005;
type DimKey = "Width" | "Height" | "Sill" | "From start" | "From end";

function WallPanel({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const remove = useStore((s) => s.remove);
  const resizeWallTo = useStore((s) => s.resizeWallTo);
  const w = plan.walls.find((x) => x.id === id);
  if (!w) return null;
  const len = wallLen(w);
  // one undo step: addOpening commits once; the new opening is the last one in the plan
  const addGate = (kind: GateKind) => {
    const gate = gateFor(w, plan.openings, kind);
    if (!gate) return;
    useStore.getState().addOpening(gate);
    const made = useStore.getState().plan.openings.at(-1);
    if (made) useStore.getState().select({ type: "opening", id: made.id });
  };
  return (
    <HudPanel title="Wall" meta={<><LevelTag plan={plan} entity={w} />{`${len.toFixed(2)} m`}</>} onClose={closeInspector} className="inspector">
      <div className="field">
        <NumField label="Length" unit="m" value={len} step={0.05} min={0.1} live={false} onChange={(v) => resizeWallTo(w.id, v)} />
        <small className="field-note">Moves the far end along the wall. Thickness is fixed at {Math.round((w.thickness ?? WALL_T) * 100)} cm.</small>
      </div>
      <WallLook wall={w} />
      {isFence(w.style) && (
        <Group label="Gate">
          {(Object.keys(GATE_KINDS) as GateKind[]).map((k) => {
            const room = gateFor(w, plan.openings, k) !== null;
            return (
              <button key={k} type="button" className="btn" disabled={!room} title={room ? undefined : "There is no free stretch of this fence wide enough for it."} onClick={() => addGate(k)}>
                {GATE_KINDS[k].label}
              </button>
            );
          })}
          <small className="field-note">Cuts a swinging gate into the middle of the fence. You can move it and change its size afterwards.</small>
        </Group>
      )}
      <p className="hint">Drag to move; delete and redraw to resize.</p>
      <button className="btn danger" onClick={() => remove("wall", w.id)}><TrashIcon size={14} /> Delete</button>
    </HudPanel>
  );
}

function RoomPanel({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const { patch, remove, moveRoom, resizeRoomTo, createRoomWalls } = useStore(useShallow((s) => ({ patch: s.patch, remove: s.remove, moveRoom: s.moveRoom, resizeRoomTo: s.resizeRoomTo, createRoomWalls: s.createRoomWalls })));
  const [wallsMade, setWallsMade] = useState<number | null>(null);
  const r = plan.rooms.find((x) => x.id === id);
  if (!r) return null;

  const set = (p: Partial<typeof r>) => patch("room", r.id, p);
  const parents = plan.rooms.filter((o) => o.id !== r.id && !o.parent);
  const addWalls = () => {
    const before = plan.walls.length;
    createRoomWalls(r.id);
    setWallsMade(useStore.getState().plan.walls.length - before);
  };

  return (
    <HudPanel title="Room" meta={<><LevelTag plan={plan} entity={r} />{`${(r.w * r.h).toFixed(1)} m2`}</>} onClose={closeInspector} className="inspector">
      <label className="field"><MonoLabel>Name</MonoLabel><input value={r.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="ins-look"><RoomLook room={r} /></div>
      <Group label="Inside size" className="ins-pos">
        <div className="grid3">
          <NumField label="Width" unit="m" value={r.w} step={0.05} min={0.5} live={false} onChange={(w) => resizeRoomTo(r.id, w, r.h)} />
          <NumField label="Depth" unit="m" value={r.h} step={0.05} min={0.5} live={false} onChange={(h) => resizeRoomTo(r.id, r.w, h)} />
        </div>
        <small className="field-note">Moves the east and south walls.</small>
      </Group>
      <Group label="Position" className="ins-pos">
        <div className="grid3">
          <NumField label="X" unit="m" value={r.x} step={0.05} live={false} onChange={(x) => moveRoom(r.id, x - r.x, 0)} />
          <NumField label="Y" unit="m" value={r.y} step={0.05} live={false} onChange={(y) => moveRoom(r.id, 0, y - r.y)} />
        </div>
        <small className="field-note">Walls, doors and furniture move with the room.</small>
      </Group>
      <label className="field ins-size">
        <MonoLabel>Part of room</MonoLabel>
        <select value={r.parent ?? ""} onChange={(e) => set({ parent: e.target.value || undefined })}>
          <option value="">None (own room)</option>
          {parents.map((o) => <option key={o.id} value={o.id}>Alcove of {o.name}</option>)}
        </select>
      </label>
      <button className="btn ins-size" onClick={addWalls}><WallIcon size={14} /> Create walls around this room</button>
      <button className="btn ins-size" onClick={() => walkHere(r.id)} title="Switch to the live view and walk through this room in first person"><PersonSimpleWalkIcon size={14} /> Walk here</button>
      {wallsMade !== null && <small className="field-note ins-size" role="status">{wallsMade ? `Added ${wallsMade} wall${wallsMade > 1 ? "s" : ""}.` : "Every edge already has a wall."}</small>}
      <button className="btn danger ins-del" onClick={() => remove("room", r.id)}><TrashIcon size={14} /> Delete</button>
    </HudPanel>
  );
}

type Hand = "left" | "right";
type Edit = (p: Partial<Opening>, watch: DimKey[]) => void;

/** The opening's measurements by name, as the fields show them. */
const dimsOf = (x: Opening, len: number): Record<DimKey, number> => ({ Width: x.width, Height: x.height, Sill: x.sill, "From start": openingStart(x, len), "From end": openingEnd(x, len) });

/** Editing an opening: apply an edit, then compare what the store kept with what was asked for and flag anything it had to clamp. */
function useOpeningEdit(o: Opening, len: number) {
  const patch = useStore((s) => s.patch);
  const [note, setNote] = useState<string | null>(null);
  const edit: Edit = (p, watch) => {
    const asked = dimsOf({ ...o, ...p }, len);
    patch("opening", o.id, p);
    const kept = dimsOf(useStore.getState().plan.openings.find((x) => x.id === o.id) ?? o, len);
    const off = watch.filter((k) => Math.abs(asked[k] - kept[k]) > CLAMP_EPS);
    setNote(off.length ? `Adjusted to fit: ${off.map((k) => `${k.toLowerCase()} ${asked[k].toFixed(2)} to ${kept[k].toFixed(2)} m`).join(", ")}.` : null);
  };
  const flagged = (k: string) => !!note && note.includes(`${k.toLowerCase()} `);
  const reset = () => {
    patch("opening", o.id, styleSize(styleOf(o)));
    setNote(null);
  };
  return { note, edit, flagged, reset };
}

/** Which jamb the leaf hangs on, which way it opens, what it opens into and what blocks it. */
function OpensGroup({ o, sideName, into, blockers }: { o: Opening; sideName: Record<Hand, string>; into: { name: string } | null | undefined; blockers: Item[] }) {
  const patch = useStore((s) => s.patch);
  const swing = o.swing ?? "left";
  const hand = hingeHand(o);
  return (
    <Group label="Opens">
      <Segmented label="Hinge side" value={hand} options={HANDS} onChange={(h) => patch("opening", o.id, { hinge: hingeForHand(h, swing) })} format={(h) => `Hinge ${h}`} />
      <Segmented label="Opens toward" value={swing} options={HANDS} onChange={(s) => patch("opening", o.id, { swing: s, hinge: hingeForHand(hand, s) })} format={(s) => sideName[s]} />
      <div className="presets">
        <button type="button" className="preset" onClick={() => patch("opening", o.id, { hinge: (o.hinge ?? "start") === "start" ? "end" : "start" })}>Flip hinge</button>
        <button type="button" className="preset" onClick={() => patch("opening", o.id, { swing: swing === "left" ? "right" : "left" })}>Flip side</button>
      </div>
      {into && <small className="field-note">Opens into: {into.name}</small>}
      {blockers.length > 0 && (
        <small className="field-note warn" role="status">
          Swing blocked by {[...new Set(blockers.map((b) => CATALOG[b.kind]?.label ?? b.kind))].slice(0, 3).join(", ")}{blockers.length > 3 ? ` and ${blockers.length - 3} more` : ""}.
        </small>
      )}
    </Group>
  );
}

/** Where the opening sits along its wall. */
function PositionOnWall({ o, len, flagged, edit }: { o: Opening; len: number; flagged: (k: string) => boolean; edit: Edit }) {
  return (
    <Group label="Position on wall">
      <div className="grid3">
        <NumField label="From start" unit="m" value={openingStart(o, len)} step={0.05} invalid={flagged("from start")} onChange={(s) => edit({ t: tFromStart(s, o.width, len) }, ["From start"])} />
        <NumField label="From end" unit="m" value={openingEnd(o, len)} step={0.05} invalid={flagged("from end")} onChange={(e) => edit({ t: tFromEnd(e, o.width, len) }, ["From end"])} />
      </div>
      <small className="field-note">Or drag it along the wall in the plan.</small>
    </Group>
  );
}

/** The two names for the sides of a wall, kept apart when both rooms share a name. */
function sideNames(sides: { left: Room | null; right: Room | null }): Record<Hand, string> {
  const name = { left: sides.left?.name ?? "Side A", right: sides.right?.name ?? "Side B" };
  if (name.left === name.right) {
    name.left += " A";
    name.right += " B";
  }
  return name;
}

/** A door or window: type, look and size, which way it opens, where it sits. */
function OpeningFields({ o, wall }: { o: Opening; wall: Wall }) {
  const plan = useStore((s) => s.plan);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const len = wallLen(wall);
  const { note, edit, flagged, reset } = useOpeningEdit(o, len);
  const levelPlan = planOfLevel(plan, levelIdOf(plan, wall));
  const facing = outwardFacing(levelPlan, wall.id, o.t);
  const sides = wallSides(levelPlan, wall.id, o.t);
  const blockers = doorSwingBlockers(levelPlan, o);
  const size: DimKey[] = ["Width", "Height", "Sill"];
  const handed = swings(o) || HANDED.includes(styleOf(o)); // which jamb the leaf hangs on or slides toward

  return (
    <HudPanel title={o.type === "door" ? "Door" : "Window"} meta={<><LevelTag plan={plan} entity={o} />{`wall ${len.toFixed(2)} m`}</>} onClose={closeInspector} className="inspector">
      <Group label="Type">
        <Segmented label="Opening type" value={o.type} options={OPENING_TYPES} onChange={(type) => patch("opening", o.id, { type, style: undefined })} />
      </Group>
      <Group label="Look">
        <OpeningGallery undoable type={o.type} value={{ width: o.width, height: o.height, sill: o.sill, style: o.style, color: o.color, tint: o.tint }} onChange={(p) => edit(p, size)}>
          <div className="grid3">
            <NumField label="Width" unit="m" value={o.width} min={0.2} invalid={flagged("width")} onChange={(width) => edit({ width }, size)} />
            <NumField label="Height" unit="m" value={o.height} min={0.2} invalid={flagged("height")} onChange={(height) => edit({ height }, size)} />
            <NumField label="Sill" unit="m" value={o.sill} min={0} invalid={flagged("sill")} onChange={(sill) => edit({ sill }, size)} />
            <NumField label="Top" unit="m" value={o.sill + o.height} readOnly onChange={() => undefined} />
          </div>
          <small className={`field-note ${note ? "warn" : ""}`} role="status">{note ?? `Sill is the height of the bottom edge above the floor. Walls are ${WALL_H} m high: sill + height stays under that.`}</small>
          <button type="button" className="btn" onClick={reset} title="Back to this style's standard size">Reset size</button>
        </OpeningGallery>
      </Group>
      {handed && <OpensGroup o={o} sideName={sideNames(sides)} into={sides[o.swing ?? "left"]} blockers={blockers} />}
      <PositionOnWall o={o} len={len} flagged={flagged} edit={edit} />
      {facing && (
        <div className="field">
          <MonoLabel>Faces</MonoLabel>
          <span style={{ font: "500 12px/1.2 var(--mono)", letterSpacing: "0.06em" }}>{facing.label} deg</span>
        </div>
      )}
      <button className="btn danger" onClick={() => remove("opening", o.id)}><TrashIcon size={14} /> Delete</button>
    </HudPanel>
  );
}

function OpeningPanel({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const o = plan.openings.find((x) => x.id === id);
  const wall = o && plan.walls.find((w) => w.id === o.wallId);
  if (!o || !wall) return null;
  return <OpeningFields o={o} wall={wall} />;
}

/** Walls, rooms, doors and windows: geometry and looks only. Entities and sensors live in the Home Assistant mode. */
export default function PlanInspector({ type, id }: { type: "wall" | "room" | "opening" | "void"; id: string }) {
  if (type === "wall") return <WallPanel id={id} />;
  if (type === "void") return <VoidPanel id={id} />;
  if (type === "room") return <RoomPanel id={id} />;
  return <OpeningPanel id={id} />;
}
