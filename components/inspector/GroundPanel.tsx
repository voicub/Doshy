"use client";
import { ArrowClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { EDGES, EDGE_KINDS, GARDEN_KINDS, GROUND_PRESETS, MAX_PATH_WIDTH, MIN_AREA_SIDE, MIN_PATH_WIDTH, groundKind, groundLabel, hasOutdoor, paintGround, type GroundMode } from "@/lib/ground";
import { FENCE_STYLES } from "@/lib/fences";
import { FLOORS, WALLS } from "@/lib/materials";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import type { FloorKind, GroundArea, GroundEdge, GroundPath } from "@/lib/types";
import { useWallUi } from "../plan/wallUi";
import HudPanel from "../ui/HudPanel";
import MonoLabel from "../ui/MonoLabel";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { useGroundUi } from "../plan/groundUi";
import { ColourField, MatSwatch } from "./PaintPanel";
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

const MODES: readonly GroundMode[] = ["area", "path", "pond"];
const MODE_LABEL: Record<GroundMode, string> = { area: "Area", path: "Path", pond: "Pond" };
const EDGE_LABEL = (e: GroundEdge) => EDGES[e].label;

/** The Garden tool: choose what to lay (a ready-made preset, or a surface and a shape), then draw it on the plan. */
export function GardenPanel() {
  const ui = useGroundUi();
  const bare = useStore((s) => !hasOutdoor(s.plan));
  const how = ui.mode === "path" ? "Click along the plan to lay the path, double-click to finish." : ui.size ? `Click the plan to drop ${ui.size.w} x ${ui.size.h} m, or drag for any size.` : "Drag a rectangle on the plan.";
  return (
    <HudPanel title="Garden" onClose={() => useStore.getState().setTool("select")} className="inspector ground-panel">
      {bare && <p className="hint" role="status">Nothing outside yet. Add a patio, path or lawn.</p>}
      <p className="hint">{how}</p>
      <Group label="Ready-made">
        <div className="ground-presets">
          {GROUND_PRESETS.map((p) => (
            <button key={p.id} type="button" className="btn" aria-pressed={ui.kind === p.kind && ui.mode === p.mode && ui.size?.w === p.size?.w && ui.size?.h === p.size?.h} onClick={() => ui.preset(p)}>{p.label}</button>
          ))}
        </div>
      </Group>
      <Group label="Surface">
        <SurfaceGallery value={ui.kind} tint={null} onPick={ui.setKind} />
      </Group>
      <Group label="Shape">
        <Segmented<GroundMode> label="Shape" value={ui.mode} options={MODES} format={(m) => MODE_LABEL[m]} onChange={ui.setMode} />
      </Group>
      {ui.mode === "path" && (
        <div className="field">
          <NumField label="Path width" unit="m" value={ui.width} step={0.1} min={MIN_PATH_WIDTH} max={MAX_PATH_WIDTH} onChange={ui.setWidth} />
        </div>
      )}
      <Group label="Edge">
        <Segmented<GroundEdge> label="Edge" value={ui.edge} options={EDGE_KINDS} format={EDGE_LABEL} onChange={ui.setEdge} />
      </Group>
      <Group label="Fences and garden walls">
        <div className="ground-presets">
          {FENCE_STYLES.map((s) => (
            <button key={s} type="button" className="btn" onClick={() => { useWallUi.getState().setStyle(s); useStore.getState().setTool("wall"); }}>{WALLS[s].label}</button>
          ))}
        </div>
      </Group>
    </HudPanel>
  );
}

/** A selected garden area or path: its surface and colour as pictures, size, turn, edge, delete. */
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
  return (
    <HudPanel title={type === "path" ? "Path" : kind === "water" ? "Pond" : "Garden area"} meta={groundLabel(g)} onClose={closeInspector} className="inspector ground-panel">
      <Group label="Surface">
        <SurfaceGallery value={kind} tint={g.color ?? null} onPick={(k) => paint({ kind: "floor", id: k }, g.color ?? null)} />
      </Group>
      <Group label="Colour">
        <ColourField undoable value={g.color ?? null} reset="Natural" natural={FLOORS[kind].color} onChange={(c) => paint(null, c)} />
      </Group>
      <div className="field">
        {area ? (
          <>
            <NumField label="Width" unit="m" value={area.w} step={0.05} min={MIN_AREA_SIDE} live={false} onChange={(w) => set({ w })} />
            <NumField label="Depth" unit="m" value={area.h} step={0.05} min={MIN_AREA_SIDE} live={false} onChange={(h) => set({ h })} />
          </>
        ) : (
          path && <NumField label="Width" unit="m" value={path.width} step={0.1} min={MIN_PATH_WIDTH} max={MAX_PATH_WIDTH} live={false} onChange={(width) => set({ width })} />
        )}
      </div>
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
      <MonoLabel>{type === "path" ? "Drag a square to bend it. Delete removes it." : "Drag the squares to resize, the knob to turn. R turns 90 degrees."}</MonoLabel>
      <button className="btn danger" onClick={() => remove(type, g.id)}><TrashIcon size={14} /> Delete</button>
    </HudPanel>
  );
}
