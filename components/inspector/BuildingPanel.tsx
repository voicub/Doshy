"use client";
import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DEFAULT_LEVEL_HEIGHT, RAISED_FLOOR, sortedLevels } from "@/lib/levels";
import { MAX_LEVEL_HEIGHT, MIN_LEVEL_HEIGHT, buildingExtent, entryOf, overlappingLevels } from "@/lib/planOps";
import { MAX_OVERHANG, MAX_PITCH, MIN_PITCH, ROOF_TYPES, roofOf } from "@/lib/roof";
import { activeLevelId, useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import type { BuildingEntry, BuildingType, Level, Roof } from "@/lib/types";
import HudPanel from "../ui/HudPanel";
import MonoLabel from "../ui/MonoLabel";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { Group } from "./shared";
import "./BuildingPanel.css";
import "../ui/compactPanels.css";

const TYPES: readonly BuildingType[] = ["apartment", "house"];
const ENTRIES: readonly BuildingEntry[] = ["hallway", "stairs", "door"];
const ENTRY_LABEL: Record<BuildingEntry, string> = { hallway: "Building hallway", stairs: "Door with stairs", door: "Door only" };
const ENTRY_HINT: Record<BuildingEntry, string> = {
  hallway: "Your flat's door opens onto the shared corridor of the building.",
  stairs: "Steps or stairs lead up to your door from outside.",
  door: "Just a door, no corridor and no steps.",
};
const ELEVATION_PRESETS = [
  { v: 0, label: "Ground 0" },
  { v: RAISED_FLOOR, label: "Raised 1.0" },
  { v: DEFAULT_LEVEL_HEIGHT, label: "Storey 2.78" },
];
const fmt = (n: number) => n.toFixed(2);

const updateLevel = (id: string, patch: Partial<Level>) => useStore.getState().updateLevel(id, patch);

/** How the building is entered, and its roof. */
function EntranceAndRoof({ entry, roof }: { entry: BuildingEntry; roof: Roof | null }) {
  const { setEntry, setRoof } = useStore.getState();
  return (
    <>
      <Group label="Entrance">
        <Segmented label="Entrance" value={entry} options={ENTRIES} onChange={setEntry} format={(e) => ENTRY_LABEL[e]} className="entry-seg" />
        <p className="hint">{ENTRY_HINT[entry]}</p>
      </Group>

      {roof && (
        <Group label="Roof">
          <Segmented label="Roof type" value={roof.type} options={ROOF_TYPES} onChange={(t) => setRoof({ type: t })} />
          <div className="grid3">
            {roof.type !== "flat" && <NumField label="Pitch" unit="deg" value={roof.pitch} step={1} min={MIN_PITCH} max={MAX_PITCH} live={false} onChange={(pitch) => setRoof({ pitch })} />}
            <NumField label="Overhang" unit="m" value={roof.overhang} step={0.05} min={0} max={MAX_OVERHANG} live={false} onChange={(overhang) => setRoof({ overhang })} />
          </div>
          <p className="hint">The roof covers the top level and shows with cut-away off; it is hidden while editing.</p>
        </Group>
      )}
    </>
  );
}

/** An apartment is one flat lifted above the ground: its height and storey. */
function ApartmentLevel({ current, levelCount }: { current: Level; levelCount: number }) {
  return (
    <Group label={current.name}>
      <NumField label="Floor above ground" unit="m" value={current.elevation} step={0.05} onChange={(elevation) => updateLevel(current.id, { elevation })} />
      <div className="presets" role="group" aria-label="Floor height presets">
        {ELEVATION_PRESETS.map((p) => (
          <button key={p.v} type="button" className="preset" aria-pressed={Math.abs(current.elevation - p.v) < 1e-6} onClick={() => updateLevel(current.id, { elevation: p.v })}>
            {p.label}
          </button>
        ))}
      </div>
      <NumField label="Storey height" unit="m" value={current.height} step={0.05} min={MIN_LEVEL_HEIGHT} max={MAX_LEVEL_HEIGHT} live={false} onChange={(height) => updateLevel(current.id, { height })} />
      <p className="hint">
        {current.elevation <= 0.005
          ? "Your flat stands on the ground: no steps are needed at the entrance."
          : `Your flat is level 1 raised ${fmt(current.elevation)} m above the ground.`}
      </p>
      {levelCount > 1 && <small className="field-note warn">This plan has {levelCount} levels. Switch to House to edit them all.</small>}
    </Group>
  );
}

type RowProps = { level: Level; isActive: boolean; canDelete: boolean; compact: boolean; confirming: boolean; setConfirmId: (id: string | null) => void };

/** One level of a house: pick it, rename it, delete it (compact screens ask first), set its elevation and height. */
function LevelRow({ level: l, isActive, canDelete, compact, confirming, setConfirmId }: RowProps) {
  const { setActiveLevel, removeLevel } = useStore.getState();
  return (
    <div role="listitem" className={`level-row ${isActive ? "active" : ""}`}>
      <div className="level-head">
        <button type="button" className="preset" aria-pressed={isActive} onClick={() => setActiveLevel(l.id)} aria-label={`Edit ${l.name}`}>
          {isActive ? "Active" : "Edit"}
        </button>
        <input aria-label={`Name of ${l.name}`} value={l.name} onChange={(e) => updateLevel(l.id, { name: e.target.value })} />
        <button type="button" className="icon-btn" aria-label={`Delete ${l.name}`} disabled={!canDelete} onClick={() => (compact ? setConfirmId(l.id) : removeLevel(l.id))}>
          <TrashIcon size={14} />
        </button>
      </div>
      {compact && confirming && (
        <div className="level-confirm" role="alert">
          <p className="hint">Delete {l.name} and everything on it (walls, rooms, furniture)? You can bring it back with Undo.</p>
          <div className="presets">
            <button type="button" className="btn" autoFocus onClick={() => setConfirmId(null)}>Keep it</button>
            <button type="button" className="btn danger" onClick={() => { removeLevel(l.id); setConfirmId(null); }}>Delete level</button>
          </div>
        </div>
      )}
      <div className="grid3">
        <NumField label="Elevation" unit="m" value={l.elevation} step={0.05} onChange={(elevation) => updateLevel(l.id, { elevation })} />
        <NumField label="Height" unit="m" value={l.height} step={0.05} min={MIN_LEVEL_HEIGHT} max={MAX_LEVEL_HEIGHT} live={false} onChange={(height) => updateLevel(l.id, { height })} />
      </div>
    </div>
  );
}

/** A house stacks any number of levels, top first. */
function LevelStack({ levels, active, current, compact }: { levels: Level[]; active: string; current: Level; compact: boolean }) {
  const { addLevel } = useStore.getState();
  const [confirmId, setConfirmId] = useState<string | null>(null); // compact screens: the level waiting for "Delete level"
  const hasBasement = levels.some((l) => l.name === "Basement");
  const moreLevels = (
    <>
      <button type="button" className="btn" onClick={() => addLevel({ name: hasBasement ? undefined : "Basement", elevation: -DEFAULT_LEVEL_HEIGHT })}>Add basement</button>
      <button type="button" className="btn" onClick={() => addLevel({ copyFrom: current.id, name: `${current.name} copy` })}><CopyIcon size={14} /> Duplicate level</button>
    </>
  );
  return (
    <div className="stack" role="list" aria-label="Levels">
      {[...levels].reverse().map((l) => (
        <LevelRow key={l.id} level={l} isActive={l.id === active} canDelete={levels.length > 1} compact={compact} confirming={confirmId === l.id} setConfirmId={setConfirmId} />
      ))}
      <div className="presets">
        <button type="button" className="btn" onClick={() => addLevel()}>Add level above</button>
        {!compact && moreLevels}
      </div>
      {compact && (
        <details className="bp-more">
          <summary>More: basement, copy a level</summary>
          <div className="presets">{moreLevels}</div>
        </details>
      )}
    </div>
  );
}

/** Building type (apartment or house) and its levels. An apartment is one flat lifted above the ground; a house stacks any number of levels. */
export default function BuildingPanel({ onClose }: { onClose?: () => void }) {
  const plan = useStore((s) => s.plan);
  const active = useStore((s) => activeLevelId(s));
  const levels = useMemo(() => sortedLevels(plan), [plan]);
  const type = plan.building?.type ?? "apartment";
  const entry = entryOf(plan.building);
  const roof = roofOf(plan);
  const current = levels.find((l) => l.id === active) ?? levels[0];
  const extent = buildingExtent(levels);
  const overlaps = overlappingLevels(levels);
  const compact = useVp().vp !== "regular";
  const entranceAndRoof = <EntranceAndRoof entry={entry} roof={roof} />;

  return (
    <HudPanel title="Building" meta={`${levels.length} level${levels.length > 1 ? "s" : ""}`} onClose={onClose} className="drawer building-panel">
      <Group label="Type">
        <Segmented label="Building type" value={type} options={TYPES} onChange={useStore.getState().setBuildingType} />
      </Group>

      {!compact && entranceAndRoof}

      {type === "apartment" ? <ApartmentLevel current={current} levelCount={levels.length} /> : <LevelStack levels={levels} active={active} current={current} compact={compact} />}

      {overlaps.length > 0 && (
        <small className="field-note warn" role="status">
          Floors overlap: {overlaps.map(([a, b]) => `${a.name} and ${b.name}`).join(", ")}. Raise the upper floor or lower the storey height.
        </small>
      )}
      <div className="field">
        <MonoLabel>Total building height</MonoLabel>
        <span style={{ font: "500 12px/1.2 var(--mono)", letterSpacing: "0.06em" }}>
          {fmt(extent.height)} m{extent.bottom < 0 ? ` (${fmt(-extent.bottom)} m below ground)` : ""}
        </span>
      </div>
      <small className="field-note">Heights stay between {MIN_LEVEL_HEIGHT} and {MAX_LEVEL_HEIGHT} m. Deleting a level removes everything on it; Undo brings it back.</small>
      {compact && (
        <details className="bp-more">
          <summary>More: entrance and roof</summary>
          {entranceAndRoof}
        </details>
      )}
    </HudPanel>
  );
}
