"use client";
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, HandGrabbingIcon, type Icon } from "@phosphor-icons/react";
import { useState } from "react";
import type { Site } from "@/lib/siteTypes";
import { NUDGE_BIG_M, NUDGE_M, compassWords, normBearing, nudgeSite, type Nudge } from "@/lib/siteUi";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import MonoLabel from "./MonoLabel";
import NumField from "./NumField";
import { Block, Switch } from "./SiteBits";
import { useSiteAlign } from "./siteAlign";

/** The four nudge arrows (also used by the on-canvas bar of compact screens). */
export const ARROWS: { way: Nudge; Icon: Icon; area: string }[] = [
  { way: "up", Icon: ArrowUpIcon, area: "u" },
  { way: "left", Icon: ArrowLeftIcon, area: "l" },
  { way: "right", Icon: ArrowRightIcon, area: "r" },
  { way: "down", Icon: ArrowDownIcon, area: "d" },
];
const FACES = [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const;
const FACE_NAME = { N: "north", E: "east", S: "south", W: "west" } as const;
export const TURN_DEG = 5;

/** "Line it up with the real building": drag or nudge the map under the plan, and turn the plan to face the right way. */
export default function SiteAlignControls({ site, bearing }: { site: Site; bearing: number }) {
  const setSite = useStore((s) => s.setSite);
  const setBearing = useStore((s) => s.setBearing);
  const align = useSiteAlign((s) => s.align);
  const setAlign = useSiteAlign((s) => s.setAlign);
  const opacity = useSiteAlign((s) => s.opacity);
  const setOpacity = useSiteAlign((s) => s.setOpacity);
  const view = useStore((s) => s.view);
  const compact = useVp().vp !== "regular";
  const [big, setBig] = useState(false); // compact screens have no Shift key: a switch makes the arrows move 5 m
  const moved = site.dx !== 0 || site.dy !== 0;
  const turn = (by: number) => setBearing(normBearing(bearing + by));

  return (
    <Block title="Line it up with the real building" name="align">
      <p className="hint">{compact ? "Move the map under your plan until your flat sits on the real building. The neighbours then stand in the right places in Live mode too." : "Drag the map until your flat sits on the real building. The neighbours then stand in the right places in Live mode too."}</p>
      <button type="button" className={`btn sp-wide ${compact ? "primary" : align ? "on" : ""}`} aria-pressed={align} disabled={view !== "plan"} onClick={() => setAlign(!align)}>
        <HandGrabbingIcon size={16} aria-hidden /> {compact ? "Line it up on the plan" : align ? "Done lining up" : "Drag the map to line it up"}
      </button>
      {view !== "plan" && <p className="field-note">Switch to Plan mode to drag the map.</p>}

      <div className="sp-nudge-row">
        <div className="sp-pad" role="group" aria-label="Move the map">
          {ARROWS.map((a) => (
            <button key={a.way} type="button" className="btn sp-arrow" style={{ gridArea: a.area }} aria-label={compact ? `Move the map ${a.way} ${big ? NUDGE_BIG_M : NUDGE_M} ${big ? "metres" : "metre"}` : `Move the map ${a.way} 1 metre (Shift: 5 metres)`} title={`Move the map ${a.way} 1 m. Hold Shift for 5 m.`} onClick={(e) => setSite(nudgeSite(site, bearing, a.way, e.shiftKey || big ? NUDGE_BIG_M : NUDGE_M))}>
              <a.Icon size={16} />
            </button>
          ))}
        </div>
        {compact ? <p className="field-note">{big ? "5 m" : "1 m"} a tap.</p> : <p className="field-note">1 m a click, 5 m with Shift held.</p>}
      </div>
      {compact && <Switch on={big} onChange={setBig} label="Move 5 m at a time" />}

      {site.layers.satellite && (
        <label className="field">
          <MonoLabel>Photo strength {Math.round(opacity * 100)}%</MonoLabel>
          <input type="range" min={10} max={90} step={5} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(+e.target.value / 100)} aria-label="Photo strength under the plan" />
        </label>
      )}

      <div className="sp-turn">
        <MonoLabel>Turn the plan</MonoLabel>
        <p className="hint">The top of your plan faces {compassWords(bearing)}. Pick where it really faces:</p>
        <div className="sp-turn-btns">
          <div className="seg sp-faces" role="group" aria-label="Direction the top of the plan faces">
            {FACES.map(([k, deg]) => (
              <button key={k} type="button" aria-pressed={bearing === deg} aria-label={`Top of the plan faces ${FACE_NAME[k]}`} onClick={() => setBearing(deg)}>{k}</button>
            ))}
          </div>
          <button type="button" className="btn sp-arrow" aria-label={`Turn the plan ${TURN_DEG} degrees counter-clockwise`} title={`Turn ${TURN_DEG} degrees counter-clockwise`} onClick={() => turn(-TURN_DEG)}><ArrowCounterClockwiseIcon size={16} /><span className="sp-turn-t">Left {TURN_DEG}°</span></button>
          <button type="button" className="btn sp-arrow" aria-label={`Turn the plan ${TURN_DEG} degrees clockwise`} title={`Turn ${TURN_DEG} degrees clockwise`} onClick={() => turn(TURN_DEG)}><ArrowClockwiseIcon size={16} /><span className="sp-turn-t">Right {TURN_DEG}°</span></button>
        </div>
      </div>

      <button type="button" className="btn sp-wide" disabled={!moved} onClick={() => setSite({ dx: 0, dy: 0 })}>Reset alignment</button>

      <details className="sp-adv">
        <summary>Advanced: exact numbers</summary>
        <div className="sp-adv-grid">
          <NumField label="Plan bearing" unit="deg" value={bearing} min={0} max={359} step={1} live={false} onChange={(v) => setBearing(v)} />
          <NumField label="Flat east of map centre" unit="m" value={site.dx} min={-500} max={500} step={0.1} live={false} onChange={(dx) => setSite({ dx })} />
          <NumField label="Flat south of map centre" unit="m" value={site.dy} min={-500} max={500} step={0.1} live={false} onChange={(dy) => setSite({ dy })} />
        </div>
        <p className="field-note">Bearing is the compass direction the top of the plan faces: 0 north, 90 east, 180 south, 270 west.</p>
      </details>
    </Block>
  );
}
