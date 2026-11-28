"use client";
import { EDGES, EDGE_KINDS } from "@/lib/ground";
import { FENCE_STYLES } from "@/lib/fences";
import { LIGHT_KINDS, LINE_FAMILIES, PATH_KINDS, lightKindOf, pathKindOf, type LineFamily } from "@/lib/lineKinds";
import { WALLS } from "@/lib/materials";
import { useStore } from "@/lib/store";
import type { GroundEdge, PavementSides, RoadMarks } from "@/lib/types";
import LineKindIcon from "../plan/LineKindIcon";
import { useLinesUi } from "../plan/linesUi";
import HudPanel from "../ui/HudPanel";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { Group } from "./shared";
import "./GroundPanel.css";
import "./LinesPanel.css";

const FAMILY_IDS = LINE_FAMILIES.map((f) => f.id);
const familyLabel = (id: LineFamily) => LINE_FAMILIES.find((f) => f.id === id)?.label ?? id;

/** Plain names of the road options, shared with the inspector of a selected path. */
export const MARKS_LABEL: Record<RoadMarks, string> = { none: "None", dashed: "Dashed centre line", solid: "Solid centre line", edges: "Edge lines", double: "Double yellow" };
export const MARK_KINDS = Object.keys(MARKS_LABEL) as RoadMarks[];
export const PAVEMENT_LABEL: Record<PavementSides, string> = { none: "None", left: "Left", right: "Right", both: "Both" };
export const PAVEMENT_KINDS = Object.keys(PAVEMENT_LABEL) as PavementSides[];

/** One picture button per kind: the picture first, its plain name under it. */
function Tile({ family, id, label, on, onPick }: { family: LineFamily; id: string; label: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" className="mat lines-tile" aria-pressed={on} title={label} onClick={onPick}>
      <LineKindIcon id={id} family={family} />
      <span>{label}</span>
    </button>
  );
}

/** The few options of the picked road or walkway: width, smooth curve, and (roads) markings, pavements and edge. */
function PathOptions() {
  const ui = useLinesUi();
  const kind = pathKindOf(ui.pathKind);
  if (!kind) return null;
  const { look } = kind;
  return (
    <>
      <div className="field">
        <NumField label="Width" unit="m" value={ui.width} step={0.1} min={look.min} max={look.max} live={false} onChange={ui.setWidth} />
      </div>
      <label className="lines-check">
        <input type="checkbox" checked={ui.smooth} onChange={(e) => ui.setSmooth(e.target.checked)} /> Smooth curve
      </label>
      {kind.family === "road" && (
        <details className="ground-adv">
          <summary>More options</summary>
          <Group label="Markings">
            <Segmented<RoadMarks> label="Markings" value={ui.options.marks ?? look.marks ?? "none"} options={MARK_KINDS} format={(m) => MARKS_LABEL[m]} onChange={(marks) => ui.setOption({ marks })} />
          </Group>
          <Group label="Pavements">
            <Segmented<PavementSides> label="Pavements" value={ui.options.pavement ?? look.pavement ?? "none"} options={PAVEMENT_KINDS} format={(s) => PAVEMENT_LABEL[s]} onChange={(pavement) => ui.setOption({ pavement })} />
          </Group>
          <Group label="Edge">
            <Segmented<GroundEdge> label="Edge" value={ui.options.edge ?? look.edge ?? "none"} options={EDGE_KINDS} format={(e) => EDGES[e].label} onChange={(edge) => ui.setOption({ edge })} />
          </Group>
        </details>
      )}
    </>
  );
}

/** Spacing and lamp side of the picked light kind. A string of lights has one fixed span, so it has no spacing to set. */
function LightOptions() {
  const ui = useLinesUi();
  const kind = lightKindOf(ui.light);
  if (!kind) return null;
  return (
    <>
      {kind.min < kind.max && (
        <div className="field">
          <NumField label="Spacing" unit="m" value={ui.spacing} step={0.5} min={kind.min} max={kind.max} live={false} onChange={ui.setSpacing} />
        </div>
      )}
      {kind.faces && (
        <Group label="Lamps face">
          <Segmented<"left" | "right"> label="Lamps face" value={ui.face === 1 ? "right" : "left"} options={["left", "right"]} format={(s) => (s === "left" ? "Left" : "Right")} onChange={(s) => ui.setFace(s === "right" ? 1 : -1)} />
        </Group>
      )}
    </>
  );
}

/** The Garden lines tool: pick a kind of road, walkway, fence or street light, then click points on the plan. */
export default function LinesPanel() {
  const ui = useLinesUi();
  return (
    <HudPanel title="Garden lines" onClose={() => useStore.getState().setTool("select")} className="inspector lines-panel">
      <p className="hint">Pick a kind, then click or tap points on the plan. Double-click, press Enter or tap Done to finish.</p>
      <Segmented<LineFamily> label="What to draw" value={ui.family} options={FAMILY_IDS} format={familyLabel} onChange={ui.setFamily} className="lines-tabs" />
      <div className="mat-grid" role="group" aria-label={familyLabel(ui.family)}>
        {(ui.family === "road" || ui.family === "walkway") &&
          PATH_KINDS.filter((k) => k.family === ui.family).map((k) => <Tile key={k.id} family={ui.family} id={k.id} label={k.label} on={ui.pathKind === k.id} onPick={() => ui.pickPath(k.id)} />)}
        {ui.family === "fence" && FENCE_STYLES.map((s) => <Tile key={s} family="fence" id={s} label={WALLS[s].label} on={ui.fence === s} onPick={() => ui.pickFence(s)} />)}
        {ui.family === "lights" && LIGHT_KINDS.map((k) => <Tile key={k.id} family="lights" id={k.id} label={k.label} on={ui.light === k.id} onPick={() => ui.pickLight(k.id)} />)}
      </div>
      {(ui.family === "road" || ui.family === "walkway") && <PathOptions />}
      {ui.family === "lights" && <LightOptions />}
      {ui.family === "fence" && <p className="hint">Each segment is a garden wall. Select one to add a gate to it.</p>}
    </HudPanel>
  );
}
