"use client";
import { FENCE_STYLES } from "@/lib/fences";
import { LIGHT_KINDS, LINE_FAMILIES, PATH_KINDS, type LineFamily } from "@/lib/lineKinds";
import { WALLS } from "@/lib/materials";
import LineKindIcon from "./plan/LineKindIcon";
import { openLines } from "./plan/linesUi";
import "./catalogLines.css";

type Entry = { id: string; label: string; open: () => void };

const ENTRIES: Record<LineFamily, Entry[]> = {
  road: PATH_KINDS.filter((k) => k.family === "road").map((k) => ({ id: k.id, label: k.label, open: () => openLines((ui) => ui.pickPath(k.id)) })),
  walkway: PATH_KINDS.filter((k) => k.family === "walkway").map((k) => ({ id: k.id, label: k.label, open: () => openLines((ui) => ui.pickPath(k.id)) })),
  fence: FENCE_STYLES.map((s) => ({ id: s, label: WALLS[s].label, open: () => openLines((ui) => ui.pickFence(s)) })),
  lights: LIGHT_KINDS.map((k) => ({ id: k.id, label: k.label, open: () => openLines((ui) => ui.pickLight(k.id)) })),
};

/**
 * Roads, walkways, fences and street lights are not placed one by one: they are drawn as a line in Plan mode. This folded section of the Furniture catalog lists
 * them with the same pictures as the Garden lines panel; a tap opens the plan with that kind ready.
 */
export default function CatalogLines() {
  return (
    <details className="cat-lines">
      <summary>Roads, paths and fences</summary>
      <p className="field-note">Drawn on the plan: pick one and click points along the line you want.</p>
      {LINE_FAMILIES.map((f) => (
        <div key={f.id} className="cl-family" role="group" aria-label={f.label}>
          <span className="cl-name">{f.label}</span>
          <div className="cl-grid">
            {ENTRIES[f.id].map((e) => (
              <button key={e.id} type="button" className="cl-tile" title={e.label} onClick={e.open}>
                <LineKindIcon id={e.id} family={f.id} />
                <span>{e.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </details>
  );
}
