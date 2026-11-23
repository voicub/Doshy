"use client";
import { CATALOG } from "@/lib/catalog";
import { PILLAR_PRESETS, isRoundPillar, type PillarPreset } from "@/lib/pillars";
import MonoLabel from "../ui/MonoLabel";
import { usePillarUi } from "./pillarUi";
import "./pillar.css";

const THUMB = 44;
const THUMB_SCALE = 60; // thumbnail pixels per metre

/** The pillar as the plan draws it: hatched square or circle, sized like the preset. */
function Thumb({ p }: { p: PillarPreset }) {
  const def = CATALOG[p.kind];
  const [w, d] = [(p.w ?? def.w) * THUMB_SCALE, (p.d ?? def.d) * THUMB_SCALE];
  const props = { fill: "url(#pillar-thumb-hatch)" };
  return (
    <svg width={THUMB} height={THUMB} viewBox={`0 0 ${THUMB} ${THUMB}`} aria-hidden>
      {isRoundPillar(p.kind) ? <ellipse cx={THUMB / 2} cy={THUMB / 2} rx={w / 2} ry={d / 2} {...props} /> : <rect x={(THUMB - w) / 2} y={(THUMB - d) / 2} width={w} height={d} {...props} />}
    </svg>
  );
}

/** Shape and size of the next pillar placed: shown above the dock while the Pillar tool is active. */
export default function PillarToolbar() {
  const chosen = usePillarUi((s) => s.preset);
  const choose = usePillarUi((s) => s.set);
  const label = PILLAR_PRESETS.find((p) => p.id === chosen)?.label ?? "";
  return (
    <aside className="pillar-toolbar hud brackets" aria-label="Pillar shape and size">
      <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
        <defs>
          <pattern id="pillar-thumb-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V5" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
      </svg>
      <div className="pillar-head">
        <MonoLabel>Pillar: {label}</MonoLabel>
        <small>Pick a shape, then click the plan. It snaps to wall ends and wall lines.</small>
      </div>
      <div className="pillar-gallery" role="group" aria-label="Pillar shape">
        {PILLAR_PRESETS.map((p) => (
          <button key={p.id} type="button" className="pillar-preset" aria-pressed={p.id === chosen} onClick={() => choose(p.id)}>
            <Thumb p={p} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
