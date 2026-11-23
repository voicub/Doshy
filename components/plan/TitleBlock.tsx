import { openingTags, planStats, scaleDenominator } from "@/lib/blueprint";
import type { Level, Plan } from "@/lib/types";
import "./plan.css";

type Props = {
  /** The level being drawn. */
  plan: Plan;
  level: Level;
  levelNo: number;
  /** Metres per screen pixel of the current view. */
  px: number;
  /** Compass bearing of the plan's up direction (degrees clockwise from north). */
  bearing: number;
};

const fmt = (n: number) => n.toFixed(2);

/** Drawing frame and title block: project, level, scale, areas, north arrow and the door/window schedule, like the corner of a printed plan sheet. */
export default function TitleBlock({ plan, level, levelNo, px, bearing }: Props) {
  const stats = planStats(plan);
  const tags = openingTags(plan);
  const rows = plan.openings
    .filter((o) => tags[o.id])
    .map((o) => ({ id: o.id, tag: tags[o.id], size: `${fmt(o.width)} x ${fmt(o.height)}`, sill: o.type === "window" ? `sill ${fmt(o.sill)}` : "" }))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  return (
    <>
      <div className="bp-frame" aria-hidden="true" />
      <aside className="bp-title" aria-label="Drawing title block">
        <div className="bp-title-head">
          <b>DOSHY</b>
          <span>FLOOR PLAN</span>
          <svg className="bp-north" viewBox="-14 -14 28 28" role="img" aria-label={`North arrow, plan up is bearing ${Math.round(bearing)} degrees`}>
            <g transform={`rotate(${-bearing})`}>
              <circle r="12" fill="none" stroke="currentColor" strokeWidth="0.8" />
              <path d="M0 -11L3.5 4L0 1.5L-3.5 4Z" fill="currentColor" />
              <text y="-13.5" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none">N</text>
            </g>
          </svg>
        </div>
        <dl>
          <dt>Level</dt>
          <dd>{`${levelNo + 1} ${level.name.toUpperCase()}`}</dd>
          <dt>Floor</dt>
          <dd>{`${level.elevation >= 0 ? "+" : "-"}${Math.abs(level.elevation).toFixed(2)} m`}</dd>
          <dt>Scale</dt>
          <dd>{`1:${scaleDenominator(px)}`}</dd>
          <dt>Net area</dt>
          <dd>{`${fmt(stats.net)} m²`}</dd>
          <dt>Walls</dt>
          <dd>{`${fmt(stats.walls)} m²`}</dd>
          <dt>Units</dt>
          <dd>m, wall thickness cm</dd>
        </dl>
        {rows.length > 0 && (
          <ul className="bp-schedule" aria-label="Door and window schedule">
            {rows.map((r) => (
              <li key={r.id}>
                <b>{r.tag}</b>
                <span>{r.size}</span>
                <i>{r.sill}</i>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
