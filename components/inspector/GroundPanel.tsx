"use client";
import { ArrowClockwiseIcon, ArrowsLeftRightIcon, CopyIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import {
  EDGES, EDGE_KINDS, GARDEN_KINDS, GROUND_PRESETS, MAX_PATH_WIDTH, MIN_AREA_SIDE, MIN_PATH_WIDTH, groundKind, groundLabel, hasOutdoor, insertPathPoint, marksOf, paintGround, pavementOf, pavementWidthOf, reversedPath,
  type GroundMode,
} from "@/lib/ground";
import { duplicatePath } from "@/lib/lineDraw";
import { PATH_KINDS } from "@/lib/lineKinds";
import { FLOORS } from "@/lib/materials";
import { setGroundMaterial } from "@/lib/planMaterials";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/uid";
import { useShallow } from "zustand/react/shallow";
import type { FloorKind, GroundArea, GroundEdge, GroundPath, PavementSides, RoadMarks } from "@/lib/types";
import HudPanel from "../ui/HudPanel";
import MonoLabel from "../ui/MonoLabel";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { useGroundUi } from "../plan/groundUi";
import { ColourField, MatSwatch } from "./PaintPanel";
import MaterialLook from "./MaterialLook";
import { MARKS_LABEL, MARK_KINDS, PAVEMENT_KINDS, PAVEMENT_LABEL } from "./LinesPanel";
import { Group } from "./shared";
import { closeInspector } from "./closeInspector";
import "./GroundPanel.css";

/** The garden surfaces as pictures with plain names under them. */
function SurfaceGallery({ value, tint, onPick }: { value: FloorKind | null; tint: string | null; onPick: (k: FloorKind) => void }) {
  return (
    <div className="mat-grid" role="group" aria-label="Surface">
      {GARDEN_KINDS.map((k) => (
        <button key={k} type="button" className="mat" aria-pressed={value === k} title={FLOORS[k].label} onClick={() => onPick(k)}>
          <MatSwatch id={k} floor tint={tint} />
          <span>{FLOORS[k].label}</span>
        </button>
      ))}
    </div>
  );
}

const MODES: readonly GroundMode[] = ["area", "pond"];
const MODE_LABEL: Record<GroundMode, string> = { area: "Area", pond: "Pond" };
const EDGE_LABEL = (e: GroundEdge) => EDGES[e].label;
const ENDS: readonly NonNullable<GroundPath["ends"]>[] = ["round", "flat"];
const ENDS_LABEL: Record<NonNullable<GroundPath["ends"]>, string> = { round: "Rounded", flat: "Flat" };

/** The Garden tool: choose what to lay (a ready-made preset, or a surface and a shape), then draw it on the plan. Roads, paths and fences are drawn with Garden lines. */
export function GardenPanel() {
  const ui = useGroundUi();
  const bare = useStore((s) => !hasOutdoor(s.plan));
  const how = ui.size ? `Click the plan to drop ${ui.size.w} x ${ui.size.h} m, or drag for any size.` : "Drag a rectangle on the plan.";
  return (
    <HudPanel title="Garden" onClose={() => useStore.getState().setTool("select")} className="inspector ground-panel">
      {bare && <p className="hint" role="status">Nothing outside yet. Add a patio or a lawn. Roads, paths and fences are in Garden lines.</p>}
      <p className="hint">{how}</p>
      <Group label="Ready-made">
        <div className="ground-presets">
          {GROUND_PRESETS.map((p) => (
            <button key={p.id} type="button" className="btn" aria-pressed={ui.kind === p.kind && ui.mode === p.mode && ui.size?.w === p.size.w && ui.size?.h === p.size.h} onClick={() => ui.preset(p)}>{p.label}</button>
          ))}
        </div>
      </Group>
      <Group label="Surface">
        <SurfaceGallery value={ui.kind} tint={null} onPick={ui.setKind} />
      </Group>
      <Group label="Shape">
        <Segmented<GroundMode> label="Shape" value={ui.mode} options={MODES} format={(m) => MODE_LABEL[m]} onChange={ui.setMode} />
      </Group>
      <Group label="Edge">
        <Segmented<GroundEdge> label="Edge" value={ui.edge} options={EDGE_KINDS} format={EDGE_LABEL} onChange={ui.setEdge} />
      </Group>
    </HudPanel>
  );
}

/** How wide a path may be: up to the widest road of its surface, else the general limit. A walkway or lane is never forced above its own width. */
function widthRange(p: GroundPath): { min: number; max: number } {
  const roads = PATH_KINDS.filter((k) => k.family === "road" && k.look.kind === p.kind);
  return { min: MIN_PATH_WIDTH, max: roads.length ? Math.max(...roads.map((k) => k.look.max)) : MAX_PATH_WIDTH };
}

/** Markings and pavements of a selected path, first in its panel: they are what makes a path a road. Absent fields stay absent. */
function RoadOptions({ path }: { path: GroundPath }) {
  const patch = useStore((s) => s.patch);
  const set = (p: Partial<GroundPath>) => patch("path", path.id, p);
  const pavement = pavementOf(path);
  return (
    <>
      <Group label="Markings">
        <Segmented<RoadMarks> label="Markings" value={marksOf(path)} options={MARK_KINDS} format={(m) => MARKS_LABEL[m]} onChange={(m) => set({ marks: m === "none" ? undefined : m })} />
      </Group>
      <Group label="Pavements">
        <Segmented<PavementSides> label="Pavements" value={pavement} options={PAVEMENT_KINDS} format={(s) => PAVEMENT_LABEL[s]} onChange={(s) => set({ pavement: s === "none" ? undefined : s })} />
        {pavement !== "none" && <NumField label="Pavement width" unit="m" value={pavementWidthOf(path)} step={0.1} min={0.5} max={4} live={false} onChange={(pavementWidth) => set({ pavementWidth })} />}
      </Group>
    </>
  );
}

/** The less used path options folded away, and the buttons that act on the whole path. */
function PathActions({ path }: { path: GroundPath }) {
  const { patch, remove, editPlan, select } = useStore(useShallow((s) => ({ patch: s.patch, remove: s.remove, editPlan: s.editPlan, select: s.select })));
  const set = (p: Partial<GroundPath>) => patch("path", path.id, p);
  const duplicate = () => {
    let copy: string | null = null;
    editPlan((p) => {
      const r = duplicatePath(p, path.id, uid);
      copy = r.id;
      return r.plan;
    });
    if (copy) select({ type: "path", id: copy });
  };
  return (
    <>
      <details className="ground-adv">
        <summary>More options</summary>
        <Group label="Ends">
          <Segmented<NonNullable<GroundPath["ends"]>> label="Ends" value={path.ends ?? "round"} options={ENDS} format={(e) => ENDS_LABEL[e]} onChange={(e) => set({ ends: e === "round" ? undefined : e })} />
        </Group>
        <label className="lines-check">
          <input type="checkbox" checked={!!path.smooth} onChange={(e) => set({ smooth: e.target.checked ? true : undefined })} /> Smooth curve
        </label>
        <label className="lines-check">
          <input type="checkbox" checked={!!path.stones} onChange={(e) => set({ stones: e.target.checked ? true : undefined })} /> Stepping stones
        </label>
      </details>
      <div className="ground-presets">
        <button className="btn" onClick={() => editPlan((p) => ({ ...p, paths: p.paths?.map((x) => (x.id === path.id ? reversedPath(x) : x)) }))}><ArrowsLeftRightIcon size={14} /> Reverse direction</button>
        <button className="btn" onClick={() => set({ points: insertPathPoint(path) })}><PlusCircleIcon size={14} /> Add point</button>
        <button className="btn" onClick={duplicate}><CopyIcon size={14} /> Duplicate</button>
        <button className="btn danger" onClick={() => remove("path", path.id)}><TrashIcon size={14} /> Delete</button>
      </div>
    </>
  );
}

/** A selected garden area or path: its surface and colour as pictures, size, turn, edge, delete. A path also has its road options. */
export default function GroundPanel({ type, id }: { type: "ground" | "path"; id: string }) {
  const plan = useStore((s) => s.plan);
  const { patch, remove, editPlan } = useStore(useShallow((s) => ({ patch: s.patch, remove: s.remove, editPlan: s.editPlan })));
  const area = type === "ground" ? plan.ground?.find((x) => x.id === id) : undefined;
  const path = type === "path" ? plan.paths?.find((x) => x.id === id) : undefined;
  const g: GroundArea | GroundPath | undefined = area ?? path;
  if (!g) return null;
  const kind = groundKind(g);
  const set = (p: Partial<GroundArea> & Partial<GroundPath>) => patch(type, g.id, p);
  const paint = (material: { kind: "floor"; id: FloorKind } | null, color: string | null) => editPlan((p) => paintGround(p, { type, id: g.id }, { material, color }));
  const range = path ? widthRange(path) : null;
  return (
    <HudPanel title={type === "path" ? "Road or path" : kind === "water" ? "Pond" : "Garden area"} meta={groundLabel(g)} onClose={closeInspector} className="inspector ground-panel">
      {path && range && (
        <div className="field">
          <NumField label="Width" unit="m" value={path.width} step={0.1} min={range.min} max={range.max} live={false} onChange={(width) => set({ width })} />
        </div>
      )}
      {path && <RoadOptions path={path} />}
      <Group label="Surface">
        <SurfaceGallery value={kind} tint={g.color ?? null} onPick={(k) => paint({ kind: "floor", id: k }, g.color ?? null)} />
      </Group>
      <Group label="Colour">
        <ColourField undoable value={g.color ?? null} reset="Natural" natural={FLOORS[kind].color} onChange={(c) => paint(null, c)} />
      </Group>
      <Group label="Poly Haven texture">
        <MaterialLook use="ground" current={g.material} apply={(p, ref) => setGroundMaterial(p, { type, id: g.id }, ref)} />
      </Group>
      {area && (
        <div className="field">
          <NumField label="Width" unit="m" value={area.w} step={0.05} min={MIN_AREA_SIDE} live={false} onChange={(w) => set({ w })} />
          <NumField label="Depth" unit="m" value={area.h} step={0.05} min={MIN_AREA_SIDE} live={false} onChange={(h) => set({ h })} />
        </div>
      )}
      {area && (
        <button className="btn" onClick={() => set({ rot: ((area.rot ?? 0) + 90) % 360 })}><ArrowClockwiseIcon size={14} /> Turn 90 degrees</button>
      )}
      <Group label="Edge">
        <Segmented<GroundEdge> label="Edge" value={g.edge ?? "none"} options={EDGE_KINDS} format={EDGE_LABEL} onChange={(edge) => set({ edge })} />
      </Group>
      {area && (
        <details className="ground-adv">
          <summary>Advanced</summary>
          <NumField label="Turn" unit="deg" value={area.rot ?? 0} step={5} min={0} max={359} live={false} onChange={(rot) => set({ rot })} />
          <NumField label="Left edge" unit="m" value={area.x} step={0.05} live={false} onChange={(x) => set({ x })} />
          <NumField label="Top edge" unit="m" value={area.y} step={0.05} live={false} onChange={(y) => set({ y })} />
        </details>
      )}
      {path && <PathActions path={path} />}
      <MonoLabel>{type === "path" ? "Drag a square to bend it. Delete removes it." : "Drag the squares to resize, the knob to turn. R turns 90 degrees."}</MonoLabel>
      {!path && <button className="btn danger" onClick={() => remove(type, g.id)}><TrashIcon size={14} /> Delete</button>}
    </HudPanel>
  );
}
