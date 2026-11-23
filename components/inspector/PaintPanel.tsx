"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FLOORS, FLOOR_GROUPS, PALETTE, WALLS, WALL_STYLES, floorsInGroup, paintLevelWalls, parseHex, type Swatch } from "@/lib/materials";
import { usePaint } from "@/lib/paintStore";
import { activeLevelId, useStore } from "@/lib/store";
import { swatchUrl } from "@/lib/textures";
import type { FloorKind, WallStyle } from "@/lib/types";
import { useVp } from "@/lib/useVp";
import HudPanel from "../ui/HudPanel";
import MonoLabel from "../ui/MonoLabel";
import "./PaintPanel.css";

type SwatchProps = ({ id: FloorKind; floor: true } | { id: WallStyle; floor: false }) & { tint: string | null };

/** A small picture of a material: its drawn texture multiplied with a tint (null = the material's natural colour). */
export function MatSwatch(p: SwatchProps) {
  const wall = p.floor ? null : WALLS[p.id];
  const plain = !!wall?.plain;
  const glass = !!wall?.glass;
  const { id } = p;
  const url = useMemo(() => (plain || typeof document === "undefined" ? "" : swatchUrl(id)), [id, plain]);
  const color = p.tint ?? (p.floor ? FLOORS[p.id] : WALLS[p.id]).color;
  return <i className={`mat-pic ${glass ? "glass" : ""}`} style={glass ? { background: `linear-gradient(135deg, ${color}cc, ${color}33)` } : { backgroundColor: color, backgroundImage: url ? `url(${url})` : undefined }} aria-hidden />;
}

type GridProps =
  | { kind: "floor"; value: FloorKind | null; onPick: (k: FloorKind) => void; tint?: string | null }
  | { kind: "wall"; value: WallStyle | null; onPick: (s: WallStyle) => void; tint?: string | null };

type MatEntry = { id: FloorKind | WallStyle; label: string; swatch: ReactNode; pick: () => void };

/** Materials as a grid of small pictures with a plain-words name under each: floors by group, walls in one list. */
export function MaterialGrid(p: GridProps) {
  const tint = p.tint ?? null;
  const groups: { label: string | null; entries: MatEntry[] }[] =
    p.kind === "floor"
      ? FLOOR_GROUPS.map((g) => ({ label: g, entries: floorsInGroup(g).map((id) => ({ id, label: FLOORS[id].label, swatch: <MatSwatch id={id} floor tint={tint} />, pick: () => p.onPick(id) })) }))
      : [{ label: null, entries: WALL_STYLES.map((id) => ({ id, label: WALLS[id].label, swatch: <MatSwatch id={id} floor={false} tint={tint} />, pick: () => p.onPick(id) })) }];
  return (
    <div className="mat-groups">
      {groups.map((g) => (
        <div key={g.label ?? "all"} className="mat-group">
          {g.label && <MonoLabel>{g.label}</MonoLabel>}
          <div className="mat-grid" role="group" aria-label={g.label ?? (p.kind === "floor" ? "Floors" : "Walls")}>
            {g.entries.map((m) => (
              <button key={m.id} type="button" className="mat" aria-pressed={p.value === m.id} title={m.label} onClick={m.pick}>
                {m.swatch}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const COMMIT_MS = 600; // a drag in the native colour picker is one undo step: it closes this long after the last change

type ColourProps = {
  /** The chosen colour; null = the natural colour. */
  value: string | null;
  onChange: (hex: string | null) => void;
  /** Label of the reset chip ("Natural", "Original"); omit for no reset chip. */
  reset?: string;
  /** The natural colour, shown behind the custom picker when nothing is chosen. */
  natural?: string;
  /** A row of ready-made colours before the palette (an item's finishes). */
  lead?: Swatch[];
  /** The colour edits the plan: dragging in the picker joins one undo step. */
  undoable?: boolean;
};

/** Named palette, the colours used lately, and a free colour picker. */
export function ColourField({ value, onChange, reset, natural, lead, undoable }: ColourProps) {
  const recent = usePaint((s) => s.recent);
  const remember = usePaint((s) => s.remember);
  const timer = useRef<number | undefined>(undefined);
  const open = useRef(false);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    if (open.current) {
      open.current = false;
      useStore.getState().endEdit();
    }
  }, []);
  useEffect(() => close, [close]);

  const pick = (hex: string | null) => {
    onChange(hex);
    remember(hex);
  };
  const drag = (hex: string) => {
    const s = useStore.getState();
    if (undoable && !open.current && !s.gesture) {
      s.beginEdit();
      open.current = true;
    }
    onChange(hex);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      close();
      remember(hex);
    }, COMMIT_MS);
  };

  const cur = value?.toLowerCase() ?? null;
  const name = [...(lead ?? []), ...PALETTE].find((s) => s.c === cur)?.name;
  const dot = (s: Swatch) => (
    <button key={s.c + s.name} type="button" className={cur === s.c ? "swatch active" : "swatch"} title={s.name} aria-label={s.name} aria-pressed={cur === s.c} style={{ background: s.c }} onClick={() => pick(s.c)} />
  );
  return (
    <div className="col-field">
      {reset && (
        <div className="presets">
          <button type="button" className="preset" aria-pressed={cur === null} onClick={() => pick(null)}>{reset}</button>
        </div>
      )}
      {lead && <div className="swatches">{lead.map(dot)}</div>}
      <details className="col-more" open={!lead}>
        <summary>{lead ? "More colours" : "Colours"}</summary>
        <div className="swatches">{PALETTE.map(dot)}</div>
      </details>
      {recent.length > 0 && (
        <div className="col-recent">
          <MonoLabel>Recent</MonoLabel>
          <div className="swatches">{recent.map((c) => dot({ name: c, c }))}</div>
        </div>
      )}
      <label className="col-custom">
        <input className="swatch-custom" type="color" value={parseHex(value) ?? parseHex(natural) ?? "#ffffff"} onChange={(e) => drag(e.target.value)} onBlur={close} aria-label="Pick any colour" />
        <span className="field-note">{cur ? `${name ?? "Custom"}  ${cur}` : `${reset ?? "Natural"} colour`}</span>
      </label>
    </div>
  );
}

type Mode = "colour" | "floor" | "wall";
const MODES: { id: Mode; label: string }[] = [{ id: "colour", label: "Colour only" }, { id: "floor", label: "Floors" }, { id: "wall", label: "Walls" }];

/**
 * The paint bucket's panel (Plan and Furniture modes): choose a material and a colour once, then click walls, rooms or furniture.
 * Alt-click picks the material and colour up from what you click.
 */
export default function PaintPanel() {
  const brush = usePaint((s) => s.brush);
  const setBrush = usePaint((s) => s.setBrush);
  const remember = usePaint((s) => s.remember);
  const view = useStore((s) => s.view);
  const tap = useVp().coarse;
  const setTool = useStore((s) => s.setTool);
  const editPlan = useStore((s) => s.editPlan);
  const [last, setLast] = useState<{ floor: FloorKind; wall: WallStyle }>({ floor: "oak", wall: "plaster" });
  const mode: Mode = brush.material?.kind ?? "colour";
  const mat = brush.material;

  const choose = (m: Mode) => {
    if (m === "colour") setBrush({ material: null });
    else if (m === "floor") setBrush({ material: { kind: "floor", id: last.floor } });
    else setBrush({ material: { kind: "wall", id: last.wall } });
  };
  const wallsBrush = mode !== "floor"; // the whole-level buttons paint walls: a floor material has nothing to lay on them
  const level = () => activeLevelId(useStore.getState());
  const all = (which: "outside" | "inside") => {
    editPlan((p) => paintLevelWalls(p, level(), which, brush));
    remember(brush.color);
  };

  return (
    <HudPanel title="Paint" meta="B" onClose={() => setTool("select")} className="inspector paint">
      <p className="hint">{view === "furniture" ? `${tap ? "Tap" : "Click"} furniture, a wall or a floor to paint it.` : `${tap ? "Tap" : "Click"} a wall to paint that side, or a room to paint its floor.`}{tap ? "" : " Alt-click picks up what is there."}</p>
      <div className="field" role="group" aria-label="What to paint">
        <MonoLabel>Material</MonoLabel>
        <div className="seg" role="group" aria-label="Material type">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => choose(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>
      {mat?.kind === "floor" && <MaterialGrid kind="floor" value={mat.id} tint={brush.color} onPick={(id) => { setLast((l) => ({ ...l, floor: id })); setBrush({ material: { kind: "floor", id } }); }} />}
      {mat?.kind === "wall" && <MaterialGrid kind="wall" value={mat.id} tint={brush.color} onPick={(id) => { setLast((l) => ({ ...l, wall: id })); setBrush({ material: { kind: "wall", id } }); }} />}
      {!mat && (
        <div className="field" role="group" aria-label="Clicking a room paints">
          <small className="field-note">Keeps what a surface is made of and changes only its colour.</small>
          <MonoLabel>Clicking a room paints its</MonoLabel>
          <div className="seg" role="group" aria-label="Clicking a room paints">
            <button type="button" aria-pressed={!brush.roomWalls} onClick={() => setBrush({ roomWalls: false })}>Floor</button>
            <button type="button" aria-pressed={!!brush.roomWalls} onClick={() => setBrush({ roomWalls: true })}>Walls</button>
          </div>
        </div>
      )}
      <div className="field" role="group" aria-label="Colour">
        <MonoLabel>Colour</MonoLabel>
        <ColourField value={brush.color} onChange={(color) => setBrush({ color })} reset="Natural" natural={mat ? (mat.kind === "floor" ? FLOORS[mat.id].color : WALLS[mat.id].color) : undefined} />
      </div>
      {wallsBrush && (
        <div className="field" role="group" aria-label="Whole house">
          <MonoLabel>Whole level</MonoLabel>
          <button type="button" className="btn" onClick={() => all("outside")}>Paint all outside walls</button>
          <button type="button" className="btn" onClick={() => all("inside")}>Paint all inside walls</button>
        </div>
      )}
      {mat?.kind === "wall" && <small className="field-note">{tap ? "Tap a room to paint all the walls around it." : "Shift-click paints both sides of a wall. Click a room to paint all the walls around it."}</small>}
    </HudPanel>
  );
}
